# Listado y detalle de proyecciones (SCRUM-43)

Solo `ADMINISTRATOR`. No requiere cambios de base de datos adicionales a los de
[Crear proyección](create-projection.md).

## Endpoints

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/projections` | Listado paginado con filtros |
| `GET` | `/api/projections/filter-options` | Sucursales, todas las salas y películas con proyecciones |
| `GET` | `/api/projections/:id` | Detalle de una proyección |

Parámetros de `GET /api/projections` (todos opcionales y combinables):

| Parámetro | Valores |
| --- | --- |
| `page` | Entero ≥ 1 (por defecto 1) |
| `pageSize` | 10, 25, 50 o 100 (por defecto 10) |
| `search` | Texto (máx. 100) sobre el título o el ID de la proyección |
| `status` | `ACTIVE`, `INACTIVE`, `CANCELLED`, `IN_PROGRESS`, `FINISHED` |
| `branchId`, `theaterId`, `movieId` | Identificadores de las listas de `filter-options` |
| `dateFrom`, `dateTo` | `AAAA-MM-DD`, sobre la fecha de proyección |
| `timeFrom`, `timeTo` | `HH:mm`, sobre la hora de inicio |

Respuesta: `{ items, total, page, pageSize, totalPages }`, ordenada por hora de inicio.
Cada elemento incluye película, sucursal, sala, inicio, fin, estado y precio.

El detalle agrega duración de la película, póster, minutos de limpieza y anuncios
y fecha de creación (hora de Costa Rica). Si la proyección ya no existe responde
`404` con «Esta proyección ya no está disponible.».

Las proyecciones creadas antes de la migración pueden no tener precio ni
actividades; se muestran como «Sin precio» y «Sin registrar».
