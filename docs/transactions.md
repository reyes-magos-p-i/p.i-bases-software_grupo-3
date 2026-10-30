# Transacciones (SCRUM-17)

Solo el administrador ve la sección «Transacciones» del dashboard. Cada transacción es
una factura de la tabla `INVOICES`: una compra de un cliente para una función. El
contrato está en [`transactions.openapi.yaml`](transactions.openapi.yaml).

## Acceso

- **Menú:** la opción aparece solo para administradores. Un empleado regular no la ve
  (UT-047). Las secciones del dashboard no tienen URL propia: un empleado que pega la
  URL del dashboard entra sin la opción y no ve ningún dato (UT-049).
- **Cliente:** el dashboard no le abre, porque la guarda de rutas lo saca (UT-048).
- **Sin sesión:** cualquier ruta del dashboard lleva al inicio de sesión (UT-050).
- **API:** pasa por `AuthGuard('jwt')`, `AdministratorGuard` y el bloqueo de contraseña
  vencida. Un empleado regular o un cliente recibe `403` sin datos (UT-051).

## Lista

`GET /api/transactions` devuelve una página de transacciones, de la más reciente a la
más antigua. Solo incluye las facturas **pagadas** (`PAID`) y **canceladas**
(`CANCELLED`); las pendientes (`PENDING`) y fallidas (`FAILED`) todavía no son
transacciones.

| Columna | Valor | Ejemplo |
|---|---|---|
| IdTransacción | `FAC-` y el ID de la factura con 6 dígitos | FAC-000123 |
| Fecha | Fecha de compra, hora de Costa Rica | 12/10/2026 |
| Cliente | Nombre completo y, debajo, el correo | Carlos Mora |
| Película y función | Película, sala y fecha y hora de la función; debajo, la sucursal | Ecos del Volcán – Sala 1, 12/10/2026 17:00 |
| Boletos | Suma de las cantidades de las líneas de tipo `TICKET` | 1 |
| Total | Total cobrado, en colones | ₡3500 |
| Estado | «Pagada» o «Cancelada» | Pagada |
| Acciones | «Ver detalle» (SCRUM-18) | |

- El cliente ve la misma factura en su historial como `ORD-000123`.
- Los montos se muestran como en el plan de pruebas, sin separador de miles (`₡11500`).
  Los céntimos solo aparecen si los hay (`₡3500,50`).
- Las fechas viajan como `YYYY-MM-DDTHH:mm` ya convertidas a hora de Costa Rica, así
  que se ven igual en cualquier navegador.

## Búsqueda y filtros

Como en el diseño de Figma (P-600), sin el botón «Agregar Transacción», que no se
implementa.

- **Buscar:** por ID (`FAC-000123`, `fac123`, `000123` o `123`), nombre o correo del
  cliente, o título de la película. No distingue mayúsculas ni tildes.
- **Sucursal y Película:** las opciones salen de `GET /api/transactions/filter-options`,
  y solo incluyen sucursales y películas con al menos una transacción.
- **Estado:** Todos, Pagada o Cancelada.
- **Fecha inicio y Fecha fin:** rango de fechas de compra, inclusivo y en hora de Costa
  Rica. Si la de inicio es posterior a la de fin, se muestra «La fecha de inicio no puede
  ser posterior a la fecha de fin.» y no se consulta nada; la API responde `400` con el
  mismo texto.
- La paginación muestra 10, 20 o 50 transacciones por página.

## Mensajes

| Situación | Texto |
|---|---|
| Error de red o del servidor (UT-045) | No se pudieron cargar las transacciones, intenta de nuevo (con «Reintentar») |
| Sin transacciones (UT-046) | No hay transacciones disponibles |
| Búsqueda o filtros sin coincidencias | No se encontraron transacciones |
| `403` | No tiene permisos para acceder a esta sección |
| `401` | Vuelve al inicio de sesión |
| Fallan las opciones de filtros | No se pudieron cargar los filtros. (con «Reintentar») |

## Base de datos

- La migración [`20261016_sales_invoices_products.sql`](../database/migrations/20261016_sales_invoices_products.sql)
  crea `PRODUCTS`, `INVOICES` e `INVOICE_PRODUCTS`. **No crea `TICKETS`**: esa tabla ya
  existe en PRODUCTION (`TICKETS_ID`, `MOVIE_FUNCTION_ID`, `SEAT_ID`), y la usan las
  historias de asientos y tickets. Ligar cada boleto con su factura queda para el flujo
  de compra.
- El seed [`20261027_transactions_test_data.sql`](../database/seeds/20261027_transactions_test_data.sql)
  carga las 5 facturas del plan (FAC-000121 a FAC-000125), con sus clientes, películas,
  funciones y productos.

## Datos de prueba

- **Sala 2:** `THEATERS.THEATER_ID` es identidad `ALWAYS`, así que no se puede crear una
  sala con ID 2. Las funciones de «La Última Frontera» usan la primera sala después de
  la 1 (hoy la **Sala 63**), y la lista muestra «Sala 63» donde el plan dice «Sala 2».
- **Cuentas:** el seed crea los clientes dueños de las facturas, pero sin contraseña. Las
  cuentas `admin.pruebas` y `empleado.pruebas` no existen en la base y se crean desde la
  sección Empleados.

## Verificación

En `apps/api`: `npm test -- src/transactions`. En `apps/web`:
`npx vitest run src/__tests__/components/transactions src/__tests__/utils/transaction-format.spec.ts`.
