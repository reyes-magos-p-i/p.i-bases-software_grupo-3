# Historial de compras — SCRUM-347

El cliente consulta sus compras desde el menú lateral del perfil, en «Historial de compras». Las rutas `/historial-compras` y `/historial-compras/:id` llevan a esa sección; sin sesión, la guarda de cliente redirige al inicio de sesión. Una factura es una compra: el administrador la ve como `FAC-000123` y el cliente como `ORD-000123`.

## Lista

- Muestra fecha, número de orden, película, boletos, total y estado (`Pagada` o `Cancelada`), de la más reciente a la más antigua, con diez compras por página.
- La cuenta se obtiene de la sesión, por lo que solo aparecen compras propias.
- **Buscar** acepta parte del número de orden: «0122» encuentra `ORD-000122`.
- **Desde** y **Hasta** filtran por fecha de compra en hora de Costa Rica, con ambos extremos incluidos.
- Si «Desde» es posterior a «Hasta», se muestra la alerta y la lista no cambia.

## Detalle

El ícono de ojo abre un modal con productos, cantidades, precios, método de pago y el QR de la compra. La compra abierta queda en la URL (`/account/profile?section=purchases&purchaseId=123`), de modo que el enlace se puede volver a abrir.

La API responde 404 tanto si la compra no existe como si es de otra cuenta, para no revelar qué números de orden existen. La web muestra en ambos casos «No tienes acceso a esta compra». Las facturas sin instantánea muestran todas sus líneas, incluida la comida, para que los productos sumen el total.

## Función cancelada

Si se cancela la función de una compra, el detalle muestra «Esta función fue cancelada» y la lista agrega «Función cancelada» junto al estado, que sigue siendo el de la factura. Si todos los boletos se reprogramaron a otra función vigente, la compra no se marca como cancelada. El correo de boletos usa el mismo aviso.

## Mensajes

| Situación                  | Texto                                                       |
| -------------------------- | ----------------------------------------------------------- |
| Sin compras                | Aún no tienes compras registradas                           |
| Filtro sin resultados      | No se encontraron compras con ese criterio                  |
| Rango de fechas inválido   | La fecha inicial no puede ser posterior a la fecha final    |
| Compra de otra cuenta      | No tienes acceso a esta compra                              |
| Error al cargar la lista   | No se pudo cargar el historial de compras, intenta de nuevo |
| Error al cargar el detalle | No se pudo cargar el detalle de la compra, intenta de nuevo |

## Diferencias con Figma

El plan de pruebas UT-058..075 prevalece sobre el prototipo: la sección vive en el perfil en lugar de una página propia, el número se muestra como `ORD-`, la búsqueda es solo por número de orden y el estado es el de la factura, no el de la función.

Contrato: [OpenAPI de compra](./ticket-purchase.openapi.yaml).
