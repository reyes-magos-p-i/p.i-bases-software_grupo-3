# Estadísticas de ventas (SCRUM-320)

El administrador abre **Estadísticas** desde el menú del dashboard. Empleados, clientes e
invitados no pueden acceder a la API de estadísticas. Se conservan los controles de
sesión válida y contraseña vigente.

## Criterio de cálculo

- Se incluyen exclusivamente las facturas `PAID`, tanto de clientes registrados como
  de invitados. Se excluyen `PENDING`, `FAILED` y `CANCELLED`.
- El periodo corresponde a la fecha de compra en `America/Costa_Rica`, con ambos
  extremos incluidos. No se filtra por la fecha de la función.
- Ingresos: suma de `INVOICES.TOTAL`, es decir, el importe facturado, incluidos los
  productos adicionales que tenga la factura. No se recalculan precios históricos.
- Boletos: suma de las cantidades de líneas cuyo producto es de tipo `TICKET`.
  Los comestibles no cuentan como boletos. Compras: cantidad de facturas, sin
  multiplicarlas por boletos ni por categorías.
- Promedio por compra: ingresos divididos entre compras, redondeado a dos decimales.
- La cancelación de una función no equivale a un reembolso. Mientras la factura
  continúe pagada seguirá contabilizándose. Las solicitudes registradas en
  `TICKET_REFUND_REQUESTS` no acreditan un reembolso ejecutado y no se descuentan.
  Cuando se implemente su ejecución habrá que incorporar su registro financiero.
- No se excluyen ventas históricas porque el cliente o la sucursal estén inactivos.

Todos los indicadores se consultan en una sola sentencia Oracle y comparten su
instantánea consistente de lectura. Las líneas de boletos se agrupan por factura
antes de unirlas al resto de los datos. Géneros e idiomas se agrupan por separado:
una película con varias categorías aporta sus ventas a cada una, pero nunca
multiplica los indicadores generales. Por eso esas categorías no son sumables
entre sí como particiones exclusivas del total.

## Gráficos

| Indicador                                | Presentación                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| Evolución de ventas                      | Línea con periodos sin ventas completados con cero                          |
| Provincia del comprador                  | Dona, incluidos invitados o direcciones desconocidas como «Sin información» |
| Películas, géneros, idiomas y sucursales | Barras con las diez categorías principales                                  |
| Edades individuales y rangos             | Barras horizontales con hasta diez categorías                               |
| Género del comprador                     | Dona                                                                        |

El selector «Mostrar», situado después de los indicadores y antes de los gráficos,
permite alternar entre ingresos, boletos y compras sin cambiar los indicadores.
El rango de fechas se muestra dentro de la selección de periodo. Los empates de los rankings
mantienen un orden alfabético. Los títulos identifican el periodo seleccionado y
los rankings indican cuántas categorías muestran, con un límite de diez. Los
gráficos de líneas y barras identifican sus ejes y unidades. Los puntos
de ventas y las barras permiten abrir un pequeño pop flotante mediante clic,
Enter o Espacio, sin ampliar las tarjetas. Se cierra al tocar fuera, volver a
seleccionar el dato, desplazarse o pulsar Escape. Las barras de edades y rangos
muestran sus etiquetas completas y el valor junto a cada barra, sin desplazamiento
interno. Las leyendas y las etiquetas
accesibles permiten consultar los valores sin depender del color ni del ratón.
No se muestran tablas ni secciones de descarga de datos dentro de los gráficos.
No se añaden bibliotecas gráficas ni dependencias.
Las aclaraciones sobre el cálculo y los datos están disponibles en botones de
información con el icono de exclamación, sin ocupar espacio permanente en las tarjetas.

Las películas y sucursales se identifican con los IDs originales de la instantánea
de compra, cuando existe, y con la función de la factura en las compras antiguas.
Se muestran los nombres vigentes, con la instantánea como respaldo. Géneros e
idiomas son los actualmente asociados a la película.

