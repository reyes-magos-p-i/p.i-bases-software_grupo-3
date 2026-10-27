import { Injectable, Logger } from '@nestjs/common';
import oracle from 'oracledb';
import { DatabaseService } from '../../database/database.service';
import { Cinema } from '../entities/cinema.entity';
import { likePattern } from '../../users/user-search.util';
import type { CinemaDetailDto, CinemaStatus } from '../dto/cinema-detail.dto';
import type { ListCinemasQueryDto } from '../dto/list-cinemas-query.dto';
import type { CreateCinemaDto } from '../dto/create-cinema.dto';
import type {
  CompanyOptionDto,
  ListedCinemasDto,
} from '../dto/listed-cinemas.dto';

// Search ignores case and accents: "ramon" finds "San Ramón".
const ACCENTED = 'áéíóúüñ';
const PLAIN = 'aeiouun';
const foldSql = (column: string) =>
  `TRANSLATE(LOWER(${column}), '${ACCENTED}', '${PLAIN}')`;
const fold = (value: string) =>
  value
    .toLowerCase()
    .replace(/[áéíóúüñ]/gu, (letter) => PLAIN[ACCENTED.indexOf(letter)]);

// The unique index of 20261027_cinemas_active_name.sql backs nameIsTaken when two
// requests save the same name at once.
const isTakenName = (error: unknown) => {
  const failure = error as { errorNum?: number; message?: string } | null;
  return (
    failure?.errorNum === 1 &&
    /\bUX_CINEMAS_ACTIVE_NAME\b/iu.test(failure.message ?? '')
  );
};

// "SU-001", "su001", "001" and "1" all point to branch 1.
const BRANCH_ID_SEARCH = /^(?:su-?)?(\d{1,15})$/iu;

@Injectable()
export class CinemasRepository {
  private readonly logger = new Logger(CinemasRepository.name);

  constructor(private readonly db: DatabaseService) {}

  // Every branch, for the selectors of other sections (e.g. Salas).
  async getAllCinemas(): Promise<Cinema[]> {
    try {
      const result = await this.db.query(`
        SELECT branch_id, name, company_id
        FROM Cinemas
        ORDER BY name
      `);
      this.logger.log(
        `Fetched ${result.rows?.length ?? 0} cinemas from the database.`,
      );
      this.logger.debug(`Database query result: ${JSON.stringify(result)}`);

      const rows = (result.rows ?? []) as {
        BRANCH_ID: number;
        NAME: string;
        COMPANY_ID: number;
      }[];

      return rows.map((row) => ({
        branchId: row.BRANCH_ID,
        name: row.NAME,
        companyId: row.COMPANY_ID,
      }));
    } catch (error) {
      this.logger.error('Error fetching cinemas', error as Error);
      throw error;
    }
  }

