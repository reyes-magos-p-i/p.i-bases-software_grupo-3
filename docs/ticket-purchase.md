# Compra de boletos con sesión iniciada — SCRUM-29

El cliente inicia la compra desde una película del catálogo, elige sucursal y fecha, selecciona una función futura, marca asientos y asigna una categoría a cada boleto. El resumen muestra película, sucursal, sala, horario, asientos, categorías e importes finales. «Pagar» registra una factura pagada mediante **pago simulado**, sus líneas y los boletos. No se procesa un cobro real, no se solicita tarjeta ni se envían correos. La confirmación y el detalle del historial muestran un QR identificativo de la compra para un futuro sistema de verificación en el cine.

## Presentación y código QR de compra

Los cuatro pasos siguen una barra de progreso que se llena al avanzar y respeta la preferencia de movimiento reducido. El flujo se sitúa junto al header y no incluye un enlace adicional al historial. El selector de fecha conserva la apariencia del calendario compartido con los formularios de usuarios.

La selección de asientos avisa que no los reserva hasta pagar. Las pantallas del cliente presentan categorías, formato, asiento VIP, importes finales y total, sin explicar la fórmula interna ni mostrar bases y recargos por separado. El resumen y la confirmación no incluyen mensajes sobre la implementación del pago.

Cada compra registrada tiene un QR generado localmente mediante `qrcode`, con margen de lectura y los colores de las variables existentes. El componente común recibe un texto y no conoce el dominio de compras. En este flujo codifica un objeto JSON con `type: "CINETADEL_PURCHASE"`, `version: 1` y la referencia de la compra en `reference`. No incluye enlaces, datos personales ni credenciales. La confirmación y el historial generan el mismo contenido a partir de la referencia existente, sin almacenar una imagen ni añadir campos a Oracle.

Un lector común puede mostrar ese contenido como texto; el QR no abre páginas ni ejecuta acciones dentro del sistema. La consulta del historial sigue utilizando los endpoints protegidos y la comprobación de pertenencia existente. El código identifica la compra, pero todavía no acredita el ingreso al cine: la futura verificación deberá autenticar al personal, comprobar la compra y sus boletos y definir protección contra falsificación y reutilización. Esta historia no incorpora un lector, un endpoint de validación ni un registro de ingreso.

## Tarifas aprobadas (CRC)

| Concepto                    | Importe |
| --------------------------- | ------: |
| General                     |   ₡3000 |
| Niño, de 2 a 12 años        |   ₡2500 |
| Adulto mayor, desde 65 años |   ₡2500 |
| Asiento VIP                 |  +₡1000 |
| Formato 3D                  |   +₡500 |
| Tecnología IMAX             |  +₡1000 |
| Tecnología 70 mm            |   +₡500 |
| Función de estreno          |   +₡500 |

Los recargos compatibles se acumulan. IMAX y 70 mm son alternativas; 70 mm solo admite 2D. La accesibilidad no añade recargos. La categoría pertenece al boleto, no al titular de la cuenta. La política es una regla comercial del proyecto, no una cotización de mercado. Está centralizada en `apps/api/src/common/pricing/ticket-pricing.ts`.

Crear y modificar funciones permite configurar formato, tecnología y estreno. El precio se obtiene de `POST /projections/price-preview`, queda de solo lectura y se calcula nuevamente en el servidor al guardar. El antiguo campo `price` se acepta por compatibilidad con clientes anteriores, pero no determina el precio de la compra ni de la función actualizada. Una función antigua sin metadatos usa 2D/estándar/sin estreno al consultar la compra; sus facturas conservan los importes históricos.

## Disponibilidad y concurrencia

