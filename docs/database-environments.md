# Ambientes de base de datos

SCRUM-435. La rama `dev` y los equipos locales trabajan sobre el esquema `DEVELOPMENT`. El
deploy desde `main` usa `PRODUCTION` con un usuario que solo puede leer y modificar datos.
Lo que se prueba en desarrollo no cambia la app desplegada.

| Ambiente | Dónde se usa | `DB_USER` | `DB_SCHEMA` | Puede cambiar la estructura |
| --- | --- | --- | --- | --- |
| Desarrollo | Rama `dev` y equipos locales | `DEVELOPMENT` | `DEVELOPMENT` | Sí |
| Producción | Servidor (deploy de `main`) | `CINETADEL_APP` | `PRODUCTION` | No, solo datos |

- **`PRODUCTION`** es la cuenta dueña del esquema de producción. Solo se usa en SQL Developer
  para aplicar migraciones aprobadas. Nunca va en un `.env`.
- **`ADMIN`**, o la cuenta de administración del equipo, crea usuarios, permisos, copias y
  respaldos (`01` a `06`).
- Los tres usuarios usan la misma wallet y el mismo `DB_CONNECT_STRING`.
- `DB_CONNECT_STRING` usa el alias **`<base>_tp`**, el servicio para aplicaciones transaccionales.
  `_high` y `_medium` son para reportes y ejecutan en paralelo hasta las búsquedas de una fila, lo
  que suma ~10 ms a cada consulta con joins (SCRUM-436, [`query-optimization.md`](query-optimization.md)).
- Las contraseñas no se guardan en el repositorio. Se comparten por un canal privado.

Los scripts están en [`database/environments/`](../database/environments/).

## Variables obligatorias

La API no arranca si falta `DB_USER`, `DB_PASSWORD`, `DB_CONNECT_STRING`, `DB_WALLET_DIR`,
`DB_WALLET_PASSWORD` o `DB_SCHEMA`. Valida todas antes de abrir conexiones y muestra un error
con el nombre de cada variable que falta, nunca su valor:

```text
Error: Falta la variable de entorno DB_SCHEMA. Configúrala en apps/api/.env.
Error: Faltan las variables de entorno DB_PASSWORD, DB_SCHEMA. Configúralas en apps/api/.env.
```

`DB_SCHEMA` es obligatoria para que ningún ambiente use por omisión el esquema propio del
usuario. Al conectarse, la API registra `Conectado a Oracle. Esquema activo: <esquema>`.

Las consultas de la API no nombran el esquema (`PRODUCTION.Tabla`): el esquema lo fija
`DB_SCHEMA`. La prueba `src/database/schema-agnostic-sql.spec.ts` falla si alguien lo agrega.

## Creación inicial (una sola vez)

1. **Usuarios.** Como `ADMIN`, en Database Actions › Administration › Database Users ›
   *Create User*, crear `DEVELOPMENT` (cuota `UNLIMITED` en `DATA`, con *Web Access* y alias
   `development`, para que el equipo entre a Database Actions con esa cuenta) y `CINETADEL_APP`
   (sin *Web Access*: solo lo usa el servidor). Así ninguna contraseña queda escrita en un script.
   Si `DEVELOPMENT` se creó sin *Web Access*, se activa después en su tarjeta (⋮ › Activar REST).
   Después, en el SQL Worksheet como `ADMIN`, ejecutar `01_admin_create_users.sql` con *Run
   Script* (F5): da los roles y la cuota, y muestra los usuarios creados.

   Los scripts no usan comandos de SQL*Plus como `WHENEVER SQLERROR` o `ACCEPT`, porque el
   SQL Worksheet de Database Actions los bloquea (`SP2-0738: Restricted command`).
2. **Copia de producción.** Como `ADMIN`, ejecutar `02_admin_copy_production_to_development.sql`.
   Copia la estructura y todos los datos de `PRODUCTION` a `DEVELOPMENT` con Data Pump: tablas,
   índices, restricciones, columnas identidad, el procedimiento `REFRESH_MOVIE_FUNCTION_STATUS`,
   los triggers y el job `MOVIE_FUNCTION_STATUS_JOB`. Solo lee `PRODUCTION`.

   La exportación queda fija en un SCN (`FLASHBACK_SCN`) tomado justo antes de empezar, así que
   todas las tablas se copian del mismo instante aunque la app siga escribiendo. Cada trabajo se
   sigue con `GET_STATUS`: la copia se rechaza con un error si el trabajo no termina en
   `COMPLETED` o si reporta errores inesperados, y en la salida se ve cada error. En la
   importación solo se tolera `ORA-31684` (el objeto ya existe), que aparece al refrescar
   porque el procedimiento, los triggers y el job ya están. `05` usa el mismo bloque.
   Con una cuenta de administración distinta de `ADMIN`, esa cuenta necesita
   `EXECUTE` sobre `DBMS_FLASHBACK`.
3. **Comparación.** Como `ADMIN`, ejecutar `04_admin_compare_schemas.sql`. Las consultas 1 a 4 no
   deben devolver filas. La 5 cuenta las filas reales de cada tabla en los dos esquemas.

   La consulta 1 compara cada columna en los dos sentidos: tipo, `DATA_LENGTH`, `CHAR_LENGTH`,
   precisión, escala, semántica de caracteres (`CHAR_USED`), nulabilidad y valor por defecto
   (incluidos `DEFAULT ON NULL` e identidad). El valor por defecto de una columna identidad
   nombra su propia secuencia (`"<esquema>"."ISEQ$$_<n>".nextval`), distinta en cada lado, así
   que se compara como `IDENTITY ALWAYS` o `IDENTITY BY DEFAULT`. La columna `DIFFERENCES` dice
   qué atributos no coinciden.
