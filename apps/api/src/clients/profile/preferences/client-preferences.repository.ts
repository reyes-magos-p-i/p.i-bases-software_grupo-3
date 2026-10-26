import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import oracle from 'oracledb';
import { DatabaseService } from '../../../database/database.service';
import type { MoviePreferences } from '../../../movie-fuctions/entities/upcoming-movie-functions.interface';
import type { UpdateClientPreferencesDto } from './client-preferences.dto';

const SESSION_ENDED = 'Tu sesión terminó. Inicia sesión nuevamente.';
const OPTIONS_CHANGED =
  'Una de las opciones ya no está disponible. Vuelve a cargar tus preferencias.';

@Injectable()
export class ClientPreferencesRepository {
  constructor(private readonly db: DatabaseService) {}

  async getPreferences(id: number): Promise<MoviePreferences> {
    const result = await this.db.query<{ KIND: string; OPTION_ID: number }>(
      `SELECT 'ACCOUNT' AS KIND, CLIENT_ID AS OPTION_ID FROM CLIENTS WHERE CLIENT_ID = :id AND STATUS = 'ACTIVE'
       UNION ALL
       SELECT 'GENRE', p.GENRE_ID FROM CLIENT_GENRE_PREFERENCES p JOIN CLIENTS c ON c.CLIENT_ID = p.CLIENT_ID WHERE c.CLIENT_ID = :id AND c.STATUS = 'ACTIVE'
       UNION ALL
       SELECT 'LANGUAGE', p.LANGUAGE_ID FROM CLIENT_LANGUAGE_PREFERENCES p JOIN CLIENTS c ON c.CLIENT_ID = p.CLIENT_ID WHERE c.CLIENT_ID = :id AND c.STATUS = 'ACTIVE'
       ORDER BY KIND, OPTION_ID`,
      { id: { val: id, type: oracle.NUMBER } },
    );
    const rows = result.rows ?? [];
    if (!rows.some((row) => row.KIND === 'ACCOUNT' && row.OPTION_ID === id))
      throw new UnauthorizedException(SESSION_ENDED);
    return {
      genreIds: rows
        .filter((row) => row.KIND === 'GENRE')
        .map((row) => row.OPTION_ID),
      languageIds: rows
        .filter((row) => row.KIND === 'LANGUAGE')
        .map((row) => row.OPTION_ID),
    };
  }

  async savePreferences(
    id: number,
    data: UpdateClientPreferencesDto,
  ): Promise<MoviePreferences> {
    const selection = {
      genreIds: [...data.genreIds].sort((a, b) => a - b),
      languageIds: [...data.languageIds].sort((a, b) => a - b),
    };
    try {
      return await this.db.transaction(async (connection) => {
        const account = await connection.execute<{ STATUS: string }>(
          'SELECT STATUS FROM CLIENTS WHERE CLIENT_ID = :id FOR UPDATE',
          { id },
          { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: false },
        );
        if (account.rows?.[0]?.STATUS !== 'ACTIVE')
          throw new UnauthorizedException(SESSION_ENDED);
        await this.validateOptions(
          connection,
          'GENRES',
          'GENRE_ID',
          selection.genreIds,
        );
        await this.validateOptions(
          connection,
          'LANGUAGES',
          'LANGUAGE_ID',
          selection.languageIds,
        );
        await this.replaceSelection(
          connection,
          'CLIENT_GENRE_PREFERENCES',
          'GENRE_ID',
          id,
          selection.genreIds,
        );
        await this.replaceSelection(
          connection,
          'CLIENT_LANGUAGE_PREFERENCES',
          'LANGUAGE_ID',
          id,
          selection.languageIds,
        );
        return selection;
      });
    } catch (error) {
      const failure = error as { errorNum?: number } | null;
      if (failure?.errorNum === 2291)
        throw new BadRequestException(OPTIONS_CHANGED);
      throw error;
    }
  }

  private async validateOptions(
    connection: oracle.Connection,
    table: 'GENRES' | 'LANGUAGES',
    column: 'GENRE_ID' | 'LANGUAGE_ID',
    ids: number[],
  ): Promise<void> {
    if (!ids.length) return;
    const binds = Object.fromEntries(
      ids.map((id, index) => [
        `option${index}`,
        { val: id, type: oracle.NUMBER },
      ]),
    );
    const parameters = ids.map((_id, index) => `:option${index}`).join(', ');
    const result = await connection.execute(
      `SELECT ${column} FROM ${table} WHERE ${column} IN (${parameters}) ORDER BY ${column} FOR UPDATE`,
      binds,
      { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: false },
    );
    if (result.rows?.length !== ids.length)
      throw new BadRequestException(OPTIONS_CHANGED);
  }

  private async replaceSelection(
    connection: oracle.Connection,
    table: 'CLIENT_GENRE_PREFERENCES' | 'CLIENT_LANGUAGE_PREFERENCES',
    column: 'GENRE_ID' | 'LANGUAGE_ID',
    clientId: number,
    ids: number[],
  ): Promise<void> {
    await connection.execute(
      `DELETE FROM ${table} WHERE CLIENT_ID = :clientId`,
      { clientId },
      { autoCommit: false },
    );
    if (!ids.length) return;
    const result = await connection.executeMany(
      `INSERT INTO ${table} (CLIENT_ID, ${column}) VALUES (:clientId, :optionId)`,
      ids.map((optionId) => ({ clientId, optionId })),
      {
        autoCommit: false,
        bindDefs: {
          clientId: { type: oracle.NUMBER },
          optionId: { type: oracle.NUMBER },
        },
      },
    );
    if (result.rowsAffected !== ids.length)
      throw new Error(
        'Oracle did not persist the complete preference selection.',
      );
  }
}
