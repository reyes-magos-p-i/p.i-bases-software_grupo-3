CREATE TABLE Client_email_verifications (
    client_id       NUMBER PRIMARY KEY,
    token_hash      VARCHAR2(64) NOT NULL UNIQUE,
    expires_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_client_email_verification
        FOREIGN KEY (client_id) REFERENCES Clients (client_id) ON DELETE CASCADE,
    CONSTRAINT chk_client_email_verification_hash
        CHECK (REGEXP_LIKE(token_hash, '^[a-f0-9]{64}$'))
);
