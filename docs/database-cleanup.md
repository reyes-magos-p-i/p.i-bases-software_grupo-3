# Limpieza de registros incompletos

SCRUM-434. Algunas migraciones agregaron columnas que la app hoy exige, pero dejaron vacíos los
registros viejos. También quedaron datos de prueba que ya no tienen sentido. Esta limpieza
completa o elimina esos registros, para que los listados del dashboard no muestren campos vacíos
ni errores en consola.

Los scripts están en [`database/cleanup/`](../database/cleanup/):

| Script | Qué hace | Cambia datos |
| --- | --- | --- |
| `01_find_incomplete_rows.sql` | Lista cada registro incompleto: tabla, ID, columnas vacías, datos relacionados y acción (`COMPLETAR`, `ELIMINAR` o `PENDIENTE`). | No |
| `02_backup_affected_tables.sql` | Copia las 14 tablas que cambia la limpieza a `BKP434_<tabla>` y compara la cantidad de filas. No sobrescribe un respaldo existente. | Solo crea tablas nuevas |
| `03_clean_incomplete_rows.sql` | Completa o elimina en una sola transacción. No corre si faltan los respaldos y deshace todo si algo falla. | Sí |

Los scripts eligen los registros **por condición, no por ID**. Así, el mismo archivo sirve en
`DEVELOPMENT` y en `PRODUCTION`, aunque producción tenga registros nuevos.

## Qué cuenta como obligatorio

Obligatorio es lo que la app exige hoy (DTOs de creación, triggers y listados), no solo lo que
tiene `NOT NULL` en la base:

- `CLIENTS.CREATED_AT` y `EMPLOYEES.CREATED_AT`/`HIRE_DATE`: los exigen los triggers
  `TRG_CLIENTS_REQUIRED_DATES` y `TRG_EMPLOYEES_REQUIRED_DATES`. La fecha de contratación también
  es obligatoria en el formulario y en el DTO de creación de empleados.
- Formato, tecnología y estreno de las proyecciones: los usa el cálculo de precios de la compra.
- Nombre de las empresas, credenciales de los empleados, póster de las películas y compra de
  cada boleto.

Estos nulos son válidos por diseño y **no se tocan**:

| Columna | Por qué puede quedar vacía |
| --- | --- |
| Segundo nombre, apellidos, nacimiento, teléfono, género y dirección de `CLIENTS` | Son opcionales en el registro de clientes (Google y Facebook no los dan). |
| Columnas de Stripe y de tarjeta en `INVOICES` | Las compras `SIMULATED` no tienen tarjeta. |
| `REQUEST_KEY`, `BUYER_EMAIL` y `PURCHASE_CONTEXT` de compras de clientes anteriores a la migración `20261101` | La API usa los datos del cliente y de la proyección (`COALESCE`). |
| `PRODUCTS.PRICE` de los boletos y `PRODUCTS.CODE` de la comida | El precio del boleto lo da la proyección; el código solo identifica tipos de boleto. |
| `EMPLOYEE_LOCAL_CREDENTIALS.PASSWORD_SET_AT` | Vacío significa que la contraseña está vencida y se pide cambiarla. |

`SEATS` e `INVOICE_PRODUCTS` también se revisaron: todas sus columnas son `NOT NULL`.

## Registros incompletos y decisiones

Resultado de `01` en `DEVELOPMENT` el 16/11/2026, con los mismos datos que `PRODUCTION` copiados
en la SCRUM-435:

| Tabla | Registros | Problema | Decisión | Motivo |
| --- | --- | --- | --- | --- |
| `TICKETS` | 134 (IDs 1 a 445) | Sin compra ni producto | Eliminar | Los creó el flujo de compra anterior a la migración `20261101`. No tienen comprador y nada depende de ellos, pero ocupan asientos en proyecciones futuras y bloquean su edición. |
| `MOVIES` | 101 "Ecos del Volcán", 102 "La Última Frontera" | Sin póster | Eliminar, con sus 44 proyecciones, sus 5 compras de prueba (FAC-000121 a FAC-000125) y sus enlaces a sucursales, géneros e idiomas | Son películas ficticias del seed `20261027_transactions_test_data.sql`. El catálogo solo usa películas reales con su póster oficial. Las compras son del seed (`pi_seed_...`), no de clientes. |
| `EMPLOYEES` | 2 (`maria.rodriguez@example.com`) | Sin credenciales ni fechas | Eliminar, con sus 5 proyecciones (2, 61, 62, 63 y 64) y su solicitud de recuperación | Sin credenciales no puede iniciar sesión. Sus proyecciones no tienen compras. |
| `COMPANIES` | 22 | Nombre de solo espacios | Eliminar | No tiene sucursales. |
| `MOVIE_FUNCTIONS` | 12 (21 a 28, 41, 166, 197 y 256) | Sin formato, tecnología ni estreno | Completar con `2D`, `STANDARD` y sin estreno | Se crearon antes de la migración `20261101`. Son los valores de una proyección normal. |
| `CLIENTS` | 1, 21, 41, 42, 61 y 82 | Sin fecha de registro | Completar con la fecha más antigua de su actividad (términos aceptados, credenciales, compras) | Es la mejor evidencia de cuándo se registraron. Si no hay ninguna, se usa la fecha de la limpieza. |
| `EMPLOYEES` | 21, 41, 61, 81 y 101 | Sin fecha de registro ni de contratación | Registro: la fecha más antigua de su actividad (contraseña, proyecciones creadas). Contratación: ese mismo día en hora de Costa Rica | No hay fecha real de contratación. Se usa la de registro como supuesto documentado. |