## Periodos

La selección inicial corresponde a **Últimos 30 días**, incluido el día actual.
Hay opciones para hoy, últimos 7 días, últimos 30 días, mes actual, últimos 12 meses,
año actual y rango personalizado. Los últimos 12 meses comienzan el primer día
del mes situado once meses antes del actual y terminan hoy; mes y año actuales
también terminan hoy.

La agrupación es diaria hasta 31 días, semanal hasta 180 días, mensual hasta
1096 días y anual para rangos mayores. Las semanas comienzan el lunes. Aunque el
inicio de una semana, mes o año esté fuera del rango seleccionado, únicamente se
suman compras que estén dentro de las fechas solicitadas.

## Datos demográficos

Se usa la edad **actual del comprador**, calculada desde su fecha de nacimiento
hasta el día de la consulta en Costa Rica. La fecha de compra únicamente determina
si una venta pertenece al periodo; no se utiliza como referencia para calcular la
edad. Esta no representa las edades de todos los asistentes ni se deduce de las
categorías General, Niño o Adulto mayor.
La provincia y el género proceden del perfil vigente del comprador. No se infiere
la provincia por el nombre de la sucursal ni por la dirección de su empresa.
Los invitados y los datos faltantes conservan «Sin información».

Los rangos predeterminados son menores de 18, 18–24, 25–34, 35–44, 45–54,
55–64 y 65 años o más. También se puede seleccionar un rango propio inclusivo,
con edades enteras no negativas. La restricción afecta únicamente a las edades y
sus rangos; no modifica ingresos generales, provincias, géneros ni otros gráficos.
Al seleccionar una franja, el gráfico de rangos muestra esa franja explícitamente.
Después de aplicar el filtro se muestran las diez edades o rangos con mayor valor
en la medida seleccionada. Los empates siguen el orden numérico de las etiquetas.
El límite no elimina grupos de los datos recibidos ni altera los indicadores;
permite seleccionar posteriormente cualquier otra edad mediante el filtro.
La interfaz filtra los grupos de edades que ya recibió para el periodo. No hace
otra petición ni desmonta los demás gráficos, de modo que conserva la posición
de la página y los detalles abiertos en otras estadísticas. La API mantiene sus
filtros de edades para consumidores que necesiten solicitar ese subconjunto.

## Carga, errores y permisos

- Se reutilizan `LoadingState`, `DatePicker` y `NotificationPopup`.
- Las fechas o edades incompletas y los rangos invertidos se rechazan antes de
  consultar. La API valida también fechas, enteros y la coherencia del rango.
- Una nueva consulta oculta los datos anteriores y cancela la petición previa.
  Las respuestas tardías o posteriores al desmontaje no actualizan el tablero.
- Un periodo vacío muestra ceros en los indicadores y «No hubo ventas en este
  periodo». No se rellenan gráficos con datos ajenos al periodo.
- Los errores dejan los gráficos sin datos y permiten reintentar. Las sesiones
  vencidas llevan al acceso del personal. Los errores de la base no se exponen.
- **Generar reporte** abre el modal de la historia SCRUM-25. La descarga incluye
  todas las vistas y medidas; su alcance se describe en [Reportes de ventas](sales-reports.md).

## Verificación

Las pruebas usan los mocks de Oracle y de servicios habituales del proyecto.
Cubren los límites inclusivos, semanas y años, fechas inválidas, rangos de edad,
sumas, ceros, permisos HTTP, errores, solicitudes canceladas, respuestas tardías y
la integración con la navegación del dashboard. Se ejecutan los scripts existentes
de Jest, Vitest, cobertura, tipos, ESLint y compilación.

No se requiere migración, datos de referencia nuevos ni cambios de configuración,
CI/CD o SonarQube. El contrato de consulta está en
[sales-statistics.openapi.yaml](sales-statistics.openapi.yaml).
