-- =========================================================
-- SCRUM-49 / SCRUM-51: password change + expiration policy
-- =========================================================

ALTER TABLE Client_local_credentials ADD (
    password_set_at   TIMESTAMP WITH TIME ZONE,
    expiration_days   NUMBER(3)
);

ALTER TABLE Employee_local_credentials ADD (
    password_set_at   TIMESTAMP WITH TIME ZONE,
    expiration_days   NUMBER(3) DEFAULT 120 NOT NULL
);

-- Backfill: nadie queda retroactivamente vencido por esta migración
UPDATE Client_local_credentials
   SET password_set_at = SYSTIMESTAMP,
       expiration_days = 90
 WHERE password_set_at IS NULL;

UPDATE Employee_local_credentials
   SET password_set_at = SYSTIMESTAMP
 WHERE password_set_at IS NULL;

ALTER TABLE Client_local_credentials MODIFY (
    password_set_at NOT NULL,
    expiration_days NOT NULL
);

ALTER TABLE Client_local_credentials ADD CONSTRAINT chk_client_local_cred_expiration
    CHECK (expiration_days IN (30, 60, 90, 120));

ALTER TABLE Employee_local_credentials ADD CONSTRAINT chk_employee_local_cred_expiration
    CHECK (expiration_days IN (30, 60, 90, 120));