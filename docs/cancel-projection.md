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

## Revisión de criterios de aceptación (16 de octubre de 2026)

| Criterio                                                                                                            | Estado        | Evidencia                                                                        |
| ------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------- |
| Al confirmar, el estado cambia a cancelada y la sala queda libre                                                    | Cumple        | `UPDATE … STATUS = 'CANCELLED'`; la detección de conflictos excluye `CANCELLED`  |
| Fallo de conexión o del backend: «No se pudo cancelar la proyección, intenta de nuevo»                              | Cumple        | Mensaje exacto en `CancelProjectionDialog.vue`                                   |
| Sin rol Administrador se deniega el acceso                                                                          | Cumple        | `AdministratorGuard` en la API (`403`); la sección no aparece para `EMPLOYEE`    |
| Con boletos vendidos, advertir «Esta función tiene boletos vendidos. Al cancelar, coordina el reembolso en oficina» | **No cumple** | No existe la consulta de boletos ni el mensaje                                   |
| Próxima (menos de 24 h) o en curso: reforzar la advertencia de reembolso urgente                                    | Cumple        | Aviso con `role="alert"` para `IN_PROGRESS` o inicio en menos de 24 h            |
| Cancelación irreversible desde la interfaz                                                                          | Cumple        | Ningún endpoint ni acción reactiva una proyección cancelada                      |
| Solo aplica a proyecciones activas; no se cancela algo ya cancelado                                                 | **Parcial**   | Cancelada y finalizada se rechazan con `409`, pero también se permite `INACTIVE` |

### Pendientes

1. **Advertencia de boletos vendidos.** Depende de la tabla `Tickets`, que
   crea `database/migrations/20261016_sales_invoices_products.sql` y que aún no
   está aplicada. Cuando exista:
   - el detalle de la proyección debe exponer cuántos boletos hay vendidos, es
     decir, boletos de facturas en estado `PAID`;
   - si hay alguno, el diálogo debe mostrar el texto exacto del criterio antes
     de confirmar.
2. **Proyecciones `INACTIVE`.** El criterio dice que solo se cancelan las
   activas, pero la API y la interfaz también permiten cancelar las inactivas.
   `IN_PROGRESS` sí debe poder cancelarse, porque el criterio de urgencia la
   menciona. Falta que el PO confirme si `INACTIVE` también se puede cancelar;
   si no, hay que quitarla de `CANCELLABLE_STATUSES` (web) y rechazarla en
   `cancelProjection` (API).
