# Crear proyección (SCRUM-42)

## Preparación de la base de datos

Aplicar una sola vez, conectado como `PRODUCTION`:

1. [`database/migrations/20261007_movie_functions_scheduling.sql`](../database/migrations/20261007_movie_functions_scheduling.sql):
   crea `CINEMA_MOVIES`, `ACTIVITIES` y `MOVIE_FUNCTIONS_ACTIVITIES`; agrega
   `PRICE`, `STATUS` y `CREATED_AT` a `MOVIE_FUNCTIONS`; crea el job
   `MOVIE_FUNCTION_STATUS_JOB`.
2. Solo en pruebas: [`database/seeds/20261007_movie_functions_stub_data.sql`](../database/seeds/20261007_movie_functions_stub_data.sql)
   (películas de ejemplo disponibles en todas las sucursales).

## Reglas

- Solo `ADMINISTRATOR`; `POST` exige además el origen del frontend.
- La película debe estar disponible en la sucursal de la sala
  (`CINEMA_MOVIES.IS_AVAILABLE = 1`) y la sala activa (`THEATERS.IS_ACTIVE = 1`).
- Hora fin sugerida = inicio + anuncios + duración de la película + limpieza.
  El administrador puede ampliarla, nunca reducirla por debajo de esa suma.
  Si la hora fin no es posterior a la de inicio, termina al día siguiente.
- Un rango de fechas crea una proyección por día (máximo 31) a la misma hora.
  Es todo o nada: si un día choca con otra proyección no cancelada de la misma
  sala, no se crea ninguna y se listan los horarios en conflicto (los primeros
  5 y cuántos más hay).
- Las horas se guardan en hora local de Costa Rica. No se aceptan inicios en el pasado.
- Precio por persona: ₡3500 por defecto (`DEFAULT_TICKET_PRICE`, se envía en `/options`) hasta que exista la configuración global; el administrador puede cambiarlo por proyección. Si `price` se omite, se usa el valor por defecto.
- Estado inicial `ACTIVE` o `INACTIVE`. El job pasa cada minuto `ACTIVE` →
  `IN_PROGRESS` al iniciar y → `FINISHED` al terminar.

## Endpoints

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/projections/options` | Sucursales, salas activas y `defaultTicketPrice` |
| `GET` | `/api/projections/available-movies?branchId=&search=` | Búsqueda de películas disponibles (máx. 10) |
| `POST` | `/api/projections` | Crea las proyecciones |

Cuerpo de `POST`:

```json
{
  "movieId": 3, "theaterId": 7,
  "startDate": "2026-07-21", "endDate": "2026-07-29",
  "startTime": "21:00", "endTime": "00:55",
  "cleaningMinutes": 30, "advertisementMinutes": 15,
  "price": 4500, "status": "ACTIVE"
}
```

Respuestas: `201` con `{ status, price, projections: [{ movieFunctionId, startTime, endTime }] }`;
`400` validación; `403` sin permisos u origen no autorizado;
`409` sala/película no disponible o conflicto de horario.