- Solo se pueden comprar funciones activas, futuras, en salas y sucursales activas y con la película habilitada en esa sucursal. Las fechas de Oracle se interpretan en `America/Costa_Rica`, independientemente de la zona del servidor o navegador.
- La selección **no reserva** asientos. Se actualiza la disponibilidad al recuperar el foco y cada diez segundos mientras la pestaña es visible. El selector reutilizado diferencia disponibles, ocupados, reservados e indisponibles.
- El resumen usa un hash de versión que incluye selección, categorías, tarifas, formato, sala y horario. Un cambio obliga a revisar antes de pagar.
- La transacción bloquea cliente, función, sala y asientos seleccionados, revalida disponibilidad y registra factura, líneas y boletos conjuntamente. La restricción única preexistente de función/asiento es la última defensa contra ventas dobles. Un fallo revierte toda la compra.
- La ocupación por función se obtiene de `TICKETS`. No se cambia globalmente `SEATS.SEAT_STATE`, por lo que comprar en una función no ocupa el asiento en las demás.
- Cada confirmación incluye un UUID de solicitud. Repetir la misma selección con esa referencia devuelve la compra registrada; cambiar la selección con la misma referencia produce un conflicto. La referencia nunca permite consultar la factura de otro cliente.
- Ante una respuesta incierta de red o servidor se conserva la referencia, se bloquea la modificación de la selección y se ofrece reintentar o consultar «Historial de compras». No se presenta éxito sin una respuesta válida. Si un reintento devuelve 409 por bloqueo, 429 u otro error sin recuperar el comprobante, la incertidumbre anterior no se descarta: se mantienen la misma referencia, selección y versión del resumen. Un 409 en un intento inicialmente cierto sigue devolviendo al cliente a revisar los asientos.

## Cuenta e historial

Las rutas requieren JWT de cliente y contraseña vigente. La cuenta se obtiene de la sesión, no del cuerpo de la solicitud; también se comprueba su estado bajo bloqueo al confirmar. Las escrituras exigen un origen permitido y tienen límite de solicitudes: 60 resúmenes y 10 confirmaciones por minuto y cliente de red. `PurchaseThrottlerGuard` reutiliza el mecanismo existente y devuelve un mensaje de compras y `Retry-After` al responder 429; no usa el texto de inicio de sesión. Las respuestas privadas llevan `Cache-Control: no-store`.

«Mi perfil → Historial de compras» ([especificación](./purchase-history.md)) pagina diez compras por página y muestra el detalle y los boletos propios. Los importes, correo y datos originales de función se conservan en la factura. Si el personal reprograma un boleto, se muestra también su función actual. Las facturas anteriores sin vínculo a boletos no inventan asientos ni vínculos históricos. El panel administrativo de transacciones distingue «Pago simulado» y consulta los datos originales cuando existe la instantánea.

La compra de invitado no está habilitada: el modelo conserva un correo de comprador independiente del cliente para incorporar esa modalidad posteriormente. `/buy-tickets?movieId=…` exige sesión de cliente; un invitado debe iniciar sesión y volver a seleccionar la película.

## Cambios de Oracle aplicados

La migración [20261101_ticket_purchase.sql](../database/migrations/20261101_ticket_purchase.sql) versiona los cambios de esta historia, contrastados con los metadatos de Oracle. Para actualizar un esquema existente se requieren las tablas previas de cine, asientos, boletos y ventas, incluida la migración `20261016_sales_invoices_products.sql`. La migración comprueba columnas, restricciones e índices por propietario y omite los objetos ya existentes. No vuelve a inicializar funciones que ya estén configuradas ni inventa vínculos para boletos históricos. Si el nombre de un producto entra en conflicto con otro tipo de producto, informa el error en lugar de sobrescribirlo.

Para crear una base vacía, ejecutar [database/script.sql](../database/script.sql) mediante SQLcl o SQL*Plus. Incluye también asientos, boletos, preferencias y sus referencias, y llama a la migración con una ruta relativa para instalar los seis productos de boletos. No se debe ejecutar el bootstrap sobre un esquema existente. `database/schema.sql` conserva la exportación histórica incorporada de `dev`; el bootstrap y las migraciones son la ruta reproducible de instalación.

Oracle confirma cada sentencia DDL automáticamente: aplicar las migraciones antes de desplegar la API, con las escrituras de la aplicación detenidas. Un fallo detiene el script y revierte el DML pendiente; los DDL anteriores requieren revisar el estado parcial antes de reintentar. No se vuelve a aplicar esta migración sobre la base actual durante esta corrección.

Los cambios de compra son:

