import { ConflictException, Injectable } from '@nestjs/common';
import oracle from 'oracledb';
import { DatabaseService } from '../database/database.service';
import type { NewClient, NewClientWithLocalCredentials } from './client.model';

@Injectable()
export class ClientsRepository {
  constructor(private readonly db: DatabaseService) {}

  async clientEmailExists(email: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 AS FOUND FROM CLIENTS WHERE EMAIL = :email AND ROWNUM = 1',
      { email },
    );

    return !!result.rows?.length;
  }

  async createClient(
    data: NewClientWithLocalCredentials,
    emailVerification?: { tokenHash: string; expiresInMinutes: number },
  ): Promise<number> {
    try {
      return await this.db.transaction(async (connection) => {
        const clientId = await this.insertClient(connection, data);
        const credentialsResult = await connection.execute(
          `INSERT INTO CLIENT_LOCAL_CREDENTIALS (
          CLIENT_ID, PASSWORD_HASH, SALT
        ) VALUES (:clientId, :passwordHash, :salt)`,
          {
            clientId: { val: clientId, type: oracle.NUMBER },
            passwordHash: { val: data.passwordHash, type: oracle.STRING },
            salt: { val: data.salt, type: oracle.STRING },
          },
          { autoCommit: false },
        );
        if (credentialsResult.rowsAffected !== 1) {
          throw new Error('Oracle did not create a single credentials record.');
        }

        if (emailVerification) {
          const verificationResult = await connection.execute(
            `INSERT INTO CLIENT_EMAIL_VERIFICATIONS (
               CLIENT_ID, TOKEN_HASH, EXPIRES_AT
             ) VALUES (
               :clientId, :tokenHash,
               SYSTIMESTAMP + NUMTODSINTERVAL(:expiresInMinutes, 'MINUTE')
             )`,
            {
              clientId: { val: clientId, type: oracle.NUMBER },
              tokenHash: { val: emailVerification.tokenHash, type: oracle.STRING },
              expiresInMinutes: {
                val: emailVerification.expiresInMinutes,
                type: oracle.NUMBER,
              },
            },
            { autoCommit: false },
          );
          if (verificationResult.rowsAffected !== 1) {
            throw new Error('Oracle did not create a single email verification.');
          }
        }

        return clientId;
      });
    } catch (error) {
      const oracleError = error as {
        errorNum?: number;
        message?: string;
      } | null;
      if (
        oracleError?.errorNum === 1 &&
        /\bUQ_CLIENTS_EMAIL\b/u.test(oracleError.message ?? '')
      ) {
        throw new ConflictException('Este correo ya está registrado');
      }
      throw error;
    }
  }

  async insertClient(
    connection: oracle.Connection,
    data: NewClient,
  ): Promise<number> {
    const addressId =
      data.address == null
        ? null
        : await this.insertAddress(connection, data.address);
    const binds: Record<string, oracle.BindParameter> = {
      email: { val: data.email, type: oracle.STRING },
      firstName: { val: data.firstName, type: oracle.STRING },
      secondName: { val: data.secondName ?? null, type: oracle.STRING },
      firstSurname: { val: data.firstSurname ?? null, type: oracle.STRING },
      secondSurname: { val: data.secondSurname ?? null, type: oracle.STRING },
      birthday: { val: data.birthday ?? null, type: oracle.STRING },
      phoneNumber: { val: data.phoneNumber ?? null, type: oracle.STRING },
      addressId: { val: addressId, type: oracle.NUMBER },
      gender: { val: data.gender ?? null, type: oracle.STRING },
      terms: { val: data.acceptedTerms === true ? 1 : 0, type: oracle.NUMBER },
      clientId: { dir: oracle.BIND_OUT, type: oracle.NUMBER },
    };
    const hasLanguage = data.language !== undefined;
    if (hasLanguage) {
      binds.language = { val: data.language, type: oracle.STRING };
    }

    const result = await connection.execute<{ clientId?: unknown }>(
      `INSERT INTO CLIENTS (
          EMAIL, FIRST_NAME, SECOND_NAME, FIRST_SURNAME, SECOND_SURNAME,
          BIRTHDAY, PHONE_NUMBER, ID_ADDRESS, GENDER, ACCEPTED_TERMS_AT${hasLanguage ? ', LANGUAGE' : ''}
        ) VALUES (
          :email, :firstName, :secondName, :firstSurname, :secondSurname,
          TO_DATE(:birthday, 'FXYYYY-MM-DD'), :phoneNumber, :addressId, :gender, CASE WHEN :terms = 1 THEN SYSTIMESTAMP END${hasLanguage ? ', :language' : ''}
        ) RETURNING CLIENT_ID INTO :clientId`,
      binds,
      { autoCommit: false },
    );

    const returnedIds = result.outBinds?.clientId;
    if (
      result.rowsAffected !== 1 ||
      !Array.isArray(returnedIds) ||
      returnedIds.length !== 1
    ) {
      throw new Error('Oracle did not return a single created client.');
    }

    const clientId: unknown = returnedIds[0];
    if (
      typeof clientId !== 'number' ||
      !Number.isSafeInteger(clientId) ||
      clientId < 1
    ) {
      throw new Error('Oracle returned an invalid client identifier.');
    }

    return clientId;
  }

  private async insertAddress(
    connection: oracle.Connection,
    data: NonNullable<NewClient['address']>,
  ): Promise<number> {
    const result = await connection.execute<{ addressId?: unknown }>(
      `INSERT INTO ADDRESSES (ID_DISTRICT, DETAILS)
       VALUES (:districtId, :details)
       RETURNING ID_ADDRESS INTO :addressId`,
      {
        districtId: { val: data.districtId, type: oracle.NUMBER },
        details: { val: data.details ?? null, type: oracle.STRING },
        addressId: { dir: oracle.BIND_OUT, type: oracle.NUMBER },
      },
      { autoCommit: false },
    );

    const returnedIds = result.outBinds?.addressId;
    if (
      result.rowsAffected !== 1 ||
      !Array.isArray(returnedIds) ||
      returnedIds.length !== 1
    ) {
      throw new Error('Oracle did not return a single created address.');
    }

    const addressId: unknown = returnedIds[0];
    if (
      typeof addressId !== 'number' ||
      !Number.isSafeInteger(addressId) ||
      addressId < 1
    ) {
      throw new Error('Oracle returned an invalid address identifier.');
    }

    return addressId;
  }
}
