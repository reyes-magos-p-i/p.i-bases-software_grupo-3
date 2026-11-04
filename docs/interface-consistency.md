# Consistencia de interfaz — SCRUM-336

## Criterios compartidos

La tipografía principal es Helvetica, con Arial y sans-serif como alternativas. Los componentes usan los colores semánticos definidos en `apps/web/src/styles/variables.css`; los indicadores de error y éxito conservan sus colores propios. Los controles de teclado muestran un foco visible.

`LoadingState` es el indicador compartido para tablas, consultas y opciones de formularios. La variante `compact` permite usar la misma animación en espacios pequeños. La variante `surface="dark"` presenta el símbolo claro sobre fondos oscuros; la variante predeterminada mantiene el símbolo oscuro sobre fondos claros. Se conserva el tratamiento de movimiento reducido.

Los resultados de creación, modificación y eliminación o desactivación usan `NotificationPopup`. Las notificaciones flotantes se sitúan abajo a la derecha, permiten cierre con teclado y pausan su temporizador mientras tienen foco o el puntero encima. Cuando el navegador soporta Popover API, se presentan en su capa superior para no quedar recortadas por los diálogos nativos. Las validaciones de campos continúan junto a sus controles; las incidencias de carga conservan su contexto y la opción de reintentar.

Los textos de opciones compartidas muestran una inicial mayúscula sin modificar los identificadores enviados al servidor. Se conserva la escritura de siglas y formatos como IMAX y 70 mm. La terminología de venta usa «boleto».

Los diálogos comparten encabezados, espaciados, acciones y presentación de datos mediante `styles/dialog.css`, aplicado a `BaseModal` y a los contenedores nativos existentes. Los datos de consulta usan etiquetas y valores sin recuadros de entrada. Sucursales y transacciones utilizan secciones con títulos y separadores, sin numeración decorativa ni tarjetas interiores. Las acciones inferiores quedan después del contenido, incluido el plano de asientos y su editor. La X se mantiene accesible durante el desplazamiento. La tipografía no utiliza cursivas.

Inicio de sesión y registro son la excepción visual: usan `BaseModal` con `appearance="auth"` para conservar su superficie clara, título centrado en negrita y cierre en la esquina superior. Comparten el manejo de foco, nombre accesible, bloqueo de cierre durante solicitudes y restauración del desplazamiento con los demás diálogos.

Los formularios de modificación organizan sus campos en secciones numeradas visibles simultáneamente, mediante `DialogSection`. El componente recibe un título y un número opcional, genera un nombre accesible y puede representar una sección con encabezado o un grupo de campos con `fieldset` y `legend`. No contiene validaciones, consultas ni operaciones de guardado. Los formularios de creación que comparten esa estructura pueden usar los mismos títulos sin numeración; proyecciones conserva sus cuatro grupos numerados en ambas operaciones.

| Modificación | Secciones                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Usuarios     | Datos personales; contacto; rol y sucursal para personal; dirección. La numeración se ajusta para clientes.                      |
| Películas    | Información general; idiomas y géneros; sinopsis; póster.                                                                        |
| Salas        | Datos de la sala; capacidad y distribución; estado de los asientos. El guardado de asientos conserva su operación independiente. |
| Sucursales   | Datos de la sucursal.                                                                                                            |
| Proyecciones | Película y sala; fecha y horario; tiempos de la función; precio.                                                                 |
| Boletos      | Proyección de destino.                                                                                                           |

La numeración organiza el formulario y no introduce pantallas de Siguiente o Anterior. Las confirmaciones existentes y sus advertencias se conservan. Los detalles de consulta, las confirmaciones simples y el cambio de correo no añaden pasos artificiales.

Los pies de acciones comparten separación, tipografía, bordes y altura mínima de 44 píxeles. Los botones pasan a otra fila si falta espacio, sin comprimirse hasta cortar su texto. Las acciones secundarias utilizan texto oscuro sobre superficie clara; las destructivas mantienen su color de error. Los contenedores nativos comparten el fondo superpuesto, las esquinas y el límite de altura de la ventana; el ancho depende del contenido. El encabezado permanece visible mientras se desplazan los campos. El detalle de boleto también conserva Cerrar cuando hay un error de carga.

Las barras de desplazamiento tienen una pista transparente y un indicador discreto que se adapta a superficies claras y oscuras, con colores centralizados en `variables.css`. No se oculta la posibilidad de desplazarse y se conserva la adaptación a colores forzados del navegador. Los filtros retiran ayudas de formato redundantes y mantienen sus nombres accesibles. Usuarios, salas, sucursales, proyecciones y transacciones comparten la altura `--filter-control-height` de 44 píxeles. Los selectores se ajustan al ancho de su columna y acortan visualmente los valores largos; las opciones completas siguen disponibles al desplegarlos. Transacciones y proyecciones alinean sus controles por el borde inferior para compensar las etiquetas de fechas y horas.

