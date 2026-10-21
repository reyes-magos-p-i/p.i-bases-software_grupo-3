-- =========================================================
-- SCRUM-34: deactivate a branch (Cinemas)
--
-- Run connected as PRODUCTION (or with CURRENT_SCHEMA = PRODUCTION).
-- Same STATUS pattern as Employees and Clients. Existing branches stay
-- ACTIVE through the default. Deactivation is irreversible from the UI;
-- the API never sets INACTIVE back to ACTIVE.
-- =========================================================

ALTER TABLE Cinemas ADD (
    status  VARCHAR2(8 CHAR) DEFAULT 'ACTIVE' NOT NULL
);

ALTER TABLE Cinemas ADD CONSTRAINT ck_cinemas_status
    CHECK (status IN ('ACTIVE', 'INACTIVE'));
