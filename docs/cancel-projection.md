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
boletos vendidos y la gestión de reembolsos se definen en el Sprint 3 (ver
abajo).

## Revisión de criterios de aceptación (16 de octubre de 2026)

| Criterio                                                                                                            | Estado           | Evidencia                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| Al confirmar, el estado cambia a cancelada y la sala queda libre                                                    | Cumple           | `UPDATE … STATUS = 'CANCELLED'`; la detección de conflictos excluye `CANCELLED`                 |
| Fallo de conexión o del backend: «No se pudo cancelar la proyección, intenta de nuevo»                              | Cumple           | Mensaje exacto en `CancelProjectionDialog.vue`                                                  |
| Sin rol Administrador se deniega el acceso                                                                          | Cumple           | `AdministratorGuard` en la API (`403`); la sección no aparece para `EMPLOYEE`                   |
| Con boletos vendidos, advertir «Esta función tiene boletos vendidos. Al cancelar, coordina el reembolso en oficina» | Cumple | Se complementa en el Sprint 3 junto con las reglas de negocio sobre reembolsos (gestion de reembolsos automaticos)                                               |
| Próxima (menos de 24 h) o en curso: reforzar la advertencia de reembolso urgente                                    | Cumple           | Aviso con `role="alert"` para `IN_PROGRESS` o inicio en menos de 24 h                           |
| Cancelación irreversible desde la interfaz                                                                          | Cumple           | Ningún endpoint ni acción reactiva una proyección cancelada                                     |
| Solo aplica a proyecciones activas; no se cancela algo ya cancelado                                                 | Cumple           | Cancelada o finalizada se rechaza con `409`; una inactiva no está cancelada y se puede cancelar |

## Reembolsos y boletos vendidos (Sprint 3)

La advertencia de boletos vendidos, la notificación de reembolsos y su gestión
quedan fuera de los criterios de aceptación de este sprint:

- Se gestionarán con Stripe y con los estados de pago de cada compra.
- Lo que se haga con cada compra dependerá del tiempo transcurrido desde que se
  realizó.
- Esas reglas aún no están definidas; corresponden al Sprint 3.

Mientras tanto, el diálogo mantiene el aviso de coordinar el reembolso en
oficina cuando la función está en curso o empieza en menos de 24 horas.
