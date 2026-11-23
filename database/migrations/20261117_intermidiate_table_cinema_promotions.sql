-- SCRUM 406 create table
-- asociation between cinema and promotion
-- many to many relation so added the creation of an intermidiate table.

CREATE TABLE promotion_cinemas (
    promotion_id NUMBER NOT NULL,
    branch_id NUMBER NOT NULL,

    CONSTRAINT pk_promotion_branches
        PRIMARY KEY (promotion_id, branch_id),

    CONSTRAINT fk_promo_branches_promo
        FOREIGN KEY (promotion_id)
        REFERENCES promotions (promotion_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_promo_branches_branch
        FOREIGN KEY (branch_id)
        REFERENCES cinemas (branch_id)
);

-- insert promotion branches association to the previously made promotions

INSERT INTO promotion_cinemas (promotion_id, branch_id)
VALUES (1, 1);

INSERT INTO promotion_cinemas (promotion_id, branch_id)
VALUES (2, 1);
