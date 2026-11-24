# Optimización de consultas

SCRUM-436. Se midieron las consultas principales de la API en `DEVELOPMENT`, con los datos ya
limpios de la SCRUM-434, y se mejoraron las 5 más lentas. Nunca se midió en `PRODUCTION`.

## Resultado

Las 5 consultas más lentas bajaron entre **96 y 99,4 %**, de unos 12 ms a entre 0,07 y 0,5 ms,
con las mismas filas. En total, las 42 sentencias medidas pasaron de 193 ms a 12 ms.

La causa no estaba en el SQL. La API se conectaba por el servicio `_high` de Autonomous Database,
que está hecho para reportes: ejecuta en paralelo las consultas con joins, aunque busquen una sola
fila por su llave primaria. Arrancar los procesos paralelos cuesta unos 10 ms, mucho más que leer
tablas de unos cientos de filas: 16 de las 42 sentencias tenían un plan paralelo.

| Cambio | Qué hace |
| --- | --- |
| **Servicio `_tp`** en `DB_CONNECT_STRING` | Es el servicio para aplicaciones transaccionales. No ejecuta en paralelo, así que esos ~10 ms desaparecen. Después del cambio, ninguna sentencia tiene un plan paralelo. |
| **6 índices** sobre llaves foráneas ([`20261123_foreign_key_indexes.sql`](../database/migrations/20261123_foreign_key_indexes.sql)) | `INVOICES(MOVIE_FUNCTION_ID)`, `THEATERS(BRANCH_ID)`, `MOVIE_FUNCTIONS(CREATED_BY)`, `CINEMA_MOVIES(MOVIE_ID)`, `EMPLOYEES(BRANCH_ID)` y `MOVIE_GENRES(GENRE_ID)`. Son las llaves que usan los joins y filtros de la API y no tenían índice. |

Con el volumen actual, los índices no cambian los tiempos de forma medible: con tan pocas filas,
leer la tabla completa cuesta lo mismo. Se agregan por dos razones. La primera es que evitan
recorridos completos cuando las tablas crezcan. La segunda es que, sin índice en la llave foránea,
borrar o actualizar el padre bloquea la tabla hija completa (por ejemplo, editar un empleado
bloqueaba `MOVIE_FUNCTIONS`). Ninguna consulta medida usa los índices nuevos en su plan actual.

## Las 5 consultas más lentas

Los 10 tiempos de cada una, en ms:

| Consulta | Antes, por `_high` | Después, por `_tp` + índices |
| --- | --- | --- |
| Transacciones · Opciones de filtros #1 | 12,31 · 11,95 · 12,65 · 13,70 · 13,43 · 12,70 · 12,14 · 13,09 · 12,62 · 12,20 | 0,296 · 0,233 · 0,259 · 0,220 · 0,217 · 0,214 · 0,252 · 0,218 · 0,211 · 0,216 |
| Proyecciones · Películas programadas #1 | 13,19 · 12,63 · 15,22 · 11,92 · 12,05 · 12,30 · 11,92 · 13,17 · 12,98 · 12,59 | 0,074 · 0,070 · 0,067 · 0,063 · 0,064 · 0,063 · 0,110 · 0,115 · 0,131 · 0,075 |
| Proyecciones · Detalle de proyección #1 | 13,55 · 15,62 · 13,29 · 12,34 · 12,49 · 12,64 · 12,11 · 12,28 · 12,24 · 13,76 | 0,198 · 0,164 · 0,148 · 0,142 · 0,140 · 0,142 · 0,158 · 0,165 · 0,145 · 0,141 |
| Películas · Detalle de película #1 | 13,59 · 12,89 · 12,60 · 12,51 · 12,21 · 11,99 · 11,70 · 11,92 · 11,79 · 12,59 | 0,292 · 0,220 · 0,205 · 0,198 · 0,266 · 0,204 · 0,201 · 0,193 · 0,225 · 0,200 |
| Compra de entradas · Funciones de la película #1 | 12,83 · 12,17 · 12,13 · 12,26 · 12,29 · 11,75 · 13,79 · 13,28 · 12,53 · 12,00 | 0,567 · 0,501 · 0,547 · 0,492 · 0,474 · 0,449 · 0,489 · 0,504 · 0,495 · 0,447 |

- **Mismas filas y mismo orden** en las 5 consultas. Se compararon las filas completas (hash).
- **Detalle de película** no tiene `ORDER BY` en sus joins de géneros e idiomas. En paralelo
  devolvía las mismas 8 filas en otro orden; en serie el orden es estable. Ordenarla queda en el
  backlog.

## Todas las consultas medidas

*Después* es la mediana de tres corridas completas. *Solo índices* son los índices nuevos,
todavía por `_high`. Cuatro consultas ya bajan en esa columna, pero no usan los índices nuevos:
Oracle las reoptimizó cuando se crearon los índices y dejó de ejecutarlas en paralelo.