4. **Permisos de la app.** Como `ADMIN`, ejecutar `03_admin_grant_app_user.sql`. Da a
   `CINETADEL_APP` `SELECT`, `INSERT`, `UPDATE` y `DELETE` sobre cada tabla.
5. **Prueba del usuario de la app.** En SQL Developer, conectado como `CINETADEL_APP`:
   - `SELECT COUNT(*) FROM PRODUCTION.MOVIES;` funciona.
   - `CREATE TABLE PRODUCTION.DDL_TEST (ID NUMBER);` falla con `ORA-01031`.
   - `SELECT PRIVILEGE FROM USER_SYS_PRIVS;` solo muestra `CREATE SESSION`.
6. **Servidor.** Hacerlo antes de pasar este cambio a `main`: la versión actual de la API ya
   acepta `DB_SCHEMA`, y la nueva no arranca sin ella.

   ```sh
   sudo nano /opt/app/p.i-bases-software_grupo-3/apps/api/.env
   # DB_USER=CINETADEL_APP
   # DB_PASSWORD=<contraseña de CINETADEL_APP>
   # DB_SCHEMA=PRODUCTION
   sudo systemctl restart cinetadel-api.service
   sudo journalctl -u cinetadel-api.service -n 30 --no-pager | grep "Esquema activo"
   ```

   El log debe decir `Esquema activo: PRODUCTION`. Abrir https://www.cinetadel.shop y la cartelera.
7. **Equipos locales.** Cada integrante cambia su `apps/api/.env` a `DB_USER=DEVELOPMENT`,
   `DB_PASSWORD=<contraseña de DEVELOPMENT>` y `DB_SCHEMA=DEVELOPMENT`, y reinicia la API.

## Antes de pasar de `dev` a `main`

Los cambios de estructura y de datos base se copian a producción con este procedimiento, nunca
a mano ni copiando filas desde desarrollo.

1. **Migración.** Cada cambio de estructura es un script en `database/migrations/` con fecha
   (`AAAAMMDD_descripcion.sql`). Se aplica primero en `DEVELOPMENT` y se prueba con la rama `dev`.
2. **Datos base.** Las filas nuevas de catálogos o ajustes (géneros, idiomas, clasificaciones,
   `GLOBAL_SETTINGS`) van dentro de la misma migración, con `INSERT` o `MERGE` que se puedan
   repetir. Los datos de prueba de desarrollo nunca pasan a producción.
3. **Respaldo.** Como `ADMIN`, ejecutar `05_admin_backup_production.sql`.
4. **Aplicar.** Como `PRODUCTION`, ejecutar las migraciones pendientes en orden de fecha. La
   descripción del PR de `dev` a `main` las lista.
5. **Permisos.** Si alguna migración creó tablas, volver a ejecutar `03_admin_grant_app_user.sql`.
6. **Comparar.** Como `ADMIN`, ejecutar `04_admin_compare_schemas.sql`. Las consultas 1 a 4 no
   devuelven filas.
7. **Deploy.** Hacer el merge de `dev` a `main`. Revisar en el log `Esquema activo: PRODUCTION`
   y abrir el sitio.
8. **Esquema de referencia.** Actualizar `database/script.sql` con los cambios aplicados.

Si un paso falla, no se hace el merge. Para devolver una tabla a su estado anterior, `ADMIN`
importa esa tabla desde el respaldo del paso 3 (`TABLE_EXISTS_ACTION = REPLACE`).

## Refrescar desarrollo

Para volver a tener en `DEVELOPMENT` los datos actuales de producción, `ADMIN` ejecuta otra vez
`02_admin_copy_production_to_development.sql`. Reemplaza las tablas de `DEVELOPMENT`: lo creado
solo en desarrollo se pierde, y las migraciones que todavía no están en producción se deben
volver a aplicar en `DEVELOPMENT`.

## Pruebas

| Caso | Qué verifica |
| --- | --- |
| UT-019 | Con la rama `dev`, un dato creado queda en `DEVELOPMENT` y no en `PRODUCTION`. |
| UT-020 | El deploy de `main` se conecta como `CINETADEL_APP` al esquema `PRODUCTION`. |
| UT-021 | `CINETADEL_APP` no puede crear, borrar ni alterar tablas (`ORA-01031`). |
| UT-022 | La comparación de estructura no devuelve filas después de copiar. |
| UT-023 y UT-024 | Sin `DB_PASSWORD` o sin `DB_SCHEMA`, la API no arranca y nombra la variable. |

Las pruebas automáticas están en `apps/api/src/database/database.service.spec.ts` (variables
obligatorias y esquema de la sesión) y `apps/api/src/database/schema-agnostic-sql.spec.ts`.

`apps/api/src/database/environment-scripts.spec.ts` revisa los scripts de esta carpeta, que el
CI no puede ejecutar:

- `02` y `05` comparten el mismo bloque de Data Pump.
- Toda exportación se fija a un SCN antes de iniciar.
- Los trabajos se siguen con `GET_STATUS` y se rechazan si hay errores.
- La comparación de `04` cubre todos los atributos en los dos sentidos.
- Ningún script usa comandos que el worksheet bloquea.

La regresión de la comparación es `database/environments/tests/04_compare_columns_regression.sql`.
Usa el mismo bloque de `04` (el spec comprueba que sean idénticos) sobre filas de prueba, entre
ellas una columna `NUMBER(10,2)` contra `NUMBER(12,2)`. No necesita privilegios de `ADMIN` ni
cambia datos: cualquier cuenta la ejecuta con Ctrl+Enter, y debe devolver `RESULT = PASS`.
