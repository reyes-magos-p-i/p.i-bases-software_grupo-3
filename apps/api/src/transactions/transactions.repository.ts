import { Injectable } from '@nestjs/common';
import oracle from 'oracledb';
import { DatabaseService } from '../database/database.service';
import { likePattern } from '../users/user-search.util';
import type { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import type {
  ListedTransactionDto,
  ListedTransactionsDto,
  TransactionFilterOptionsDto,
  TransactionStatus,
} from './dto/listed-transactions.dto';

// Search ignores case and accents: "volcan" finds "Ecos del Volcán".
const ACCENTED = 'áéíóúüñ';
const PLAIN = 'aeiouun';
const foldSql = (column: string) =>
  `TRANSLATE(LOWER(${column}), '${ACCENTED}', '${PLAIN}')`;
const fold = (value: string) =>
  value
    .toLowerCase()
    .replace(/[áéíóúüñ]/gu, (letter) => PLAIN[ACCENTED.indexOf(letter)]);

// "FAC-000123", "fac123", "000123" and "123" all point to invoice 123.
const INVOICE_ID_SEARCH = /^(?:fac-?)?(\d{1,15})$/iu;

const ZONE = 'America/Costa_Rica';
// Oracle concatenates NULL as '', so missing name parts leave only spaces.
const CLIENT_NAME = `TRIM(REGEXP_REPLACE(c.FIRST_NAME || ' ' || c.SECOND_NAME || ' ' || c.FIRST_SURNAME || ' ' || c.SECOND_SURNAME, ' +', ' '))`;

// Paid and cancelled invoices with their client, function, movie and branch.
const TRANSACTIONS = `FROM INVOICES i
       JOIN CLIENTS c ON c.CLIENT_ID = i.CLIENT_ID
       JOIN MOVIE_FUNCTIONS f ON f.MOVIE_FUNCTION_ID = i.MOVIE_FUNCTION_ID
       JOIN MOVIES m ON m.MOVIE_ID = f.MOVIE_ID
       JOIN THEATERS t ON t.THEATER_ID = f.THEATER_ID
       JOIN CINEMAS b ON b.BRANCH_ID = t.BRANCH_ID
       WHERE i.STATUS IN ('PAID', 'CANCELLED')`;

const TRANSACTION_COLUMNS = `i.INVOICE_ID AS ID,
       TO_CHAR(i.CREATED_AT AT TIME ZONE '${ZONE}', 'YYYY-MM-DD"T"HH24:MI') AS PURCHASED_AT,
       ${CLIENT_NAME} AS CLIENT_NAME, c.EMAIL AS CLIENT_EMAIL,
       m.TITLE AS MOVIE_TITLE, TRIM(b.NAME) AS BRANCH_NAME, f.THEATER_ID,
       TO_CHAR(f.START_TIME, 'YYYY-MM-DD"T"HH24:MI') AS FUNCTION_START,
       (SELECT NVL(SUM(l.QUANTITY), 0)
          FROM INVOICE_PRODUCTS l
          JOIN PRODUCTS p ON p.PRODUCT_ID = l.PRODUCT_ID
         WHERE l.INVOICE_ID = i.INVOICE_ID AND p.PRODUCT_TYPE = 'TICKET') AS TICKETS,
       i.TOTAL, i.STATUS`;

export interface TransactionRow {
  ID: number;
  PURCHASED_AT: string;
  CLIENT_NAME: string;
  CLIENT_EMAIL: string;
  MOVIE_TITLE: string;
  BRANCH_NAME: string | null;
  THEATER_ID: number;
  FUNCTION_START: string;
  TICKETS: number;
  TOTAL: number;
  STATUS: TransactionStatus;
}

export const toTransaction = (row: TransactionRow): ListedTransactionDto => ({
  id: row.ID,
  purchasedAt: row.PURCHASED_AT,
  clientName: row.CLIENT_NAME,
  clientEmail: row.CLIENT_EMAIL,
  movieTitle: row.MOVIE_TITLE,
  branchName: row.BRANCH_NAME,
  theaterId: row.THEATER_ID,
  functionStart: row.FUNCTION_START,
  tickets: row.TICKETS,
  total: row.TOTAL,
  status: row.STATUS,
});

@Injectable()
export class TransactionsRepository {
  constructor(private readonly db: DatabaseService) {}

  async listTransactions(
    query: ListTransactionsQueryDto,
  ): Promise<ListedTransactionsDto> {
    const binds: Exclude<oracle.BindParameters, unknown[]> = {};
    const conditions: string[] = [];
    if (query.search) {
      binds.search = {
        val: likePattern(fold(query.search)),
        type: oracle.STRING,
      };
      const byText = String.raw`(${foldSql(CLIENT_NAME)} LIKE :search ESCAPE '\'
            OR LOWER(c.EMAIL) LIKE :search ESCAPE '\'
            OR ${foldSql('m.TITLE')} LIKE :search ESCAPE '\'`;
      const id = INVOICE_ID_SEARCH.exec(query.search)?.[1];
      if (id && Number.isSafeInteger(Number(id))) {
        binds.invoiceId = { val: Number(id), type: oracle.NUMBER };
        conditions.push(`${byText} OR i.INVOICE_ID = :invoiceId)`);
      } else {
        conditions.push(`${byText})`);
      }
    }
    if (query.branchId !== undefined) {
      binds.branchId = { val: query.branchId, type: oracle.NUMBER };
      conditions.push('t.BRANCH_ID = :branchId');
    }
    if (query.movieId !== undefined) {
      binds.movieId = { val: query.movieId, type: oracle.NUMBER };
      conditions.push('f.MOVIE_ID = :movieId');
    }
    if (query.status) {
      binds.status = { val: query.status, type: oracle.STRING };
      conditions.push('i.STATUS = :status');
    }
    if (query.dateFrom) {
      binds.dateFrom = { val: query.dateFrom, type: oracle.STRING };
      conditions.push(
        `i.CREATED_AT >= FROM_TZ(TO_TIMESTAMP(:dateFrom, 'YYYY-MM-DD'), '${ZONE}')`,
      );
    }
    if (query.dateTo) {
      binds.dateTo = { val: query.dateTo, type: oracle.STRING };
      conditions.push(
        `i.CREATED_AT < FROM_TZ(TO_TIMESTAMP(:dateTo, 'YYYY-MM-DD'), '${ZONE}') + INTERVAL '1' DAY`,
      );
    }
    const from = [TRANSACTIONS, ...conditions].join('\n       AND ');
    const count = await this.db.query<{ TOTAL: number }>(
      `SELECT COUNT(*) AS TOTAL ${from}`,
      binds,
    );
    const total = count.rows?.[0]?.TOTAL ?? 0;
    const totalPages = Math.ceil(total / query.pageSize);
    const page = Math.min(query.page, Math.max(1, totalPages));
    if (total === 0)
      return { items: [], total, page, pageSize: query.pageSize, totalPages };
    const result = await this.db.query<TransactionRow>(
      `SELECT ${TRANSACTION_COLUMNS}
       ${from}
       ORDER BY i.CREATED_AT DESC, i.INVOICE_ID DESC
       OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
      {
        ...binds,
        offset: { val: (page - 1) * query.pageSize, type: oracle.NUMBER },
        pageSize: { val: query.pageSize, type: oracle.NUMBER },
      },
    );
    return {
      items: (result.rows ?? []).map(toTransaction),
      total,
      page,
      pageSize: query.pageSize,
      totalPages,
    };
  }

  /** Branches and movies that appear in at least one transaction. */
  async listFilterOptions(): Promise<TransactionFilterOptionsDto> {
    const branches = await this.db.query<{ ID: number; NAME: string | null }>(
      `SELECT DISTINCT b.BRANCH_ID AS ID, TRIM(b.NAME) AS NAME
       ${TRANSACTIONS}
       ORDER BY NAME NULLS LAST, ID`,
    );
    const movies = await this.db.query<{ ID: number; TITLE: string }>(
      `SELECT DISTINCT m.MOVIE_ID AS ID, m.TITLE
       ${TRANSACTIONS}
       ORDER BY TITLE, ID`,
    );
    return {
      branches: (branches.rows ?? []).map((row) => ({
        id: row.ID,
        name: row.NAME,
      })),
      movies: (movies.rows ?? []).map((row) => ({
        id: row.ID,
        title: row.TITLE,
      })),
    };
  }
}