| # | Consulta | Antes (ms) | Solo índices (ms) | Después (ms) | Cambio | Plan paralelo antes |
| --: | --- | --: | --: | --: | --: | :-: |
| 1 | Transacciones · Opciones de filtros #1 **(top 5)** | 12,638 | 12,235 | 0,250 | -98,0 % | sí |
| 2 | Proyecciones · Películas programadas #1 **(top 5)** | 12,610 | 11,277 | 0,072 | -99,4 % | sí |
| 3 | Proyecciones · Detalle de proyección #1 **(top 5)** | 12,566 | 12,672 | 0,165 | -98,7 % | sí |
| 4 | Películas · Detalle de película #1 **(top 5)** | 12,358 | 13,208 | 0,214 | -98,3 % | sí |
| 5 | Compra de entradas · Funciones de la película #1 **(top 5)** | 12,275 | 12,688 | 0,475 | -96,1 % | sí |
| 6 | Historial de compras · Detalle de compra #2 | 11,851 | 0,073 | 0,073 | -99,4 % | no* |
| 7 | Cartelera · Horarios alternativos del boleto #1 | 11,514 | 0,139 | 0,142 | -98,8 % | sí |
| 8 | Usuarios · Detalle de empleado #1 | 11,235 | 10,971 | 0,038 | -99,7 % | sí |
| 9 | Usuarios · Detalle de cliente #1 | 11,064 | 10,150 | 0,034 | -99,7 % | sí |
| 10 | Cartelera · Boleto #1 | 10,706 | 13,701 | 0,031 | -99,7 % | sí |
| 11 | Transacciones · Detalle de transacción #2 | 10,572 | 13,261 | 0,052 | -99,5 % | sí |
| 12 | Películas · Listado de películas #1 | 10,529 | 10,686 | 0,081 | -99,2 % | sí |
| 13 | Usuarios · Opciones del listado #1 | 10,364 | 11,176 | 0,066 | -99,4 % | sí |
| 14 | Historial de compras · Historial del cliente #1 | 10,075 | 11,512 | 0,030 | -99,7 % | sí |
| 15 | Historial de compras · Detalle de compra #1 | 8,434 | 0,055 | 0,060 | -99,3 % | sí |
| 16 | Historial de compras · Historial del cliente #2 | 6,995 | 0,526 | 0,503 | -92,8 % | sí |
| 17 | Transacciones · Detalle de transacción #1 | 6,691 | 0,102 | 0,106 | -98,4 % | sí |
| 18 | Compra de entradas · Mapa de asientos #2 | 4,492 | 4,215 | 3,644 | -18,9 % | no |
| 19 | Salas · Asientos de la sala #1 | 2,436 | 2,386 | 2,471 | +1,4 % | no |
| 20 | Transacciones · Listado de transacciones #2 | 1,164 | 1,143 | 1,179 | +1,3 % | no |
| 21 | Proyecciones · Listado de proyecciones #2 | 0,593 | 0,569 | 0,577 | -2,6 % | no |
| 22 | Salas · Listado de salas #1 | 0,342 | 0,345 | 0,355 | +4,0 % | no |
| 23 | Transacciones · Opciones de filtros #2 | 0,293 | 0,353 | 0,327 | +11,4 % | no |
| 24 | Sucursales · Listado de sucursales #2 | 0,274 | 0,284 | 0,281 | +2,9 % | no |
| 25 | Usuarios · Listado de empleados #2 | 0,193 | 0,191 | 0,196 | +1,8 % | no |
| 26 | Usuarios · Listado de clientes #2 | 0,191 | 0,172 | 0,173 | -9,2 % | no |
| 27 | Proyecciones · Películas disponibles #1 | 0,082 | 0,073 | 0,076 | -7,3 % | no |
| 28 | Sucursales · Todas las sucursales #1 | 0,069 | 0,067 | 0,067 | -2,9 % | no |
| 29 | Proyecciones · Sucursales y salas #1 | 0,067 | 0,068 | 0,065 | -3,7 % | no |
| 30 | Proyecciones · Sucursales y salas #2 | 0,057 | 0,057 | 0,063 | +10,5 % | no |
| 31 | Transacciones · Listado de transacciones #1 | 0,043 | 0,041 | 0,046 | +6,9 % | no |
| 32 | Sucursales · Listado de sucursales #1 | 0,041 | 0,044 | 0,038 | -6,2 % | no |
| 33 | Compra de entradas · Mapa de asientos #1 | 0,039 | 0,036 | 0,036 | -10,1 % | no |
| 34 | Compra de entradas · Función #1 | 0,038 | 0,037 | 0,036 | -3,9 % | no |
| 35 | Salas · Detalle de sala #1 | 0,036 | 0,037 | 0,043 | +17,8 % | no |
| 36 | Proyecciones · Listado de proyecciones #1 | 0,028 | 0,035 | 0,026 | -7,3 % | no |
| 37 | Compra de entradas · Límites de compra #1 | 0,027 | 0,024 | 0,027 | 0,0 % | no |
| 38 | Compra de entradas · Mapa de asientos #3 | 0,025 | 0,025 | 0,034 | +34,0 % | no |
| 39 | Sucursales · Detalle de sucursal #1 | 0,025 | 0,025 | 0,026 | +4,0 % | no |
| 40 | Usuarios · Listado de clientes #1 | 0,022 | 0,022 | 0,021 | -4,4 % | no |
| 41 | Usuarios · Listado de empleados #1 | 0,022 | 0,021 | 0,025 | +13,6 % | no |
| 42 | Compra de entradas · Película #1 | 0,021 | 0,021 | 0,020 | -4,8 % | no |