Después de la limpieza, `01` no devuelve filas en `DEVELOPMENT` (prueba en seco del 17/11/2026,
deshecha con `ROLLBACK`).

### Registros que nunca se eliminan

`03` no borra un registro con **compras reales**. Una compra real es cualquiera que no sea del
seed, es decir, cuya intención de Stripe no empieza con `pi_seed_`; las compras `SIMULATED` de la
app cuentan como reales. Si en `PRODUCTION` aparece un caso así, `01` lo lista como `PENDIENTE`
con sus datos relacionados, para decidir qué hacer con él:

- una película sin póster con compras reales;
- un empleado sin credenciales cuyas proyecciones tienen compras.

## Procedimiento

Siempre con la cuenta **dueña del esquema** (`DEVELOPMENT` o `PRODUCTION`), nunca con
`CINETADEL_APP`, en el SQL Worksheet de Database Actions o en SQL Developer. `01` se ejecuta con
*Run Statement* (Ctrl+Enter) y `02` y `03` con *Run Script* (F5).

`03` desactiva el DML en paralelo (`ALTER SESSION DISABLE PARALLEL DML`). Autonomous Database lo
activa por omisión en los servicios `high` y `medium`. Con DML en paralelo, un script que borra y
luego actualiza la misma tabla en una transacción queda esperando para siempre un lock de su propia
sesión.

### 1. Desarrollo

1. Ejecutar `01` y exportar el resultado (lista inicial). Ejecutar `01` también en `PRODUCTION` y
   guardar ese resultado, para comprobar después que producción no cambió.
2. Ejecutar `02`. Las 14 filas de la comparación deben tener `ORIGINAL_ROWS = BACKUP_ROWS`.
3. Ejecutar `03`. La salida muestra cuántas filas cambió cada paso.
4. Ejecutar `01` otra vez: solo deben quedar filas `PENDIENTE` (hoy, ninguna).
5. Con la API y la web locales conectadas a `DEVELOPMENT`, abrir los listados Usuarios,
   Clientes, Sucursales, Salas, Películas, Proyecciones, Productos y Transacciones con la consola
   del navegador abierta. No debe haber celdas vacías, `null`, `undefined` ni errores.
6. Ejecutar `01` en `PRODUCTION`: debe devolver lo mismo que en el paso 1.

### 2. Producción

Solo después de validar desarrollo, en una ventana sin uso del sitio:

1. Ejecutar `01` y exportar el resultado. Revisar si hay registros nuevos respecto a desarrollo.
2. Ejecutar `02` y comprobar las 14 filas de la comparación.
3. Comprobar que `03` es el mismo archivo que se ejecutó en desarrollo:
   `Get-FileHash database\cleanup\03_clean_incomplete_rows.sql` debe dar el mismo hash.
4. Conectado como `PRODUCTION` (`SELECT USER FROM DUAL`), ejecutar `03`.
5. Ejecutar `01`: solo deben quedar filas `PENDIENTE`.
6. Revisar los listados de https://www.cinetadel.shop/dashboard con la consola abierta.

### 3. Respaldos

Los `BKP434_` quedan hasta que la release esté validada en producción. Para restaurar una tabla:

```sql
DELETE FROM <tabla>;
INSERT INTO <tabla> SELECT * FROM BKP434_<tabla>;
COMMIT;
```

Las tablas con identidad `GENERATED ALWAYS` (`EMPLOYEES`, `COMPANIES`, `PASSWORD_RECOVERIES`,
entre otras) no aceptan IDs explícitos. Antes del `INSERT`, cambiar la columna a
`GENERATED BY DEFAULT` y devolverla después:

```sql
ALTER TABLE EMPLOYEES MODIFY EMPLOYEE_ID GENERATED BY DEFAULT AS IDENTITY;
-- INSERT ... SELECT ...
ALTER TABLE EMPLOYEES MODIFY EMPLOYEE_ID GENERATED ALWAYS AS IDENTITY;
```

Las tablas hijas se restauran después de sus padres (por ejemplo `MOVIES`, luego
`MOVIE_FUNCTIONS`, luego `INVOICES`, `INVOICE_PRODUCTS` y `TICKETS`).

Al cerrar la release, borrar los respaldos en cada esquema:

```sql
BEGIN
    FOR t IN (SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME LIKE 'BKP434\_%' ESCAPE '\') LOOP
        EXECUTE IMMEDIATE 'DROP TABLE ' || t.TABLE_NAME || ' PURGE';
    END LOOP;
END;
/
```

## Pendientes fuera de esta historia

- `DELETE /api/movies/:id` responde 500 cuando la película tiene proyecciones o sucursales: Oracle
  rechaza el borrado (`ORA-02292`) y la API no traduce el error. Debería responder 409 con un
  mensaje claro.
- El seed `database/seeds/20261027_transactions_test_data.sql` vuelve a crear las películas 101 y
  102 y sus compras de prueba si se ejecuta de nuevo.
