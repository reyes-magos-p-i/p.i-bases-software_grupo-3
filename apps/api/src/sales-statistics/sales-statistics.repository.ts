import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { SalesStatisticsQueryDto } from './dto/sales-statistics-query.dto';
import type {
  SalesGrouping,
  SalesStatisticsRow,
} from './sales-statistics.types';

const BUCKETS: Record<SalesGrouping, string> = {
  day: 'PURCHASE_DATE',
  week: "TRUNC(PURCHASE_DATE,'IW')",
  month: "TRUNC(PURCHASE_DATE,'MM')",
  year: "TRUNC(PURCHASE_DATE,'YYYY')",
};

const totals =
  'NVL(SUM(REVENUE),0) AS REVENUE, NVL(SUM(TICKETS),0) AS TICKETS, COUNT(*) AS PURCHASES';
const grouped = (
  dimension: string,
  key: string,
  label: string,
  source = 'sales',
) =>
  `SELECT '${dimension}' AS DIMENSION, ${key} AS KEY, MAX(${label}) AS LABEL, ${totals} FROM ${source} GROUP BY ${key}`;

@Injectable()
export class SalesStatisticsRepository {
  constructor(private readonly db: DatabaseService) {}

  async read(
    query: SalesStatisticsQueryDto,
    grouping: SalesGrouping,
  ): Promise<SalesStatisticsRow[]> {
    const bucketKey = `TO_CHAR(${BUCKETS[grouping]},'YYYY-MM-DD')`;
    // A single statement gives every indicator the same Oracle read-consistent snapshot.
    const sql = `WITH clock AS (
      SELECT TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Costa_Rica' AS DATE)) AS TODAY FROM DUAL
    ), ticket_totals AS (
      SELECT ip.INVOICE_ID, SUM(ip.QUANTITY) AS TICKETS
      FROM INVOICE_PRODUCTS ip JOIN PRODUCTS p ON p.PRODUCT_ID=ip.PRODUCT_ID
      WHERE p.PRODUCT_TYPE='TICKET' GROUP BY ip.INVOICE_ID
    ), paid AS (
      SELECT i.INVOICE_ID, i.CLIENT_ID, i.TOTAL AS REVENUE, NVL(tt.TICKETS,0) AS TICKETS,
        TRUNC(CAST(i.CREATED_AT AT TIME ZONE 'America/Costa_Rica' AS DATE)) AS PURCHASE_DATE,
        COALESCE(JSON_VALUE(i.PURCHASE_CONTEXT,'$.function.movieId' RETURNING NUMBER),f.MOVIE_ID) AS MOVIE_ID,
        COALESCE(JSON_VALUE(i.PURCHASE_CONTEXT,'$.function.branchId' RETURNING NUMBER),th.BRANCH_ID) AS BRANCH_ID,
        JSON_VALUE(i.PURCHASE_CONTEXT,'$.function.title') AS MOVIE_TITLE,
        JSON_VALUE(i.PURCHASE_CONTEXT,'$.function.branchName') AS BRANCH_NAME
      FROM INVOICES i
      LEFT JOIN ticket_totals tt ON tt.INVOICE_ID=i.INVOICE_ID
      LEFT JOIN MOVIE_FUNCTIONS f ON f.MOVIE_FUNCTION_ID=i.MOVIE_FUNCTION_ID
      LEFT JOIN THEATERS th ON th.THEATER_ID=f.THEATER_ID
      WHERE i.STATUS='PAID'
        AND i.CREATED_AT >= FROM_TZ(TO_TIMESTAMP(:dateFrom,'YYYY-MM-DD'),'America/Costa_Rica')
        AND i.CREATED_AT <= FROM_TZ(TO_TIMESTAMP(:dateTo || '23:59:59.999999','YYYY-MM-DDHH24:MI:SS.FF6'),'America/Costa_Rica')
    ), sales AS (
      SELECT paid.*, COALESCE(m.TITLE,paid.MOVIE_TITLE,'Sin información') AS MOVIE_LABEL,
        COALESCE(TRIM(b.NAME),paid.BRANCH_NAME,'Sin información') AS BRANCH_LABEL,
        pr.ID_PROVINCE, NVL(TRIM(pr.NAME),'Sin información') AS PROVINCE_LABEL,
        CASE WHEN TRUNC(c.BIRTHDAY)<=clock.TODAY THEN
          EXTRACT(YEAR FROM clock.TODAY)-EXTRACT(YEAR FROM c.BIRTHDAY)
          - CASE WHEN TO_CHAR(clock.TODAY,'MMDD')<TO_CHAR(c.BIRTHDAY,'MMDD') THEN 1 ELSE 0 END
        END AS AGE,
        NVL(c.GENDER,'UNKNOWN') AS GENDER_KEY,
        CASE c.GENDER WHEN 'M' THEN 'Masculino' WHEN 'F' THEN 'Femenino'
          WHEN 'O' THEN 'Otro' WHEN 'N' THEN 'Prefiero no decirlo'
          ELSE 'Sin información' END AS GENDER_LABEL
      FROM paid CROSS JOIN clock LEFT JOIN CLIENTS c ON c.CLIENT_ID=paid.CLIENT_ID
      LEFT JOIN MOVIES m ON m.MOVIE_ID=paid.MOVIE_ID
      LEFT JOIN CINEMAS b ON b.BRANCH_ID=paid.BRANCH_ID
      LEFT JOIN ADDRESSES a ON a.ID_ADDRESS=c.ID_ADDRESS
      LEFT JOIN DISTRICTS d ON d.ID_DISTRICT=a.ID_DISTRICT
      LEFT JOIN CANTONS ct ON ct.ID_CANTON=d.ID_CANTON
      LEFT JOIN PROVINCES pr ON pr.ID_PROVINCE=ct.ID_PROVINCE
    ), age_sales AS (
      SELECT * FROM sales WHERE (:minAge IS NULL OR AGE>=:minAge) AND (:maxAge IS NULL OR AGE<=:maxAge)
    )
    SELECT 'summary' AS DIMENSION, 'summary' AS KEY, 'Total' AS LABEL, ${totals} FROM sales
    UNION ALL ${grouped('series', bucketKey, bucketKey)}
    UNION ALL ${grouped('movies', "NVL(TO_CHAR(MOVIE_ID),'UNKNOWN')", 'MOVIE_LABEL')}
    UNION ALL ${grouped('branches', "NVL(TO_CHAR(BRANCH_ID),'UNKNOWN')", 'BRANCH_LABEL')}
    UNION ALL ${grouped('provinces', "NVL(TO_CHAR(ID_PROVINCE),'UNKNOWN')", 'PROVINCE_LABEL')}
    UNION ALL ${grouped('genders', 'GENDER_KEY', 'GENDER_LABEL')}
    UNION ALL ${grouped('ages', "NVL(TO_CHAR(AGE),'UNKNOWN')", "NVL(TO_CHAR(AGE),'Sin información')", 'age_sales')}
    UNION ALL ${grouped('genres', "NVL(TO_CHAR(g.GENRE_ID),'UNKNOWN')", "NVL(TRIM(g.NAME),'Sin información')", 'sales s LEFT JOIN MOVIE_GENRES mg ON mg.MOVIE_ID=s.MOVIE_ID LEFT JOIN GENRES g ON g.GENRE_ID=mg.GENRE_ID')}
    UNION ALL ${grouped('languages', "NVL(TO_CHAR(l.LANGUAGE_ID),'UNKNOWN')", "NVL(TRIM(l.NAME),'Sin información')", 'sales s LEFT JOIN MOVIE_LANGUAGES ml ON ml.MOVIE_ID=s.MOVIE_ID LEFT JOIN LANGUAGES l ON l.LANGUAGE_ID=ml.LANGUAGE_ID')}`;
    const result = await this.db.query<SalesStatisticsRow>(sql, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      minAge: query.minAge ?? null,
      maxAge: query.maxAge ?? null,
    });
    return result.rows ?? [];
  }
}
