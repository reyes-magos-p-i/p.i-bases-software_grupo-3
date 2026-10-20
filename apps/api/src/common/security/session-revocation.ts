import oracle from 'oracledb';

export async function revokeAccountSessions(
  connection: oracle.Connection,
  accountType: 'client' | 'employee',
  accountId: number,
): Promise<void> {
  const idColumn = accountType === 'client' ? 'CLIENT_ID' : 'EMPLOYEE_ID';
  // The caller locks the account first, keeping status and revocation atomic.
  // Preserve real recovery cooldowns; a revocation alone is not a recovery request.
  const result = await connection.execute(
    `MERGE INTO PASSWORD_RECOVERIES r
     USING (SELECT :accountId AS ACCOUNT_ID FROM DUAL) source
     ON (r.${idColumn} = source.ACCOUNT_ID)
     WHEN MATCHED THEN UPDATE SET TOKEN_HASH = NULL, TEMPORARY_HASH = NULL,
       CREDENTIAL_HASH = NULL, EMAIL = NULL, EXPIRES_AT = NULL, ATTEMPTS = 0,
       RESET_AT = SYSTIMESTAMP
     WHEN NOT MATCHED THEN INSERT (${idColumn}, RESET_AT, REQUESTED_AT)
       VALUES (:accountId, SYSTIMESTAMP, SYSTIMESTAMP - INTERVAL '1' MINUTE)`,
    { accountId: { val: accountId, type: oracle.NUMBER } },
    { autoCommit: false },
  );
  if (result.rowsAffected !== 1)
    throw new Error('Oracle did not revoke sessions for a single account.');
}