El cierre de sesión del portal se ofrece dentro del menú del perfil. El encabezado de cambio de contraseña utiliza texto claro cuando está sobre el fondo azul y oscuro cuando se integra en una superficie clara del perfil.

Todas las selecciones de fecha utilizan `DatePicker`: nacimiento en el registro público; nacimiento y contratación en la creación de usuarios; fecha al crear o modificar proyecciones y repetición al crearlas; filtros de proyecciones, transacciones, historial de compras y selección de función durante la compra. El componente muestra día/mes/año y mantiene valores `YYYY-MM-DD` para las solicitudes. Las horas conservan sus controles existentes.

El calendario comparte colores, navegación con teclado, límites de fecha, limpieza de campos opcionales y cierre con Escape o al salir. La validación al abandonar un campo se ejecuta al salir del calendario completo, sin interrumpir la selección ni la cancelación del formulario. Seleccionar otra vez la fecha vigente no emite un cambio. Los filtros de proyecciones y transacciones consultan una vez por cambio; el historial conserva su aplicación mediante Buscar o Filtrar.

Cuando el navegador dispone de Popover API, el calendario se presenta en la capa superior para evitar recortes dentro de diálogos. Su posición se ajusta al espacio visible al abrir, desplazar o redimensionar la ventana y al cambiar de mes o año. En ventanas de poca altura permite desplazamiento interno; en navegadores sin esa API conserva el anclaje al campo. Los filtros utilizan etiquetas asociadas por identificador, sin anidar los controles del calendario dentro de otra etiqueta.

## Películas y compra

`MoviePoster` centraliza la presentación de pósteres en el portal, proyecciones, detalle de película, selección inicial de compra y resumen. Intenta primero la ruta pública de imágenes, después la ruta heredada y finalmente la imagen de reemplazo existente. Los errores de imagen no interrumpen la vista.

El catálogo ofrece acceso visible a la compra en pantallas táctiles y mediante teclado. El carrusel conserva sus cuatro películas y el orden recibido. No presenta un botón de pausa; detiene la rotación durante la interacción y respeta el movimiento reducido. No cambia el algoritmo de preferencias. En el resumen de compra, el póster se alinea con el título en escritorio y móvil, y los datos se distribuyen según el espacio disponible.

La creación y modificación de películas comparten validaciones de título, sinopsis, duración, año, clasificación, géneros e idiomas. Se comprueban antes de enviar y también en los DTO de la API. Los mensajes son comprensibles para el usuario y no describen bytes ni codificaciones. Editar conserva la posibilidad existente de vaciar géneros e idiomas.

## Salas y asientos

El plano representa exclusivamente los asientos registrados. En la compra no se muestran diagnósticos del plano: las filas sin ningún asiento registrado se ocultan, y las demás conservan sus números reales. Las posiciones ausentes de una fila parcialmente registrada siguen siendo huecos y no se convierten en asientos seleccionables. Una sala sin registros muestra «No hay asientos disponibles». Los estados incluyen símbolos además del color.

`SeatSelector` recibe `showLayoutDiagnostics` para habilitar los avisos administrativos. El detalle y el editor de sala lo activan: muestran las filas completas, identifican las que no tienen registros y advierten sobre posiciones ausentes. No se presenta un mensaje adicional para explicar el desplazamiento.

En pantallas pequeñas, el plano se desplaza dentro de su propio contenedor, horizontal y verticalmente. La pantalla de referencia queda fuera del desplazamiento horizontal, las etiquetas de fila permanecen visibles y la cabecera del diálogo conserva el botón de cierre al desplazarse. El detalle de sala es de consulta y no presenta acciones de selección. La compra y el editor mantienen sus acciones de selección y sus reglas actuales.

La API devuelve `canResize` en el listado y detalle de salas. Si una sala tiene cualquier función asociada, sus dimensiones y capacidad quedan protegidas tanto en el formulario como en el servidor. El resto de sus datos conserva el comportamiento existente.

Para una sala sin funciones, cambiar o guardar sus dimensiones sincroniza los asientos dentro de la misma transacción: elimina posiciones que queden fuera, añade las que falten y conserva los tipos y estados de las posiciones existentes. La cantidad debe coincidir con filas por columnas y se mantiene el máximo de creación de 5000 asientos. El bloqueo de la fila de sala se comparte con la creación de proyecciones, evitando que ambas operaciones modifiquen simultáneamente un plano que acaba de adquirir funciones. Un rechazo conserva el formulario y explica la causa.