  async listCinemas(query: ListCinemasQueryDto): Promise<ListedCinemasDto> {
    const binds: Exclude<oracle.BindParameters, unknown[]> = {};
    const conditions = ["c.STATUS = 'ACTIVE'"];
    if (query.search) {
      binds.search = {
        val: likePattern(fold(query.search)),
        type: oracle.STRING,
      };
      const byName = String.raw`${foldSql('c.NAME')} LIKE :search ESCAPE '\'`;
      const id = BRANCH_ID_SEARCH.exec(query.search)?.[1];
      if (id && Number.isSafeInteger(Number(id))) {
        binds.branchId = { val: Number(id), type: oracle.NUMBER };
        conditions.push(`(${byName} OR c.BRANCH_ID = :branchId)`);
      } else {
        conditions.push(byName);
      }
    }
    if (query.companyId !== undefined) {
      binds.companyId = { val: query.companyId, type: oracle.NUMBER };
      conditions.push('c.COMPANY_ID = :companyId');
    }
    const from = `FROM CINEMAS c JOIN COMPANIES p ON p.COMPANY_ID = c.COMPANY_ID
       WHERE ${conditions.join(' AND ')}`;
    const count = await this.db.query<{ TOTAL: number }>(
      `SELECT COUNT(*) AS TOTAL ${from}`,
      binds,
    );
    const total = count.rows?.[0]?.TOTAL ?? 0;
    const totalPages = Math.ceil(total / query.pageSize);
    const page = Math.min(query.page, Math.max(1, totalPages));
    if (total === 0)
      return { items: [], total, page, pageSize: query.pageSize, totalPages };
    // Oracle stores '' as NULL, so TRIM turns a name of only spaces into NULL.
    const result = await this.db.query<{
      ID: number;
      NAME: string | null;
      COMPANY_ID: number;
      COMPANY_NAME: string | null;
    }>(
      `SELECT c.BRANCH_ID AS ID, TRIM(c.NAME) AS NAME, c.COMPANY_ID,
              TRIM(p.NAME) AS COMPANY_NAME
       ${from}
       ORDER BY c.BRANCH_ID
       OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
      {
        ...binds,
        offset: { val: (page - 1) * query.pageSize, type: oracle.NUMBER },
        pageSize: { val: query.pageSize, type: oracle.NUMBER },
      },
    );
    return {
      items: (result.rows ?? []).map((row) => ({
        id: row.ID,
        name: row.NAME,
        companyId: row.COMPANY_ID,
        companyName: row.COMPANY_NAME,
      })),
      total,
      page,
      pageSize: query.pageSize,
      totalPages,
    };
  }

  async findCinemaById(id: number): Promise<CinemaDetailDto | null> {
    const result = await this.db.query<{
      ID: number;
      NAME: string | null;
      COMPANY_ID: number;
      COMPANY_NAME: string | null;
      STATUS: CinemaStatus;
    }>(
      `SELECT c.BRANCH_ID AS ID, TRIM(c.NAME) AS NAME, c.COMPANY_ID,
              TRIM(p.NAME) AS COMPANY_NAME, c.STATUS
       FROM CINEMAS c JOIN COMPANIES p ON p.COMPANY_ID = c.COMPANY_ID
       WHERE c.BRANCH_ID = :id`,
      { id: { val: id, type: oracle.NUMBER } },
    );
    const row = result.rows?.[0];
    if (!row) return null;
    return {
      id: row.ID,
      name: row.NAME,
      companyId: row.COMPANY_ID,
      companyName: row.COMPANY_NAME,
      status: row.STATUS,
    };
  }

  /** Creates an active branch, unless the company is unusable or the name is taken. */
  async createCinema(
    data: CreateCinemaDto,
  ): Promise<number | 'company' | 'duplicate'> {
    return this.db.transaction(async (connection) => {
      if (!(await this.companyIsUsable(connection, data.companyId)))
        return 'company';
      if (await this.nameIsTaken(connection, data.name)) return 'duplicate';
      let result: oracle.Result<{ id?: unknown }>;
      try {
        result = await connection.execute<{ id?: unknown }>(
          `INSERT INTO CINEMAS (NAME, COMPANY_ID)
           VALUES (:name, :companyId)
           RETURNING BRANCH_ID INTO :id`,
          {
            name: { val: data.name, type: oracle.STRING },
            companyId: { val: data.companyId, type: oracle.NUMBER },
            id: { dir: oracle.BIND_OUT, type: oracle.NUMBER },
          },
          { autoCommit: false },
        );
      } catch (error) {
        if (isTakenName(error)) return 'duplicate';
        throw error;
      }
      const ids = result.outBinds?.id;
      const id: unknown = Array.isArray(ids) ? ids[0] : undefined;
      if (result.rowsAffected !== 1 || typeof id !== 'number')
        throw new Error('Oracle did not return a single created branch.');
      return id;
    });
  }

  // A company without a name cannot be told apart in the form, so it is not accepted.
  private async companyIsUsable(
    connection: oracle.Connection,
    companyId: number,
  ): Promise<boolean> {
    const company = await connection.execute(
      `SELECT 1 FROM COMPANIES
       WHERE COMPANY_ID = :companyId AND TRIM(NAME) IS NOT NULL`,
      { companyId: { val: companyId, type: oracle.NUMBER } },
      { autoCommit: false },
    );
    return !!company.rows?.length;
  }

  // Two active branches cannot share a name, ignoring case and accents. Inactive
  // branches do not count, so a deactivated branch frees its name.
  private async nameIsTaken(
    connection: oracle.Connection,
    name: string,
  ): Promise<boolean> {
    const taken = await connection.execute(
      `SELECT 1 FROM CINEMAS
       WHERE STATUS = 'ACTIVE'
         AND ${foldSql('TRIM(NAME)')} = ${foldSql(':name')}
         AND ROWNUM = 1`,
      { name: { val: name, type: oracle.STRING } },
      { autoCommit: false },
    );
    return !!taken.rows?.length;
  }

  async listCompanies(): Promise<CompanyOptionDto[]> {
    const result = await this.db.query<{ ID: number; NAME: string | null }>(
      `SELECT COMPANY_ID AS ID, TRIM(NAME) AS NAME
       FROM COMPANIES
       ORDER BY LOWER(TRIM(NAME)) NULLS LAST, COMPANY_ID`,
    );
    return (result.rows ?? []).map((row) => ({ id: row.ID, name: row.NAME }));
  }
}
