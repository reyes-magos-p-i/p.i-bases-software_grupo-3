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
        `SELECT m.title, mf.theater_id, mf.start_time, mf.end_time, t.seat_id
        FROM TICKETS t
        JOIN Movie_functions mf
        ON t.movie_function_id = mf.movie_function_id
        JOIN Movies m
        ON mf.movie_id = m.movie_id
        WHERE t.ticket_id = :id`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      const rows = (result.rows ?? []) as { TITLE: string; THEATER_ID: number; START_TIME: Date; END_TIME: Date; SEAT_ID: number }[];

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      return {
        title: row.TITLE,
        theaterId: row.THEATER_ID,
        startTime: row.START_TIME,
        endTime: row.END_TIME,
        seatId: row.SEAT_ID,
      };
    } catch (error) {
      this.logger.error('Error fetching ticket by ID', error as Error);
      throw error;
    }
  }
}