No se modifica el esquema de Oracle ni se ejecutan reparaciones masivas sobre salas existentes. Las salas que ya tengan funciones y un plano incompleto requieren una revisión de sus datos históricos; la interfaz las identifica sin inventar asientos ni alterar boletos.

## Verificación

Las suites de Jest y Vitest usan las consultas y solicitudes simuladas del proyecto. Cubren la sincronización transaccional de salas, protección del historial, validación local y de DTO, notificaciones, navegación con teclado, planos vacíos o incompletos y recuperación de imágenes.

Resultados de la revisión inicial del 3 de noviembre de 2026:

| Aplicación | Archivos de pruebas | Pruebas aprobadas | Cobertura global de líneas | Cobertura de líneas ejecutables añadidas |
| ---------- | ------------------: | ----------------: | -------------------------: | ---------------------------------------: |
| API        |                 122 |              2652 |                    98,23 % |                          97,01 % (65/67) |
| Web        |                 119 |              1752 |                    95,70 % |                        90,06 % (308/342) |

La cobertura añadida se calcula cruzando las líneas ejecutables de LCOV con el diff respecto a `HEAD`, incluyendo los nuevos componentes y utilidades. No mide CSS ni sustituye la definición de código nuevo que aplique SonarQube al PR. Los controles de lint, tipos, compilación y formato de los archivos modificados pasan en ambas aplicaciones. No se alteran las configuraciones de CI/CD ni de SonarQube.

En la revisión posterior de modales, asientos y filtros pasan los 119 archivos y las 1754 pruebas del frontend, sin errores no controlados. La cobertura global de líneas es 95,69 %; la de líneas ejecutables añadidas respecto al `HEAD` de esa revisión es 91,89 % (34/37), y la de ramas añadidas es 92,11 % (140/152). También pasan lint, formato, tipos y compilación. Esta revisión no modifica la API.

La comprobación visual se realizó en Edge con tamaños de 320, 390, 768 y 1440 píxeles, con respuestas de API e imágenes de prueba. Se verificaron el portal, selección inicial, plano, resumen y diálogo de sala; el plano de prueba contenía 96 asientos y permitió seleccionar los 81 disponibles. No hubo desbordamiento horizontal de la página ni excepciones de JavaScript durante el recorrido. Las notificaciones dentro de un diálogo conservaron su posición respecto a la ventana y su botón recibió foco.

En la revisión posterior se comprobó una fila sin registros: administración conserva su número y diagnóstico; la compra la omite y mantiene las filas siguientes con sus números físicos. El título y el póster del resumen tienen la misma coordenada superior en móvil y escritorio. Los filtros de transacciones, con nombres largos seleccionados, no se intersectan ni salen de la ventana a 320, 390, 768 y 1440 píxeles. Se verificaron asimismo el cierre inferior después del plano, los encabezados compartidos, el contraste del cambio de contraseña en sus dos contextos y el cierre de sesión dentro del menú del perfil.

La emulación no sustituye una prueba en un teléfono físico. No se realizaron compras, envíos de correo ni modificaciones contra la base real. Los textos legales permanecen pendientes de contenido aprobado y se conservaron según lo acordado.

En el ajuste final de filtros y diálogos pasan las 1755 pruebas de los 119 archivos del frontend, sin errores no controlados. La cobertura global de líneas es 95,69 %. Las líneas ejecutables añadidas respecto al `HEAD` de este ajuste tienen cobertura del 100 % (2/2), al igual que las ramas añadidas (21/21); estos valores no incluyen los estilos CSS. También pasan lint, tipos, compilación y formato. La comprobación en Edge con API simulada verificó filtros de 44 píxeles sin solapamientos a 320, 390, 768 y 1440 píxeles, datos de sucursales sin recuadros, secciones de transacciones, acciones al final y la apariencia clara de los formularios de acceso. No se registraron excepciones de JavaScript durante el recorrido.

La revisión de secciones numeradas y contenedores de diálogo pasa 1762 pruebas en 120 archivos del frontend. La cobertura global de líneas es 95,83 %; las líneas ejecutables añadidas respecto al `HEAD` de esta revisión alcanzan 93,81 % (91/97), incluyendo `DialogSection`, y las ramas añadidas 96,02 % (217/226). También pasan lint, formato, tipos y compilación. Las pruebas conservan los contratos de guardado, validaciones locales, protección de dimensiones, confirmaciones y cierre durante solicitudes; las comprobaciones de errores identifican su campo, sin depender de cuál se muestre primero.

