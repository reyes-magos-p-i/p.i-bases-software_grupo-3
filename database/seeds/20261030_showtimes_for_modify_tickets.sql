DECLARE
    c_theater_id CONSTANT NUMBER := 222;
    c_price      CONSTANT NUMBER := 3000;
    c_created_by CONSTANT NUMBER := 21;

    v_overlaps   NUMBER;
    v_mf_id      NUMBER;
    v_seat_row   NUMBER;
    v_seat_col   NUMBER;
BEGIN
    FOR f IN (
        WITH new_f AS (
            SELECT 24  AS movie_id, TIMESTAMP '2026-11-01 18:00:00' AS st FROM dual UNION ALL
            SELECT 24,  TIMESTAMP '2026-11-03 20:00:00' FROM dual UNION ALL
            SELECT 101, TIMESTAMP '2026-11-02 18:00:00' FROM dual UNION ALL
            SELECT 101, TIMESTAMP '2026-11-04 19:00:00' FROM dual UNION ALL
            SELECT 1,   TIMESTAMP '2026-11-03 12:00:00' FROM dual UNION ALL
            SELECT 1,   TIMESTAMP '2026-11-05 14:00:00' FROM dual UNION ALL
            SELECT 102, TIMESTAMP '2026-11-04 15:00:00' FROM dual UNION ALL
            SELECT 102, TIMESTAMP '2026-11-05 18:00:00' FROM dual
        )
        SELECT n.movie_id, n.st, n.st + NUMTODSINTERVAL(m.running_time, 'MINUTE') AS en
          FROM new_f n
          JOIN Movies m ON m.movie_id = n.movie_id
         ORDER BY n.st
    ) LOOP
        SELECT COUNT(*) INTO v_overlaps
          FROM Movie_functions
         WHERE theater_id = c_theater_id
           AND start_time < f.en
           AND end_time > f.st;

        IF v_overlaps > 0 THEN
            RAISE_APPLICATION_ERROR(-20001,
                'Overlap in theater 222 for movie ' || f.movie_id || ' at ' || f.st);
        END IF;

        INSERT INTO Movie_functions (movie_id, theater_id, start_time, end_time,
                                     screening_date, created_by, price, status)
        VALUES (f.movie_id, c_theater_id, f.st, f.en,
                TRUNC(f.st), c_created_by, c_price, 'ACTIVE')
        RETURNING movie_function_id INTO v_mf_id;

        SELECT row_number, column_number INTO v_seat_row, v_seat_col
          FROM (SELECT row_number, column_number FROM Seats
                 WHERE theater_id = c_theater_id
                   AND seat_state <> 'indisponible'
                 ORDER BY row_number, column_number)
         WHERE ROWNUM = 1;

        INSERT INTO Tickets (movie_function_id, theater_id, seat_row, seat_column)
        VALUES (v_mf_id, c_theater_id, v_seat_row, v_seat_col);
    END LOOP;
END;
/

COMMIT;
