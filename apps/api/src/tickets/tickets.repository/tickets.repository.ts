//import { BadRequestException, NotFoundException, Injectable, Logger } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Ticket } from '../entities/ticket.entity';
//import { CreateTicketDto } from '../dto/create-ticket.dto';
//import { UpdateTicketDto } from '../dto/update-ticket.dto';
import oracledb from 'oracledb';

@Injectable()
export class TicketsRepository {
  private readonly logger = new Logger(TicketsRepository.name);
  constructor(private readonly db: DatabaseService) {}

  async getTicketById(id: number): Promise<Ticket | null> {
    try {
      const result = await this.db.query(
        `SELECT m.title, mf.theater_id, TO_CHAR(mf.start_time, 'YYYY/MM/DD HH24:MI'), TO_CHAR(mf.end_time, 'YYYY/MM/DD HH24:MI'), s.ROW_NUMBER, s.COLUMN_NUMBER
        FROM TICKETS t
        JOIN Movie_functions mf
        ON t.movie_function_id = mf.movie_function_id
        JOIN Movies m
        ON mf.movie_id = m.movie_id
        JOIN SEATS s
        ON mf.theater_id = s.theater_id
        WHERE t.tickets_id = :id`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      const rows = (result.rows ?? []) as { TITLE: string; THEATER_ID: number; START_TIME: Date; END_TIME: Date; ROW_NUMBER: number; COLUMN_NUMBER: number }[];

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      return {
        title: row.TITLE,
        theaterId: row.THEATER_ID,
        startTime: row.START_TIME,
        endTime: row.END_TIME,
        rowNumber: row.ROW_NUMBER,
        columnNumber: row.COLUMN_NUMBER,
      };
    } catch (error) {
      this.logger.error('Error fetching ticket by ID', error as Error);
      throw error;
    }
  }
}
