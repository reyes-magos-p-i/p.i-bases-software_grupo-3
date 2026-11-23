--================================================================
-- SCRUM 406 administrator crear descuento
-- This script establishes the promotion table.
-- The promotion table contains all the necessary information required to create and submit a promotion.
-- There are two categories of promotions.
-- Fixed value promotions, which do not exceed 4000, subtract the full price of a ticket from the base amount; the maximum can be determined by PO decision.
-- Percentage promotions offer discounts based on a specified percentage.
-- Date ranges are recorded as date and time intervals.
-- Title, description, conditions, and poster are intended for client presentation.
-- Each promotion will be linked to one or more functions that apply.
-- The use of a trigger is being considered to automatically verify if a function can be associated with a promotion.
--===================================================================

CREATE TABLE promotions (
    promotion_id NUMBER GENERATED ALWAYS AS IDENTITY,
    promotion_type VARCHAR2(10) NOT NULL,
    promotion_amount NUMBER(6,2) NOT NULL,

    begin_date DATE NOT NULL,
    end_date DATE NOT NULL,

    begin_hour INTERVAL DAY(1) TO SECOND(0),
    end_hour   INTERVAL DAY(1) TO SECOND(0),

    projection_format VARCHAR2(2),
    technology VARCHAR2(8),

    promotion_title VARCHAR2(150) NOT NULL,
    promotion_description VARCHAR2(4000) NOT NULL,
    conditions VARCHAR2(4000),
    poster_path VARCHAR2(500),

    CONSTRAINT pk_promotions
        PRIMARY KEY (promotion_id),

    CONSTRAINT ck_promo_type
        CHECK (promotion_type IN ('percentage', 'fixed')),

    CONSTRAINT ck_promo_amount
        CHECK (
            promotion_amount > 0
            AND (
                (promotion_type = 'percentage'
                    AND promotion_amount <= 100)
                OR
                (promotion_type = 'fixed'
                    AND promotion_amount <= 4000)
            )
        ),

    CONSTRAINT ck_promo_dates
        CHECK (
            begin_date = TRUNC(begin_date)
            AND end_date = TRUNC(end_date)
            AND end_date >= begin_date
        ),

    CONSTRAINT ck_promo_hours
        CHECK (
            (begin_hour IS NULL AND end_hour IS NULL)
            OR
            (
                begin_hour IS NOT NULL
                AND end_hour IS NOT NULL
                AND begin_hour >= INTERVAL '0' DAY
                AND end_hour <= INTERVAL '1' DAY
                AND begin_hour < end_hour
            )
        ),

    CONSTRAINT ck_promo_format
        CHECK (projection_format IN ('2D', '3D')),

    CONSTRAINT ck_promo_technology
        CHECK (technology IN ('STANDARD', 'IMAX', '70MM'))
);
--==============================================================
-- SCRUM 406 crear descuento
-- Promotion weekday table
-- table to keep track of weekdays that are valid for promotion
-- allow for a promotion to have multiple valid weekdays
-- no promotion weekday asociation means all days are valid
-- ==========================================================

CREATE TABLE promotion_weekdays (
    promotion_id NUMBER NOT NULL,
    day_of_week NUMBER(1) NOT NULL,

    CONSTRAINT pk_promotion_weekdays
        PRIMARY KEY (promotion_id, day_of_week),

    CONSTRAINT fk_promo_weekdays_promo
        FOREIGN KEY (promotion_id)
        REFERENCES promotions (promotion_id)
        ON DELETE CASCADE,

    CONSTRAINT ck_promo_weekday
        CHECK (day_of_week BETWEEN 1 AND 7)
);


-- test insert
INSERT INTO DEVELOPMENT.promotions (
    promotion_type,
    promotion_amount,
    begin_date,
    end_date,
    begin_hour,
    end_hour,
    projection_format,
    technology,
    promotion_title,
    promotion_description,
    conditions,
    poster_path
)
VALUES (
    'percentage',
    25,
    DATE '2026-11-16',
    DATE '2026-12-31',
    INTERVAL '0 14:30:00' DAY TO SECOND,
    INTERVAL '0 18:00:00' DAY TO SECOND,
    '2D',
    NULL,
    'EXAMPLE Afternoon discount ',
    '25% discount on eligible afternoon screenings.',
    NULL,
    NULL
);

select * from DEVELOPMENT.promotions;
