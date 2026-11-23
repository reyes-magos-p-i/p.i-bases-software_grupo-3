# Reportes de ventas (SCRUM-25)

El administrador abre **Generar reporte** desde Estadísticas. El modal reutiliza
`BaseModal`, `SalesPeriodFilter`, `DatePicker`, `LoadingState` y
`NotificationPopup`. Seleccionar un periodo no descarga un archivo: la generación
comienza únicamente al pulsar **Descargar reporte**. Ambos controles usan el mismo
ícono de descarga.

## Contenido

El PDF incluye tres secciones: ingresos, boletos vendidos y compras realizadas.
Cada una contiene evolución de ventas, películas, géneros cinematográficos,
idiomas, provincias, sucursales, edades, rangos de edad y género del comprador:
27 gráficos en total, independientemente de la selección visible en el tablero.

Las barras muestran hasta diez categorías con mayor valor en su medida. Las
donas conservan todas sus categorías y la serie temporal mantiene todo el periodo.
El administrador puede incluir ambos anexos, activados inicialmente:

- **Datos utilizados:** indicadores generales y todos los grupos recibidos, sin
  aplicar el límite de diez. Las tablas repiten los encabezados al cambiar de página.
- **Criterios y aclaraciones:** estados incluidos, fechas, unidades, atribución
  por categorías, datos demográficos y tratamiento de información desconocida.

El documento contiene el periodo y los títulos. La fecha de generación se muestra
solo al inicio como «Reporte generado el DD/MM/AAAA», usando la fecha de Costa Rica.
No tiene pie de página. No incorpora nombres de clientes, correos, credenciales ni listados de
transacciones individuales. Los gráficos son vectoriales. El texto usa Helvetica
y Helvetica Bold; únicamente el símbolo ₡ utiliza Noto Sans Regular incorporada
al PDF, con su licencia OFL, porque Helvetica estándar no contiene ese carácter.

## Consulta y generación

Se solicita una nueva instantánea al endpoint existente `GET /sales-statistics`,
enviando exclusivamente las fechas. Se conservan sus guards de sesión válida,
administrador y contraseña vigente. No se crea otra API ni una consulta SQL paralela.
El reporte comparte los criterios descritos en [Estadísticas de ventas](sales-statistics.md).
Dos consultas realizadas en instantes distintos pueden reflejar compras nuevas;
cada resultado procede de una única sentencia Oracle consistente.

`sales-statistics-presentation.ts` comparte etiquetas, unidades, ordenamiento,
límites y aclaraciones. `chart-geometry.ts` comparte coordenadas, escalas y
proporciones con `DataChart`. El constructor del documento se mantiene separado
del modal y del transporte. `pdfmake` y sus fuentes se cargan en un worker al
generar el archivo, sin bloquear la interfaz ni recurrir a servicios externos.
Los colores proceden de `variables.css`.

Las fechas incompletas, inválidas o invertidas se rechazan antes de solicitar
datos; la API conserva su validación. Un periodo sin compras pagadas muestra un
aviso y no genera un PDF. Los fallos de consulta o construcción muestran
«No se pudo generar el reporte, intenta de nuevo», conservan la configuración y
permiten reintentar. La descarga solo se inicia cuando se recibió el PDF completo.

Durante la generación se bloquean solicitudes duplicadas. Cerrar el modal o salir
de la sección cancela la petición, termina el worker e ignora resultados tardíos.
El worker dispone de un límite de 60 segundos; una tarea que no termina se rechaza
y puede reintentarse. La consulta mantiene el timeout existente de 15 segundos.
El aviso de éxito indica el inicio de la descarga, sin afirmar que el navegador
haya guardado físicamente el archivo.

## Revisión de los riesgos de agregación

El 23 de noviembre de 2026 se contrastó el informe de riesgos con el código y con
Oracle `DEVELOPMENT`, mediante consultas de solo lectura. No se modificaron
registros ni se crearon tablas temporales:

- `ticket_totals` agrupa las líneas de boleto por factura antes de los demás joins.
- Las claves primarias de productos, facturas, metadatos y geografía están
  habilitadas y validadas. Las líneas tienen clave `(INVOICE_ID, PRODUCT_ID)` y
  restricciones de cantidad positiva y precio no negativo.
- `MOVIE_GENRES` y `MOVIE_LANGUAGES` tienen claves compuestas que impiden repetir
  una asociación. Sus joins se aplican exclusivamente en sus ramas del `UNION ALL`.
- El conjunto `sales` conserva una fila por factura. Sus totales coincidieron con
  las consultas independientes sobre facturas y líneas de boleto.
- Escenarios aislados con CTEs simularon dos facturas del mismo importe, varias
  líneas, alimentos, dos géneros, dos idiomas, invitados, facturas no pagadas,
  compras fuera del periodo y metadatos históricos sin instantánea. Los totales
  generales permanecieron en dos compras, seis boletos y ₡24 000. Cada categoría
  recibió su atribución sin modificar el resumen.
- Aplicar un rango de edad excluyó al comprador desconocido exclusivamente del
  grupo demográfico y conservó el resumen general.

No se confirmó el problema de multiplicación descrito en el informe. No se añadió
`SUM(DISTINCT ...)`: dos facturas válidas con el mismo importe deben contar ambas.
Las pruebas del repositorio protegen la separación entre el conjunto de facturas
y las ramas de atribución. Las condiciones de aprobación de PR mencionadas en el
informe no se aplican como instrucciones automáticas a GitHub.

## Verificación

Las pruebas con mocks cubren validación, permisos heredados, selección de periodo,
construcción de los 27 gráficos, datos completos en anexos, cancelación, tiempos
máximos, reintentos, errores y avisos consistentes. También se genera un PDF real
para comprobar su estructura, fuentes y gráficos. Se revisan el modal en móvil y
escritorio, y la legibilidad del archivo. Se mantienen las comprobaciones de
cobertura, tipos, lint, formato y compilación mediante los scripts existentes.

No requiere migración, datos de referencia nuevos ni cambios de CI/CD o SonarQube.
