import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import oracle from 'oracledb';
import { DatabaseService } from '../database/database.service';
import { likePattern } from '../users/user-search.util';
import {
  PurchaseCatalogRepository,
  seatQuery,
} from './purchase-catalog.repository';
import {
  purchaseQuote,
  purchaseQrPayload,
  requireAvailableFunction,
  requireGuestEmailAvailable,
  requireGuestPurchaseAllowance,
  requireTicketAllowance,
  selectionHash,
  selectionPositions,
} from './purchase-rules';
import type { ConfirmPurchaseDto, ListPurchasesQueryDto } from './purchase.dto';
import type {
  PurchaseLine,
  PurchaseQuote,
  PurchaseFunction,
  PurchaseReceipt,
  PurchaseSeat,
  PurchasedTicket,
  GuestPurchaseReceipt,
} from './purchase.types';
import { ticketProductCode } from '../common/pricing/ticket-pricing';
import {
  guestPurchaseCode,
  guestPurchaseId,
  matchesGuestPurchaseCode,
} from './guest-purchase-access';
import type { UserStatus } from '../users/types/user-status.type';
import { TicketEmailRepository } from './ticket-email.repository';

type Buyer = { clientId: number } | { email: string };
function buyerScope(buyer: Buyer): { condition: string; binds: Binds } {
  return 'clientId' in buyer
    ? {
        condition: 'i.CLIENT_ID=:clientId',
        binds: { clientId: buyer.clientId },
      }
    : {
        condition: 'i.CLIENT_ID IS NULL AND i.BUYER_EMAIL=:email',
        binds: { email: buyer.email },
      };
}
type Binds = Exclude<oracle.BindParameters, unknown[]>;
const OPTIONS = { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: false };
const ZONE = 'America/Costa_Rica';
// Cancelled while any ticket is still on a cancelled function; invoices without
// linked tickets follow their original function.
const FUNCTION_CANCELLED = `CASE WHEN mf.STATUS='CANCELLED' AND (EXISTS (SELECT 1 FROM TICKETS rt JOIN MOVIE_FUNCTIONS cur ON cur.MOVIE_FUNCTION_ID=rt.MOVIE_FUNCTION_ID WHERE rt.INVOICE_ID=i.INVOICE_ID AND cur.STATUS='CANCELLED') OR NOT EXISTS (SELECT 1 FROM TICKETS rt WHERE rt.INVOICE_ID=i.INVOICE_ID)) THEN 1 ELSE 0 END`;
@Injectable()
export class PurchasesRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly catalog: PurchaseCatalogRepository,
    private readonly ticketEmails: TicketEmailRepository,
  ) {}
  private query<T>(
    sql: string,
    binds: Binds,
    connection?: oracle.Connection,
    json = false,
  ): Promise<oracle.Result<T>> {
    const options: oracle.ExecuteOptions = {
      ...OPTIONS,
      ...(json ? { fetchInfo: { contextJson: { type: oracle.STRING } } } : {}),
    };
    return connection
      ? connection.execute<T>(sql, binds, options)
      : this.db.query<T>(sql, binds, options);
  }
  private async previous(
    key: string,
    buyer: Buyer,
    connection?: oracle.Connection,
  ) {
    const scope = buyerScope(buyer);
    const result = await this.query<{ id: number; hash: string }>(
      `SELECT i.INVOICE_ID AS "id", i.REQUEST_HASH AS "hash" FROM INVOICES i WHERE i.REQUEST_KEY=:key AND ${scope.condition}`,
      { key, ...scope.binds },
      connection,
    );
    return result.rows?.[0];
  }
  private async replay(
    previous: { id: number; hash: string },
    hash: string,
    buyer: Buyer,
    connection?: oracle.Connection,
  ) {
    if (previous.hash !== hash)
      throw new ConflictException(
        'Esta referencia ya se utilizó para otra selección. Reinicia la compra.',
      );
    return this.readReceipt(previous.id, buyer, connection);
  }
  confirm(
    clientId: number,
    data: ConfirmPurchaseDto,
  ): Promise<PurchaseReceipt> {
    return this.confirmFor({ clientId }, data);
  }
  async confirmGuest(
    email: string,
    data: ConfirmPurchaseDto,
  ): Promise<GuestPurchaseReceipt> {
    const receipt = await this.confirmFor({ email }, data);
    return {
      ...receipt,
      accessCode: guestPurchaseCode(receipt.id, data.requestKey),
    };
  }
  private async confirmFor(
    buyer: Buyer,
    data: ConfirmPurchaseDto,
  ): Promise<PurchaseReceipt> {
    const hash = selectionHash(data);
    const positions = selectionPositions(data);
    try {
      return await this.db.transaction((connection) =>
        this.register(connection, buyer, data, hash, positions),
      );
    } catch (error) {
      return this.recoverFailure(error, buyer, data, hash);
    }
  }
  private async buyerEmail(
    connection: oracle.Connection,
    buyer: Buyer,
  ): Promise<string> {
    if (!('clientId' in buyer)) return buyer.email;
    const account = await connection.execute<{ STATUS: string; EMAIL: string }>(
      'SELECT STATUS,EMAIL FROM CLIENTS WHERE CLIENT_ID=:clientId FOR UPDATE WAIT 5',
      { clientId: buyer.clientId },
      OPTIONS,
    );
    if (account.rows?.[0]?.STATUS !== 'ACTIVE')
      throw new UnauthorizedException(
        'Tu sesión terminó. Inicia sesión nuevamente.',
      );
    return account.rows[0].EMAIL;
  }
  private async register(
    connection: oracle.Connection,
    buyer: Buyer,
    data: ConfirmPurchaseDto,
    hash: string,
    positions: number[],
  ) {
    await connection.execute('ALTER SESSION DISABLE PARALLEL DML', {}, OPTIONS);
    const email = await this.buyerEmail(connection, buyer);
    const previous = await this.previous(data.requestKey, buyer, connection);
    if (previous) return this.replay(previous, hash, buyer, connection);
    const locked = await connection.execute(
      'SELECT MOVIE_FUNCTION_ID FROM MOVIE_FUNCTIONS WHERE MOVIE_FUNCTION_ID=:id FOR UPDATE WAIT 5',
      { id: data.functionId },
      OPTIONS,
    );
    if (!locked.rows?.length)
      throw new NotFoundException('La función no existe.');
    if (!('clientId' in buyer)) {
      // A guest retry can wait for the first request to commit without sharing a client row lock.
      const committed = await this.previous(data.requestKey, buyer, connection);
      if (committed) return this.replay(committed, hash, buyer, connection);
      await this.requireGuestEmail(connection, email);
    }
    await this.requireBuyerAllowance(
      connection,
      buyer,
      data.functionId,
      positions.length,
    );
    const context = await this.catalog.getFunction(data.functionId, connection);
    requireAvailableFunction(context);
    await connection.execute(
      'SELECT THEATER_ID FROM THEATERS WHERE THEATER_ID=:id FOR UPDATE WAIT 5',
      { id: context.theaterId },
      OPTIONS,
    );
    const quote = purchaseQuote(
      context,
      await this.lockSeats(connection, context, positions),
      data,
    );
    if (quote.version !== data.quoteVersion)
      throw new ConflictException({
        code: 'QUOTE_CHANGED',
        message:
          'Los datos o el precio de la función cambiaron. Revisa el resumen actualizado antes de pagar.',
      });
    const id = await this.writePurchase(
      connection,
      'clientId' in buyer ? buyer.clientId : null,
      email,
      data,
      hash,
      quote,
    );
    requireAvailableFunction(
      await this.catalog.getFunction(context.id, connection),
    );
    await this.ticketEmails.enqueueInitial(connection, id, email);
    return this.readReceipt(id, buyer, connection);
  }
  private async requireGuestEmail(
    connection: oracle.Connection,
    email: string,
  ) {
    const registered = await connection.execute<{
      status: UserStatus;
      verificationPending: number;
    }>(
      `SELECT c.STATUS AS "status", CASE WHEN EXISTS (SELECT 1 FROM CLIENT_EMAIL_VERIFICATIONS v WHERE v.CLIENT_ID=c.CLIENT_ID) THEN 1 ELSE 0 END AS "verificationPending" FROM CLIENTS c WHERE c.EMAIL=:email AND ROWNUM=1`,
      { email },
      OPTIONS,
    );
    const account = registered.rows?.[0];
    requireGuestEmailAvailable(
      account
        ? {
            status: account.status,
            verificationPending: account.verificationPending === 1,
          }
        : null,
    );
  }
  // The function row lock taken by the caller serializes purchases of this function.
  private async requireBuyerAllowance(
    connection: oracle.Connection,
    buyer: Buyer,
    functionId: number,
    requested: number,
  ) {
    const scope = buyerScope(buyer);
    const limits = await this.catalog.getLimits(connection);
    const owned = await connection.execute<{ TOTAL: number }>(
      `SELECT COUNT(*) AS TOTAL FROM TICKETS tk JOIN INVOICES i ON i.INVOICE_ID=tk.INVOICE_ID WHERE tk.MOVIE_FUNCTION_ID=:functionId AND i.STATUS='PAID' AND ${scope.condition}`,
      { functionId, ...scope.binds },
      OPTIONS,
    );
    requireTicketAllowance(
      owned.rows?.[0]?.TOTAL ?? 0,
      requested,
      limits.maxTickets,
    );
    if ('clientId' in buyer) return;
    const recent = await connection.execute<{ TOTAL: number }>(
      `SELECT COUNT(*) AS TOTAL FROM INVOICES i WHERE ${scope.condition} AND i.CREATED_AT > SYSTIMESTAMP - INTERVAL '1' HOUR`,
      scope.binds,
      OPTIONS,
    );
    requireGuestPurchaseAllowance(
      recent.rows?.[0]?.TOTAL ?? 0,
      limits.maxGuestPurchases,
    );
  }
  private async recoverFailure(
    error: unknown,
    buyer: Buyer,
    data: ConfirmPurchaseDto,
    hash: string,
  ): Promise<PurchaseReceipt> {
    const failure = error as { errorNum?: number } | null;
    if (failure?.errorNum === 1) {
      const previous = await this.previous(data.requestKey, buyer);
      if (previous) return this.replay(previous, hash, buyer);
      throw new ConflictException({
        code: 'SEATS_UNAVAILABLE',
        message: 'Uno de los asientos ya fue comprado. Actualiza tu selección.',
      });
    }
    if ([54, 30006, 60].includes(failure?.errorNum ?? 0))
      throw new ConflictException({
        code: 'PURCHASE_BUSY',
        message:
          'Otra operación está actualizando la disponibilidad. Intenta nuevamente con la misma selección.',
      });
    throw error;
  }
  private async lockSeats(
    connection: oracle.Connection,
    context: PurchaseFunction,
    positions: number[],
  ) {
    const seats: PurchaseSeat[] = [];
    const offsets = Array.from(
      { length: Math.ceil(positions.length / 1000) },
      (_, index) => index * 1000,
    );
    await offsets.reduce(async (previous, offset) => {
      await previous;
      const batch = positions.slice(offset, offset + 1000);
      const binds: Binds = {
        columns: context.columns,
        theaterId: context.theaterId,
        functionId: context.id,
      };
      batch.forEach((position, index) => {
        binds['p' + index] = position;
      });
      const result = await connection.execute<PurchaseSeat>(
        seatQuery(batch),
        binds,
        OPTIONS,
      );
      seats.push(...(result.rows ?? []));
    }, Promise.resolve());
    return seats;
  }
  private async writePurchase(
    connection: oracle.Connection,
    clientId: number | null,
    buyerEmail: string,
    data: ConfirmPurchaseDto,
    hash: string,
    quote: PurchaseQuote,
  ) {
    const productBinds = Object.fromEntries(
      quote.lines.map((line, index) => ['code' + index, line.code]),
    );
    const products = await connection.execute<{ id: number; code: string }>(
      `SELECT PRODUCT_ID AS "id", CODE AS "code" FROM PRODUCTS WHERE PRODUCT_TYPE='TICKET' AND CODE IN (${quote.lines.map((_line, index) => ':code' + index).join(',')})`,
      productBinds,
      OPTIONS,
    );
    const productIds = new Map(
      (products.rows ?? []).map((product) => [product.code, product.id]),
    );
    if (productIds.size !== quote.lines.length)
      throw new ServiceUnavailableException(
        'No se pudieron preparar los boletos. Intenta nuevamente.',
      );
    const context = quote.function;
    const invoice = await connection.execute(
      `INSERT INTO INVOICES (CLIENT_ID,MOVIE_FUNCTION_ID,STATUS,PAYMENT_METHOD,TOTAL,REQUEST_KEY,REQUEST_HASH,BUYER_EMAIL,PURCHASE_CONTEXT) VALUES (:clientId,:functionId,'PAID','SIMULATED',:total,:key,:hash,:email,:context) RETURNING INVOICE_ID INTO :id`,
      {
        clientId,
        functionId: context.id,
        total: quote.total,
        key: data.requestKey,
        hash,
        email: buyerEmail,
        context: {
          val: JSON.stringify({ function: context, lines: quote.lines }),
          type: oracle.CLOB,
        },
        id: { dir: oracle.BIND_OUT, type: oracle.NUMBER },
      },
      OPTIONS,
    );
    const id = (invoice.outBinds as { id: number[] }).id[0];
    const lines = await connection.executeMany(
      'INSERT INTO INVOICE_PRODUCTS (INVOICE_ID,PRODUCT_ID,QUANTITY,UNIT_PRICE) VALUES (:invoiceId,:productId,:quantity,:price)',
      quote.lines.map((line) => ({
        invoiceId: id,
        productId: productIds.get(line.code)!,
        quantity: line.quantity,
        price: line.unitPrice,
      })),
      {
        autoCommit: false,
        batchErrors: false,
        bindDefs: {
          invoiceId: { type: oracle.NUMBER },
          productId: { type: oracle.NUMBER },
          quantity: { type: oracle.NUMBER },
          price: { type: oracle.NUMBER },
        },
      },
    );
    if (lines.rowsAffected !== quote.lines.length)
      throw new Error('Incomplete purchase lines.');
    const tickets = await connection.executeMany(
      'INSERT INTO TICKETS (MOVIE_FUNCTION_ID,THEATER_ID,SEAT_ROW,SEAT_COLUMN,INVOICE_ID,PRODUCT_ID) VALUES (:functionId,:theaterId,:rowNumber,:columnNumber,:invoiceId,:productId)',
      quote.seats.map((seat) => ({
        functionId: context.id,
        theaterId: context.theaterId,
        rowNumber: seat.rowNumber,
        columnNumber: seat.columnNumber,
        invoiceId: id,
        productId: productIds.get(
          ticketProductCode(seat.category, seat.type === 'vip'),
        )!,
      })),
      {
        autoCommit: false,
        batchErrors: false,
        bindDefs: {
          functionId: { type: oracle.NUMBER },
          theaterId: { type: oracle.NUMBER },
          rowNumber: { type: oracle.NUMBER },
          columnNumber: { type: oracle.NUMBER },
          invoiceId: { type: oracle.NUMBER },
          productId: { type: oracle.NUMBER },
        },
      },
    );
    if (tickets.rowsAffected !== quote.quantity)
      throw new Error('Incomplete purchase tickets.');
    return id;
  }
  async findOne(
    id: number,
    clientId: number,
    connection?: oracle.Connection,
  ): Promise<PurchaseReceipt> {
    return this.readReceipt(id, { clientId }, connection);
  }
  async findGuest(code: string): Promise<GuestPurchaseReceipt> {
    const id = guestPurchaseId(code);
    if (id === null)
      throw new NotFoundException(
        'No se encontró una compra con ese código de consulta.',
      );
    const result = await this.query<{ requestKey: string; email: string }>(
      `SELECT REQUEST_KEY AS "requestKey", BUYER_EMAIL AS "email" FROM INVOICES WHERE INVOICE_ID=:id AND CLIENT_ID IS NULL AND REQUEST_KEY IS NOT NULL AND STATUS IN ('PAID','CANCELLED')`,
      { id },
    );
    const row = result.rows?.[0];
    if (!row || !matchesGuestPurchaseCode(code, id, row.requestKey))
      throw new NotFoundException(
        'No se encontró una compra con ese código de consulta.',
      );
    const receipt = await this.readReceipt(id, { email: row.email });
    return { ...receipt, accessCode: guestPurchaseCode(id, row.requestKey) };
  }
  async findForEmail(
    id: number,
  ): Promise<{ receipt: PurchaseReceipt; accessCode?: string }> {
    const result = await this.db.query<{
      clientId: number | null;
      email: string;
      requestKey: string;
    }>(
      `SELECT CLIENT_ID AS "clientId",BUYER_EMAIL AS "email",REQUEST_KEY AS "requestKey" FROM INVOICES WHERE INVOICE_ID=:id AND STATUS='PAID'`,
      { id },
    );
    const buyer = result.rows?.[0];
    if (!buyer)
      throw new NotFoundException(
        'No se pueden enviar los boletos de esta compra.',
      );
    const receipt = await this.readReceipt(
      id,
      buyer.clientId === null
        ? { email: buyer.email }
        : { clientId: buyer.clientId },
    );
    if (!receipt.tickets.length)
      throw new NotFoundException('Esta compra no tiene boletos disponibles.');
    return {
      receipt,
      ...(buyer.clientId === null
        ? { accessCode: guestPurchaseCode(id, buyer.requestKey) }
        : {}),
    };
  }

  private async readReceipt(
    id: number,
    buyer: Buyer,
    connection?: oracle.Connection,
  ): Promise<PurchaseReceipt> {
    const scope = buyerScope(buyer);
    const header = await this.query<{
      id: number;
      functionId: number;
      purchasedAt: string;
      status: string;
      buyerEmail: string;
      functionCancelled: number;
      paymentMethod: PurchaseReceipt['paymentMethod'];
      cardBrand: string | null;
      cardLast4: string | null;
      total: number;
      contextJson: string | null;
    }>(
      `SELECT i.INVOICE_ID AS "id", i.MOVIE_FUNCTION_ID AS "functionId", TO_CHAR(i.CREATED_AT AT TIME ZONE 'America/Costa_Rica','YYYY-MM-DD"T"HH24:MI:SS') || '-06:00' AS "purchasedAt", i.STATUS AS "status", NVL(i.BUYER_EMAIL,c.EMAIL) AS "buyerEmail", ${FUNCTION_CANCELLED} AS "functionCancelled", i.PAYMENT_METHOD AS "paymentMethod", i.CARD_BRAND AS "cardBrand", i.CARD_LAST4 AS "cardLast4", i.TOTAL AS "total", i.PURCHASE_CONTEXT AS "contextJson" FROM INVOICES i LEFT JOIN CLIENTS c ON c.CLIENT_ID=i.CLIENT_ID JOIN MOVIE_FUNCTIONS mf ON mf.MOVIE_FUNCTION_ID=i.MOVIE_FUNCTION_ID WHERE i.INVOICE_ID=:id AND ${scope.condition} AND i.STATUS IN ('PAID','CANCELLED')`,
      { id, ...scope.binds },
      connection,
      true,
    );
    const row = header.rows?.[0];
    if (!row)
      throw new NotFoundException(
        'La compra no existe o no pertenece a tu cuenta.',
      );
    const snapshot = row.contextJson
      ? (JSON.parse(row.contextJson) as {
          function: PurchaseReceipt['function'];
          lines: PurchaseLine[];
        })
      : null;
    const context =
      snapshot?.function ??
      (await this.catalog.getFunction(row.functionId, connection));
    if (!context)
      throw new NotFoundException(
        'No se pudo consultar la función de esta compra.',
      );
    let lines = snapshot?.lines;
    // Invoices without a snapshot may also carry food, which the total includes.
    if (!lines) {
      const result = await this.query<{
        code: string;
        label: string;
        quantity: number;
        unitPrice: number;
      }>(
        `SELECT NVL(p.CODE,'PRODUCT_' || p.PRODUCT_ID) AS "code",p.NAME AS "label",ip.QUANTITY AS "quantity",ip.UNIT_PRICE AS "unitPrice" FROM INVOICE_PRODUCTS ip JOIN PRODUCTS p ON p.PRODUCT_ID=ip.PRODUCT_ID WHERE ip.INVOICE_ID=:id ORDER BY p.PRODUCT_TYPE DESC,p.PRODUCT_ID`,
        { id },
        connection,
      );
      lines = (result.rows ?? []).map((line) => ({
        ...line,
        category: 'GENERAL',
        vip: line.code.endsWith('_VIP'),
        base: line.unitPrice,
        modifiers: [],
        subtotal: line.quantity * line.unitPrice,
      }));
    }
    const tickets = await this.query<PurchasedTicket>(
      `SELECT tk.TICKETS_ID AS "id",tk.SEAT_ROW AS "rowNumber",tk.SEAT_COLUMN AS "columnNumber",tk.THEATER_ID AS "theaterId",tk.MOVIE_FUNCTION_ID AS "functionId",m.TITLE AS "title",c.NAME AS "branchName",TO_CHAR(mf.START_TIME,'YYYY-MM-DD"T"HH24:MI:SS') || '-06:00' AS "startsAt",mf.STATUS AS "functionStatus",ip.UNIT_PRICE AS "unitPrice",CASE WHEN p.CODE LIKE 'TICKET_CHILD_%' THEN 'CHILD' WHEN p.CODE LIKE 'TICKET_SENIOR_%' THEN 'SENIOR' ELSE 'GENERAL' END AS "category" FROM TICKETS tk JOIN MOVIE_FUNCTIONS mf ON mf.MOVIE_FUNCTION_ID=tk.MOVIE_FUNCTION_ID JOIN MOVIES m ON m.MOVIE_ID=mf.MOVIE_ID JOIN THEATERS th ON th.THEATER_ID=tk.THEATER_ID JOIN CINEMAS c ON c.BRANCH_ID=th.BRANCH_ID JOIN INVOICE_PRODUCTS ip ON ip.INVOICE_ID=tk.INVOICE_ID AND ip.PRODUCT_ID=tk.PRODUCT_ID JOIN PRODUCTS p ON p.PRODUCT_ID=tk.PRODUCT_ID WHERE tk.INVOICE_ID=:id ORDER BY tk.SEAT_ROW,tk.SEAT_COLUMN,tk.TICKETS_ID`,
      { id },
      connection,
    );
    return {
      id: row.id,
      reference: `ORD-${String(row.id).padStart(6, '0')}`,
      qrPayload: purchaseQrPayload(`ORD-${String(row.id).padStart(6, '0')}`),
      purchasedAt: row.purchasedAt,
      status: row.status,
      buyerEmail: row.buyerEmail,
      functionCancelled: row.functionCancelled === 1,
      paymentMethod: row.paymentMethod,
      cardBrand: row.cardBrand,
      cardLast4: row.cardLast4,
      total: row.total,
      function: context,
      lines,
      tickets: tickets.rows ?? [],
    };
  }
  async list(clientId: number, query: ListPurchasesQueryDto) {
    const binds: Binds = { clientId };
    const conditions = [
      'i.CLIENT_ID=:clientId',
      "i.STATUS IN ('PAID','CANCELLED')",
    ];
    if (query.search) {
      binds.search = likePattern(query.search);
      conditions.push(
        String.raw`LOWER('ORD-' || LPAD(i.INVOICE_ID,6,'0')) LIKE :search ESCAPE '\'`,
      );
    }
    if (query.dateFrom) {
      binds.dateFrom = query.dateFrom;
      conditions.push(
        `i.CREATED_AT >= FROM_TZ(TO_TIMESTAMP(:dateFrom,'YYYY-MM-DD'),'${ZONE}')`,
      );
    }
    if (query.dateTo) {
      binds.dateTo = query.dateTo;
      conditions.push(
        `i.CREATED_AT < FROM_TZ(TO_TIMESTAMP(:dateTo,'YYYY-MM-DD'),'${ZONE}') + INTERVAL '1' DAY`,
      );
    }
    const where = conditions.join(' AND ');
    const count = await this.db.query<{ TOTAL: number }>(
      `SELECT COUNT(*) AS TOTAL FROM INVOICES i WHERE ${where}`,
      binds,
    );
    const total = count.rows?.[0]?.TOTAL ?? 0;
    const totalPages = Math.ceil(total / 10);
    const page = Math.min(query.page, Math.max(1, totalPages));
    const result = await this.query<{
      id: number;
      purchasedAt: string;
      status: string;
      total: number;
      title: string;
      startsAt: string;
      quantity: number;
      functionCancelled: number;
    }>(
      `SELECT i.INVOICE_ID AS "id",TO_CHAR(i.CREATED_AT AT TIME ZONE 'America/Costa_Rica','YYYY-MM-DD"T"HH24:MI:SS') || '-06:00' AS "purchasedAt",i.STATUS AS "status",i.TOTAL AS "total",${FUNCTION_CANCELLED} AS "functionCancelled",COALESCE(JSON_VALUE(i.PURCHASE_CONTEXT,'$.function.title'),m.TITLE) AS "title",COALESCE(JSON_VALUE(i.PURCHASE_CONTEXT,'$.function.startsAt'),TO_CHAR(mf.START_TIME,'YYYY-MM-DD"T"HH24:MI:SS') || '-06:00') AS "startsAt",(SELECT NVL(SUM(ip.QUANTITY),0) FROM INVOICE_PRODUCTS ip JOIN PRODUCTS p ON p.PRODUCT_ID=ip.PRODUCT_ID WHERE ip.INVOICE_ID=i.INVOICE_ID AND p.PRODUCT_TYPE='TICKET') AS "quantity" FROM INVOICES i JOIN MOVIE_FUNCTIONS mf ON mf.MOVIE_FUNCTION_ID=i.MOVIE_FUNCTION_ID JOIN MOVIES m ON m.MOVIE_ID=mf.MOVIE_ID WHERE ${where} ORDER BY i.CREATED_AT DESC,i.INVOICE_ID DESC OFFSET :offset ROWS FETCH NEXT 10 ROWS ONLY`,
      { ...binds, offset: (page - 1) * 10 },
    );
    return {
      items: (result.rows ?? []).map((row) => ({
        ...row,
        functionCancelled: row.functionCancelled === 1,
        reference: `ORD-${String(row.id).padStart(6, '0')}`,
      })),
      page,
      total,
      totalPages,
    };
  }
}
