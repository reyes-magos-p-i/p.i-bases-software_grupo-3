# Consistencia de interfaz — SCRUM-336

## Criterios compartidos

La tipografía principal es Helvetica, con Arial y sans-serif como alternativas. Los componentes usan los colores semánticos definidos en `apps/web/src/styles/variables.css`; los indicadores de error y éxito conservan sus colores propios. Los controles de teclado muestran un foco visible.

`LoadingState` es el indicador compartido para tablas, consultas y opciones de formularios. La variante `compact` permite usar la misma animación en espacios pequeños. La variante `surface="dark"` presenta el símbolo claro sobre fondos oscuros; la variante predeterminada mantiene el símbolo oscuro sobre fondos claros. Se conserva el tratamiento de movimiento reducido.

Los resultados de creación, modificación y eliminación o desactivación usan `NotificationPopup`. Las notificaciones flotantes se sitúan abajo a la derecha, permiten cierre con teclado y pausan su temporizador mientras tienen foco o el puntero encima. Cuando el navegador soporta Popover API, se presentan en su capa superior para no quedar recortadas por los diálogos nativos. Las validaciones de campos continúan junto a sus controles; las incidencias de carga conservan su contexto y la opción de reintentar.

Los textos de opciones compartidas muestran una inicial mayúscula sin modificar los identificadores enviados al servidor. Se conserva la escritura de siglas y formatos como IMAX y 70 mm. La terminología de venta usa «boleto».

Los diálogos comparten encabezados, espaciados, acciones y presentación de datos mediante `styles/dialog.css`, aplicado a `BaseModal` y a los contenedores nativos existentes. Los datos de consulta usan etiquetas y valores sin recuadros de entrada. Sucursales y transacciones utilizan secciones con títulos y separadores, sin numeración decorativa ni tarjetas interiores. Las acciones inferiores quedan después del contenido, incluido el plano de asientos y su editor. La X se mantiene accesible durante el desplazamiento. La tipografía no utiliza cursivas.

Inicio de sesión y registro son la excepción visual: usan `BaseModal` con `appearance="auth"` para conservar su superficie clara, título centrado en negrita y cierre en la esquina superior. Comparten el manejo de foco, nombre accesible, bloqueo de cierre durante solicitudes y restauración del desplazamiento con los demás diálogos.

Las barras de desplazamiento tienen una pista transparente y un indicador discreto que se adapta a superficies claras y oscuras, con colores centralizados en `variables.css`. No se oculta la posibilidad de desplazarse y se conserva la adaptación a colores forzados del navegador. Los filtros retiran ayudas de formato redundantes y mantienen sus nombres accesibles. Usuarios, salas, sucursales, proyecciones y transacciones comparten la altura `--filter-control-height` de 44 píxeles. Los selectores se ajustan al ancho de su columna y acortan visualmente los valores largos; las opciones completas siguen disponibles al desplegarlos. Transacciones y proyecciones alinean sus controles por el borde inferior para compensar las etiquetas de fechas y horas.

El cierre de sesión del portal se ofrece dentro del menú del perfil. El encabezado de cambio de contraseña utiliza texto claro cuando está sobre el fondo azul y oscuro cuando se integra en una superficie clara del perfil.

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