En Edge, con respuestas e imágenes simuladas, se verificaron los formularios numerados a 320, 390 y 1440 píxeles: no presentaron desbordamiento horizontal, los títulos conservaron su jerarquía y el desplazamiento permitió llegar a las acciones sin perder el encabezado. Se comprobaron también la altura de los botones, el color de las confirmaciones destructivas y la excepción visual de registro. No se registraron excepciones de JavaScript en ese recorrido ni se enviaron operaciones de guardado a la API real.

## Integración final con dev

Se integró `dev` en `c1e43d5` sobre el estado `3fc2d28` de esta rama. El único conflicto estaba en la prueba de selección de asientos: se conservaron las comprobaciones del límite de compra de `dev` y el texto singular «1 asiento disponible» de esta historia.

Se mantienen las reglas de compra, límites configurables, cancelación de funciones, protección de proyecciones con boletos vendidos y consultas de transacciones incorporadas desde `dev`. La selección de todos los asientos continúa disponible cuando el límite configurado permite comprar todos los libres; un límite inferior conserva su aviso y su restricción. Los avisos nuevos de función cancelada utilizan las variables de color existentes. Se conservan los pósteres, la alineación del resumen, el QR, la jerarquía de los diálogos y los indicadores compartidos de esta rama.

Resultados de la integración, verificados con consultas y solicitudes simuladas:

| Aplicación | Archivos de pruebas | Pruebas aprobadas | Cobertura global de líneas | Cobertura de líneas ejecutables añadidas |
| ---------- | ------------------: | ----------------: | -------------------------: | ---------------------------------------: |
| API        |                 122 |              2673 |                    98,24 % |                            100 % (39/39) |
| Web        |                 120 |              1766 |                    95,83 % |                              100 % (2/2) |

La cobertura añadida corresponde al diff contra `3fc2d28`, antes de integrar `dev`; no incluye estilos, tipos ni documentación. También pasan lint, tipos, compilación y las comprobaciones de formato de los archivos afectados. En dos documentos importados se ajustó únicamente el formato de tablas para cumplir Prettier. No se modificaron CI/CD ni SonarQube.

La revisión en Edge con API e imágenes simuladas comprobó el plano, la selección de todos los asientos libres, la presentación de un límite inferior, el resumen y el historial. En tamaños de 320, 390, 768 y 1440 píxeles, el resumen conserva el póster alineado con el título y los avisos de cancelación no generan desbordamiento horizontal de la página. El historial conserva el desplazamiento interno de la tabla. El QR sigue disponible en el resumen y no se registraron excepciones de JavaScript de la aplicación. Esta emulación no sustituye una comprobación en un teléfono físico.

Se importaron sin ejecutar las migraciones `20261102_global_settings.sql` y `20261102_ticket_limit_by_availability.sql`, junto con el esquema actualizado de `dev`. El despliegue requiere que la base tenga esos cambios aplicados en ese orden. No se realizaron operaciones contra Oracle, compras ni envíos de correo reales durante esta revisión.

## Revisión final de calendarios

El 4 de noviembre de 2026 se sustituyeron los ocho controles nativos pendientes en el formulario de proyecciones y en los filtros de proyecciones, transacciones e historial de compras. Se conservaron los contratos de las solicitudes, las restricciones existentes y los controles de hora. La validación de intervalos en proyecciones identifica los campos de fecha únicamente cuando el intervalo es inválido, sin marcarlos por errores de búsqueda u hora.

Pasan las 1776 pruebas de los 120 archivos del frontend, incluidas las de registro, creación de usuarios y compra que ya utilizaban el calendario. La cobertura global de líneas es 95,90 %; las líneas ejecutables añadidas respecto a `370a259` alcanzan 100 % (46/46), y las ramas añadidas 97,67 % (42/43). También pasan lint, formato, tipos y compilación. Las pruebas verifican selección y limpieza sin consultas duplicadas, fechas ISO en solicitudes, aplicación explícita del historial, límites, cierre, foco y cancelación con un clic desde ambos calendarios de proyecciones.

En Edge, con API simulada, se comprobaron los cuatro componentes a anchos de 320, 390, 768 y 1440 píxeles, incluyendo una ventana horizontal de 768 por 390. El calendario se mantuvo dentro del espacio visible, conservó el foco al abrir y se presentó sobre el contenido de los diálogos. No se observaron desbordamientos horizontales de la página ni excepciones de JavaScript. No se ejecutaron operaciones contra la base de datos real. La revisión utiliza emulación y no sustituye una prueba en un teléfono físico.
