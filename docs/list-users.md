# Ver lista de usuarios

El dashboard consulta clientes y empleados reales desde Oracle. Los administradores
pueden consultar ambas listas, incluidos los administradores dentro de Empleados.
Los empleados pueden consultar Clientes. Las rutas verifican la identidad y el rol
vigentes con la sesión del personal. Crear cuentas conserva el permiso exclusivo de
administradores y la comprobación del origen.

## Preparación de Oracle

Usar el esquema exportado en `DB_SCHEMA_CODEX.md` del 4 de octubre de 2026.
`database/script.sql` es un modelo anterior: sus identificadores de sucursales,
campos y nulabilidad de usuarios difieren del esquema actual. Este incremento no
reescribe ese script ni introduce sus tablas de compras en el modelo vigente.

Aplicar una sola vez [`add-user-dates.sql`](../database/add-user-dates.sql) al esquema
actual antes de iniciar la nueva API. En SQLcl o SQL*Plus, conectado con el usuario
propietario de las tablas y desde la raíz del repositorio:

```sql
WHENEVER SQLERROR EXIT SQL.SQLCODE
@database/add-user-dates.sql
```

Oracle confirma cada sentencia DDL automáticamente. El script es de ejecución única:
no volver a ejecutarlo si las columnas ya existen. Si una sentencia falla, revisar
el estado parcial antes de continuar. No ejecutar `database/script.sql` para preparar
esta funcionalidad sobre una base existente.

La migración añade `CLIENTS.CREATED_AT`, `EMPLOYEES.CREATED_AT` y
`EMPLOYEES.HIRE_DATE`. Las fechas de registro usan `TIMESTAMP WITH TIME ZONE` y su
valor predeterminado es `SYSTIMESTAMP`. Los registros anteriores conservan `NULL`;
el valor predeterminado se configura después de agregar las columnas para evitar
asignarles una fecha histórica ficticia. La interfaz muestra «Desconocida».

Los triggers exigen las fechas en nuevas inserciones y al modificar explícitamente
esas columnas. Permiten modificar otros campos de los registros anteriores aunque
sus fechas sean desconocidas. `HIRE_DATE` guarda una fecha sin hora. Los formularios
y la API exigen `hireDate` para crear empleados y administradores; los clientes no
envían ese campo. No hay restricciones de contratación futura ni relación con la
fecha de nacimiento porque no se han definido esas reglas de negocio.

Comprobar la migración con consultas de lectura:

```sql
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, NULLABLE, DATA_DEFAULT
FROM USER_TAB_COLUMNS
WHERE (TABLE_NAME = 'CLIENTS' AND COLUMN_NAME = 'CREATED_AT')
   OR (TABLE_NAME = 'EMPLOYEES' AND COLUMN_NAME IN ('CREATED_AT', 'HIRE_DATE'));

SELECT TRIGGER_NAME, STATUS FROM USER_TRIGGERS
WHERE TRIGGER_NAME IN ('TRG_CLIENTS_REQUIRED_DATES', 'TRG_EMPLOYEES_REQUIRED_DATES');

SELECT NAME, LINE, POSITION, TEXT FROM USER_ERRORS
WHERE NAME IN ('TRG_CLIENTS_REQUIRED_DATES', 'TRG_EMPLOYEES_REQUIRED_DATES');
```

Las columnas admiten `NULL` para conservar el histórico. La obligatoriedad de nuevas
cuentas se aplica con los triggers; no se usa un `NOT NULL` global que invalidaría
los registros anteriores. Verificar que ambos triggers estén habilitados y no tengan
errores de compilación.

## Consulta y búsqueda

- `GET /api/users/clients`: clientes, para empleados y administradores.
- `GET /api/users/employees`: personal, exclusivo de administradores.
- `GET /api/users/employees/options`: sucursales reales para el filtro de empleados.

El contrato completo está en [`list-users.openapi.yaml`](list-users.openapi.yaml).
Se reutiliza la cookie de sesión HttpOnly; el frontend no recibe ni almacena tokens.

