-- =========================================================
-- SCRUM-287: default password expiration of 30 days
--   - Employees: always 30 days. They cannot choose another period.
--   - Clients: new accounts start with 30 days; they may later pick
--     30, 60, 90 or 120 days when changing the password.
-- Apply it together with the API release that writes 30 days.
-- =========================================================

-- Existing employee passwords move to 30 days. PASSWORD_SET_AT is kept, so
-- a password set more than 30 days ago expires right away and must be changed.
UPDATE Employee_local_credentials
   SET expiration_days = 30
 WHERE expiration_days <> 30;

ALTER TABLE Employee_local_credentials MODIFY (expiration_days DEFAULT 30);

ALTER TABLE Employee_local_credentials
    DROP CONSTRAINT chk_employee_local_cred_expiration;

ALTER TABLE Employee_local_credentials ADD CONSTRAINT chk_employee_local_cred_expiration
    CHECK (expiration_days = 30);

-- Clients keep the period they already chose; only the default changes.
ALTER TABLE Client_local_credentials MODIFY (expiration_days DEFAULT 30);

COMMIT;