\* Su plan (`EXPLAIN PLAN`) era en serie, pero por `_high` el grado de paralelismo se decide al
ejecutar, y en la medición inicial sí corrió en paralelo.

**Ninguna consulta quedó más de un 10 % más lenta de forma real.** Las filas 23, 30, 35, 38 y 41
suben entre 3 y 34 microsegundos, en consultas de menos de 0,33 ms. Cuatro tienen exactamente el
mismo plan antes y después. La quinta (fila 41, contar empleados) ahora recorre el índice nuevo
`IX_EMPLOYEES_BRANCH` en vez de la llave primaria, que es equivalente. Esas diferencias son menores
que la variación entre corridas completas, que es de ±15 % a esa escala.

## Escrituras

UT-038 pide que los índices no vuelvan más lentos los `INSERT` de la compra. Se midieron la compra
de un boleto (factura, línea y boleto) y la creación de una proyección. Cada repetición se deshace
con `ROLLBACK`.

| Escritura | Antes (ms) | Después, mediana de 4 corridas (ms) |
| --- | --: | --: |
| Compra de un boleto | 0,396 | 0,40 (corridas entre 0,34 y 0,49) |
| Creación de una proyección | 0,159 | 0,16 (corridas entre 0,14 y 0,20) |

## Cómo se midió

[`database/performance/benchmark.cjs`](../database/performance/benchmark.cjs) llama a los métodos
reales de los repositorios compilados (`apps/api/dist`), con los parámetros de
[`scenarios.cjs`](../database/performance/scenarios.cjs), dentro de una transacción de solo lectura.
Mide exactamente el SQL y los binds que envía la API.

- Cada sentencia se ejecuta **del lado del servidor** con `DBMS_SQL`: una vez para calentar y
  luego 10 veces más, leyendo todas las filas. Se guarda la mediana de las 10. Medir desde Node
  habría medido sobre todo la red, unos 100 ms por viaje.
- Se guarda el plan (`EXPLAIN PLAN`) y un hash de las filas de cada sentencia.
- Los resultados, con los 10 tiempos, el SQL y el plan de cada sentencia, están en
  [`database/performance/results/`](../database/performance/results/).
- Quedó fuera, por decisión del equipo, la consulta del catálogo del portal: se reescribe en la
  SCRUM-437.

```sh
cd apps/api && npm run build && cd ../..
node database/performance/benchmark.cjs measure database/performance/results/before.json
DB_CONNECT_STRING=<base>_tp node database/performance/benchmark.cjs measure database/performance/results/after.json
node database/performance/benchmark.cjs compare database/performance/results/before.json database/performance/results/after.json
node database/performance/benchmark.cjs inserts database/performance/results/inserts-after.json
```

El script se niega a correr si la sesión no está en `DEVELOPMENT`.

## Despliegue

1. **Índices.** Ejecutar la migración como dueño del esquema, primero en `DEVELOPMENT` (ya
   aplicada el 23/11/2026) y después en `PRODUCTION`. No necesita permisos nuevos para
   `CINETADEL_APP`.
2. **Servicio.** Cambiar el alias de `DB_CONNECT_STRING` de `<base>_high` a `<base>_tp` en cada
   `apps/api/.env`: equipos locales, servidor de producción y servidor espejo. Reiniciar la API.
   La wallet ya incluye el alias `_tp`.

## Backlog

- Optimizar la consulta del catálogo del portal después de la SCRUM-437.
- Agregar `ORDER BY` al detalle de película (`movies.repository.ts`, `findOne`), para que el
  orden de géneros e idiomas no dependa del plan.
- *Mapa de asientos #2* (3,6 ms) devuelve los 600 asientos de la sala más grande. Su costo es
  leerlos, no el plan.