1. `MOVIES.SYNOPSIS`: `VARCHAR2(1000 CHAR)`, conservando todas las sinopsis existentes. Los DTO de creación y edición validan 1000 caracteres.
2. `MOVIE_FUNCTIONS`: `PROJECTION_FORMAT VARCHAR2(2)`, `TECHNOLOGY VARCHAR2(8)`, `IS_PREMIERE NUMBER(1)`, con restricciones para los valores y la compatibilidad 70 mm/2D. Las filas históricas permiten valores desconocidos. Las funciones futuras se inicializaron como 2D, sin estreno y con tecnología según el proyector (IMAX/70 mm/estándar); su precio general se recalculó con la política nueva.
3. `PRODUCTS.CODE VARCHAR2(40)` único y nullable para productos anteriores. El producto existente «Boleto general» se vinculó a `TICKET_GENERAL_STANDARD`; se añadieron General VIP, Niño estándar/VIP y Adulto mayor estándar/VIP, con códigos `TICKET_{GENERAL|CHILD|SENIOR}_{STANDARD|VIP}` y tipo `TICKET`. El precio histórico continúa en la línea de factura.
4. `INVOICES`: `REQUEST_KEY VARCHAR2(36)` único, `REQUEST_HASH VARCHAR2(64)` con nulabilidad conjunta, `BUYER_EMAIL VARCHAR2(150)` y `PURCHASE_CONTEXT CLOB` con restricción JSON. `CLIENT_ID` admite null, pero se exige cliente o correo de comprador. Se conserva la política de CARD/CASH y se añade SIMULATED, exclusivamente PAID/CANCELLED, sin datos de Stripe/tarjeta.
5. `INVOICE_PRODUCTS.QUANTITY`: `NUMBER(5)` para salas de hasta 10000 posiciones.
6. `TICKETS`: `INVOICE_ID NUMBER` y `PRODUCT_ID NUMBER`, con nulabilidad conjunta, claves foráneas a la factura y a su línea, e índice de ambas columnas. Los boletos históricos quedan sin vínculos inventados. No se impone una clave de factura/función que impida la reprogramación existente.

La desactivación de sala conserva los asientos para respetar las referencias de boletos. La integración SCRUM-340 normaliza los valores españoles de Oracle al contrato del selector compartido.

## Contratos y errores

Véase [OpenAPI de compra](./ticket-purchase.openapi.yaml). La selección compacta contiene posiciones físicas 1..filas×columnas, agrupadas en GENERAL/CHILD/SENIOR; cada posición debe aparecer una sola vez. El servidor resuelve fila y columna; no acepta importes ni cliente en el cuerpo. El límite de 10000 posiciones cabe en el límite JSON existente, sin modificar la configuración global.

Errores relevantes: 400 para selección o referencia inválida; 401 para sesión ausente, vencida o cuenta desactivada; 403 para personal, contraseña bloqueada u origen inválido; 404 para película/compra inexistente; 409 para función no disponible, asientos vendidos o resumen desactualizado; 429 para exceso de solicitudes; 503 cuando no se pueden preparar las tarifas. Los errores generales usan `NotificationPopup` abajo a la derecha.

## Verificación

Las pruebas usan persistencia y solicitudes simuladas, con los guards y la validación de Nest reales en los contratos HTTP. Incluyen categorías mixtas, recargos, sinopsis con tildes, selección vacía/repetida, funciones no disponibles, permisos, cuenta desactivada, errores de cada lote, rollback, reintentos, vínculo exclusivo al cliente, historial, actualización de disponibilidad, respuestas tardías tras cerrar sesión y flujo de interfaz. Las consultas nuevas también se verifican contra Oracle sin insertar compras.

Resultados de la ejecución inicial de la compra:

| Aplicación | Suites/archivos | Pruebas aprobadas | Cobertura global de líneas | Cobertura de líneas añadidas/modificadas |
| ---------- | --------------: | ----------------: | -------------------------: | ---------------------------------------: |
| API        |             110 |              2409 |                    97,91 % |                                  98,44 % |
| Web        |             100 |              1427 |                    95,04 % |                                  97,05 % |

La cobertura de cambios se calculó cruzando los registros ejecutables de LCOV con las líneas añadidas frente a HEAD, incluyendo archivos nuevos y la integración de asientos, sin contar archivos de prueba. Es una medición local; SonarQube calcula su código nuevo con la referencia configurada del PR. El dominio nuevo de compra y la política de precios del backend alcanzaron 100 % de líneas. Se ejecutaron también los builds, las comprobaciones de tipos, ESLint y Prettier. Las pruebas críticas de registro se repitieron después de limitar la espera de los bloqueos a cinco segundos.

Comandos utilizados: `npm run test:cov -- --runInBand`, `npm run build`, `npm run type-check` y `npm run lint` en API; `npm run test:cov -- --maxWorkers=2`, `npm run build` y `npm run lint` en web. Las pruebas HTTP son locales con persistencia simulada: no se realizaron compras de prueba contra la base configurada. La comprobación de consultas de Oracle terminó con rollback y liberó el bloqueo de asiento utilizado para validar la sintaxis.