La búsqueda permite partes de nombres y apellidos, sin distinguir mayúsculas. Cada
término debe aparecer en el nombre completo, aunque exista un segundo nombre entre
el nombre y el apellido buscados. También permite correo, ID y teléfono. No elimina
tildes. Los caracteres `%`, `_` y `\` se buscan literalmente mediante parámetros
enlazados y escape de `LIKE`.

Un campo vacío en la interfaz elimina la búsqueda y permite listar todos los
usuarios. Si se envía `search` por HTTP, debe contener texto no vacío, Unicode válido,
sin caracteres de control y hasta 400 bytes UTF-8, correspondientes al tamaño total
de los cuatro campos de nombres de 100 bytes del contrato de creación existente.
Se normalizan los espacios. No se añade una restricción de «solo letras» que no
existe en ese contrato. No fue posible acceder a SCRUM-16; si contiene restricciones
adicionales, deben contrastarse con la implementación actual de creación.

El resultado incluye `items`, `total`, `page`, `pageSize` y `totalPages`. Los tamaños
permitidos son 10, 25, 50 y 100, con 10 por defecto. El orden inicial es ID ascendente;
los empates se resuelven por ID y las fechas desconocidas se colocan al final. Una
página que supera la última se ajusta a la última disponible. Cero coincidencias
devuelve `200`, lista vacía, `total: 0`, `page: 1` y `totalPages: 0`. La interfaz
distingue este resultado de parámetros inválidos (`400`) y de errores de conexión.
El conteo y la página usan consultas separadas; pueden reflejar cambios concurrentes
entre ambas lecturas. Refrescar vuelve a consultar el estado vigente.

La interfaz muestra siempre 10 resultados por página, sin selector de cantidad.
La navegación se centra debajo del listado con «Página X de Y» y flechas anterior
y siguiente, etiquetadas para lectores de pantalla. Con cero resultados muestra
«Página 0 de 0» y ambas flechas desactivadas. El total permanece sobre el listado.

Los filtros de roles y sucursales usan checkboxes dentro de desplegables; las listas
largas tienen desplazamiento vertical. Se pueden seleccionar varias opciones.
Los selectores comparten la misma altura. Los desplegables se cierran al tocar fuera
o pulsar Escape y animan su apertura, respetando la preferencia de movimiento reducido.
Ninguna selección significa incluir todas. Dentro de cada filtro se acepta cualquiera
de los valores elegidos; búsqueda, roles y sucursales se combinan conjuntamente.
Cambiar o limpiar filtros vuelve a la primera página. El ordenamiento sigue siendo
una selección única. La API recibe, por ejemplo,
`role=EMPLOYEE,ADMINISTRATOR&branchId=3,5`, conservando los nombres de parámetros
y la compatibilidad con valores únicos. Cada valor se valida y se enlaza al SQL;
se rechazan listas vacías, duplicados, roles no permitidos e IDs inválidos. Se aceptan
hasta 1000 sucursales por consulta para limitar el tamaño de las listas SQL.

Los IDs se presentan como `ADM{id}`, `EMP{id}` y `CL{id}` según el tipo de usuario.
El número original se conserva en la fila, en la API y en Oracle: `EMP21` corresponde
al ID numérico 21, no a la posición del usuario en los resultados. Los prefijos son
solo visuales; la búsqueda por ID sigue usando el número. No se renumeran los registros
ni se eliminan los huecos de las secuencias.

Las fechas de registro se devuelven en UTC y se muestran en la zona de Costa Rica.
La contratación se devuelve como `YYYY-MM-DD`, sin conversión de zona horaria.

`CrudTable` conserva sus eventos `edit`, `view` y `delete` y sus acciones por defecto.
Un slot permite personalizar las acciones. En ambas listas, «Acciones» es la última
columna y muestra solo los íconos de Ver, Modificar y Desactivar de Bootstrap,
con etiquetas accesibles y tooltips nativos al mantener el cursor encima. El navegador
controla el retardo de estos mensajes. Los IDs se mantienen en una sola línea.
Ver abre el diálogo de [`detalle del usuario`](view-user.md). Modificar y Desactivar
permanecen desactivados; sus operaciones quedan para futuras historias.
Los filtros y la paginación están fuera de la tabla.

Después de una creación confirmada se refresca la lista activa, conservando sus
filtros. También se refresca cuando la cuenta existe pero falló el correo (`502`).
Un usuario nuevo puede no aparecer en la página actual si no coincide con los filtros
o queda en otra página según el orden. Un resultado incierto no confirma la creación
ni inicia reintentos automáticos.

## Verificación

1. Ingresar con un administrador y abrir ambas secciones. Comprobar registros,
   columnas, fechas, prefijos de ID y total; recorrer las páginas con las flechas.
   Comprobar que Acciones es la última columna, Ver abre el detalle del seleccionado
   y Modificar y Desactivar permanecen desactivados.
2. Buscar un nombre, un apellido y una combinación que omita el segundo nombre.
   Probar mayúsculas, tildes y nombres compuestos; limpiar la búsqueda.
3. Buscar un nombre inexistente: mostrar cero resultados y «No hay coincidencias».
   Buscar solo espacios o texto que exceda el límite: mostrar un error de entrada.
4. Marcar dos sucursales y ambos roles en Empleados; desmarcar opciones, limpiar
   filtros, cambiar orden y comprobar el total filtrado y el reinicio de página.
5. Ingresar como empleado: Clientes funciona, Empleados no aparece y sus endpoints
   y opciones devuelven `403`. Sin sesión, las consultas devuelven `401`.
6. Crear personal con contratación obligatoria y comprobar el refresco. Crear un
   cliente y comprobar que su registro es automático. Las altas reales guardan
   datos y envían correo: usar cuentas autorizadas para estas comprobaciones.
7. Detener la API, comprobar el error y reintentar. Cambiar de sección durante una
   solicitud pendiente: las respuestas anteriores no deben repoblar la nueva lista.
8. Comprobar teclado y ventana móvil: controles etiquetados, foco visible y tabla
   con desplazamiento horizontal, sin desbordar la página.

En `apps/api`: `npm run test:cov`, `npm run lint`, `npm run build` y, después del
build, `npm run test:e2e`. En `apps/web`: `npm run test:cov`, `npm run lint` y
`npm run build`. En PowerShell con scripts deshabilitados usar `npm.cmd`.
Las pruebas automatizadas simulan Oracle y SMTP; las pruebas E2E del backend
ejercitan también los DTO compilados. La comprobación manual en navegador y la
verificación de los triggers en Oracle complementan estas pruebas.
