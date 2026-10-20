# Modificar proyección (SCRUM-44)

Solo `ADMINISTRATOR` con contraseña vigente (`PasswordStatusGuard`); exige el
origen del frontend. No requiere cambios de base de datos.

## Endpoint

`PUT /api/projections/:id` reprograma una sola fecha:

```json
{
  "movieId": 3, "theaterId": 7,
  "startDate": "2026-07-22", "startTime": "21:00", "endTime": "00:55",
  "cleaningMinutes": 30, "advertisementMinutes": 15,
  "price": 4200, "status": "ACTIVE"
}
```

`price` y `status` (`ACTIVE` o `INACTIVE`) son opcionales: si se omiten se
conserva el valor actual. No se acepta `endDate`. Responde `200` con el detalle
actualizado (mismo formato que `GET /api/projections/:id`).

## Reglas

- Solo se modifican proyecciones `ACTIVE` o `INACTIVE`; las demás responden `409`
  «Solo se pueden modificar proyecciones activas o inactivas.».
- Aplican las mismas validaciones de [Crear proyección](create-projection.md):
  inicio no pasado, hora fin ≥ anuncios + película + limpieza, precio positivo.
- Sala o película no disponibles: `409` «El elemento seleccionado ya no está disponible.».
- Los conflictos de horario excluyen a la propia proyección y listan los choques.
- Bloquea la proyección y la sala durante la transacción; reemplaza sus actividades
  (anuncios y limpieza).
- Proyección inexistente: `404` «Esta proyección ya no está disponible.».

## Interfaz

La acción «Modificar» del listado (solo activas o inactivas) abre el formulario
precargado. «Guardar cambios» muestra la confirmación con cada campo
`valor anterior → valor nuevo`; «Deshacer» restaura los valores originales. Si
falla el guardado, el formulario conserva lo ingresado y muestra el motivo.
