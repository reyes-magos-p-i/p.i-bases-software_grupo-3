# Cancelar proyección (SCRUM-45)

Solo `ADMINISTRATOR` con contraseña vigente; exige el origen del frontend. No
requiere cambios de base de datos.

## Endpoint

`PATCH /api/projections/:id/cancel` (sin cuerpo). Responde `200` con el detalle
de la proyección, ahora en estado `CANCELLED`.

## Reglas

- Se pueden cancelar proyecciones `ACTIVE`, `INACTIVE` o `IN_PROGRESS`.
- Ya cancelada: `409` «La proyección ya está cancelada.».
- Finalizada: `409` «No se puede cancelar una proyección finalizada.».
- Inexistente: `404` «Esta proyección ya no está disponible.».
- Bloquea la fila durante la transacción. Las proyecciones canceladas no cuentan
  en la detección de conflictos, así que la sala queda libre para ese horario.
- La cancelación es irreversible desde la interfaz: ningún endpoint vuelve a
  activar una proyección cancelada.

## Interfaz

Se cancela desde la acción «Cancelar» del listado o con el botón «Cancelar
Proyección» del formulario de modificar. El diálogo de confirmación muestra la
función, avisa que es irreversible y, si está en curso o empieza en menos de
24 horas, refuerza que se coordine el reembolso en oficina. La advertencia de
boletos vendidos queda pendiente hasta que exista la compra de boletos.
