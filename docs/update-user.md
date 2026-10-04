# Modificar un usuario

El ícono Modificar abre el usuario seleccionado en un diálogo con la estética de
creación y detalle. Reutiliza `BaseModal`, los íconos Bootstrap y exclusivamente
colores de `variables.css`. Desactivar abre el diálogo de confirmación de su propia historia.

## Alcance aprobado

- Administradores: modificar clientes y personal. Empleados: modificar clientes.
- Editables: nombres, apellidos, correo, celular y dirección; también sucursal para personal. El personal puede cambiar entre Empleado
  y Administrador; Cliente permanece fijo y no se muestra como campo.
- ID, nacimiento, registro y contratación son de
  referencia. La API rechaza estos campos si se intentan enviar.
- Género y cambio de contraseña quedan pospuestos por decisión del usuario.
- No se modifica el esquema de Oracle. El detalle de dirección conserva su límite
  actual de **255 bytes UTF-8**, no los 500 caracteres del criterio original.
  Los caracteres con acentos y los emojis pueden ocupar varios bytes.

## Formulario y confirmación

Se cargan datos actuales y catálogos de provincia, cantón y distrito; para personal,
también se consulta el catálogo existente de sucursales. Cambiar una
provincia reinicia cantón y distrito; cambiar cantón reinicia distrito. Si los
catálogos fallan, se pueden reintentar sin perder el borrador y editar los demás
campos mientras la dirección permanece intacta.

Los datos fijos se presentan como texto, sin recuadros similares a controles editables.
Cada nombre y apellido conserva el límite de creación de 100 bytes UTF-8 y se
eliminan espacios externos. Primer nombre es obligatorio; segundo nombre es opcional.
Los apellidos son opcionales en clientes y obligatorios en personal. Un campo
opcional vacío se guarda como `null`; los campos omitidos permanecen intactos.

Guardar cambios valida los campos modificados y muestra una advertencia con la
lista de campos afectados. Cancelar, X o Escape antes de confirmar no escribe
datos. Volver a editar conserva el borrador. Confirmar cambios envía una sola
solicitud; mientras se procesa, los controles de confirmación y cierre se bloquean.

La validación muestra mensajes junto a cada campo. El correo se normaliza a
minúsculas, sin espacios externos, y tiene un máximo de 150 bytes UTF-8. El celular
acepta ocho dígitos con inicio 6, 7 u 8, separador de espacio o guion entre grupos
de cuatro, y prefijo opcional `+506`; se almacena como ocho dígitos. La validación
comprueba formato, sin verificar la propiedad ni actividad de la línea.

Dirección y celular son opcionales en clientes: se pueden eliminar con `null`.
En personal, celular, dirección y apellidos enviados deben ser no nulos. El detalle de dirección es
opcional. El género existente no se cambia. Los datos históricos no modificados
no se revalidan ni se sobrescriben; un teléfono histórico con otro formato no
impide modificar el correo.

Después de una respuesta exitosa se cierra el diálogo, aparece el mensaje de éxito
y se actualiza el listado conservando búsqueda, filtros, orden y página cuando
sea posible. Editar al personal de la sesión actual refresca su identidad y
permisos; un administrador que pase a Empleado vuelve a la sección Clientes.

## API y persistencia

- `GET /api/users/edit-options`: catálogos de dirección, para personal autorizado.
- `PATCH /api/users/clients/:id`: edición parcial de un cliente.
- `PATCH /api/users/employees/:id`: edición parcial de personal, solo administradores.

Las modificaciones requieren autenticación de personal y el origen autorizado de
la sesión. Un token de cliente no autoriza estos endpoints. El cuerpo solo incluye
campos modificados; la API rechaza cuerpos vacíos y propiedades desconocidas.

Cada modificación usa una transacción Oracle. Se bloquea la fila seleccionada,
se comprueba su existencia y se valida la unicidad del correo dentro del tipo de
usuario, excluyendo al usuario seleccionado. La restricción única también protege
frente a escrituras concurrentes. Solo se actualizan las columnas enviadas.

Modificar una dirección inserta una nueva fila y cambia la referencia únicamente
del usuario seleccionado. No se actualiza ni elimina la dirección anterior,
porque puede estar compartida con otros usuarios o empresas. Si alguna escritura
falla, la transacción revierte también la nueva dirección.

No se accede ni se escribe en tablas de credenciales, y no se envía correo.
Cambiar el correo modifica el identificador del acceso local; conserva las
vinculaciones sociales existentes por ID de proveedor. Cambiar el rol modifica
los permisos consultados por la autenticación en solicitudes posteriores.

## Errores y verificación

`400`: entrada inválida, campos no admitidos o ningún cambio; `401`: sesión no
vigente; `403`: permiso u origen incorrecto; `404`: usuario inexistente o inactivo; `409`:
correo duplicado o último administrador activo; `500`: fallo inesperado sin detalles internos en la respuesta.

Los errores conocidos conservan el borrador y muestran avisos generales o por
campo. Ante un fallo de red o respuesta inesperada no se repite automáticamente
la escritura: el resultado podría haberse confirmado en el servidor. El diálogo
indica cerrar y volver a consultar los datos antes de modificar otra vez.

Pruebas manuales sugeridas:

1. Editar clientes como empleado y personal como administrador; revisar permisos.
2. Revisar datos inmutables, validaciones y dirección con acentos.
3. Cancelar antes de confirmar y regresar al formulario desde la advertencia.
4. Guardar y comprobar éxito, listado actualizado y detalle con los datos nuevos.
5. Probar correo duplicado, usuario eliminado y desconexión antes/durante guardado.
6. Editar el rol de la sesión y revisar menú y permisos con cuentas de prueba.
7. Revisar teclado, foco y presentación móvil.

En `apps/api`, ejecutar `npm run test:cov`, `npm run lint` y `npm run build`;
después del build, `npm run test:e2e -- --runInBand test/users-update.e2e-spec.ts`.
En `apps/web`, ejecutar `npm run test:cov`, `npm run lint` y `npm run build`.
En PowerShell con scripts deshabilitados, usar `npm.cmd`.
Las pruebas automatizadas simulan Oracle; la inspección visual en navegador y
la comprobación con la base real complementan estas verificaciones.

El contador de dirección muestra caracteres con el formato `1/255`, igual que en creación. La validación conserva el límite de 255 bytes de Oracle. Cambiar sucursal reutiliza el catálogo existente y valida su existencia antes de guardar.

Creación, edición y registro público comparten las reglas de los campos equivalentes:
celular de Costa Rica con inicio 6, 7 u 8 y almacenamiento como ocho dígitos,
nombres con límite de 100 bytes y correo con límite de 150 bytes. Los nombres
se recortan y el correo se recorta y convierte a minúsculas. Cada flujo conserva
sus campos obligatorios; edición valida los valores modificados para preservar
datos históricos que no se están cambiando. La API aplica las mismas reglas.

## Cuentas activas y último administrador

Las modificaciones excluyen cuentas inactivas (404). Los cambios de rol se
serializan con las desactivaciones de personal mediante un bloqueo Oracle de
tabla antes del bloqueo de fila. No se permite convertir al último administrador
activo en empleado (409); debe existir otro administrador activo. Los correos de
cuentas inactivas siguen reservados. Ver [Desactivar un usuario](deactivate-user.md).
