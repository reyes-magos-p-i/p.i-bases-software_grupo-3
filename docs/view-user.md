# Ver un usuario

El botón Ver de cada fila abre un diálogo de solo lectura y consulta los datos
vigentes del usuario seleccionado. El ID numérico y la sección identifican el
registro: un cliente y un empleado pueden compartir el mismo número sin ser la
misma persona. Los IDs visibles conservan los prefijos `CL`, `EMP` y `ADM`.

## Permisos y API

- `GET /api/users/clients/:id`: empleados y administradores.
- `GET /api/users/employees/:id`: solo administradores, incluidos los detalles de
  otros administradores.

Las rutas verifican el JWT y la identidad vigente. El guard de personal rechaza
tokens de clientes, incluso si son válidos, y protege también las rutas de listado.
No se acepta el rol enviado por el navegador como autorización. El ID debe ser un
entero positivo dentro del rango seguro de JavaScript. Las consultas usan parámetros
Oracle y no unen tablas de credenciales ni devuelven contraseñas, hashes, sales o tokens.

El contrato está en [`view-user.openapi.yaml`](view-user.openapi.yaml). Se requiere
el esquema vigente con las fechas de registro y contratación incorporadas en la
historia del listado. Esta historia no modifica la base de datos.

## Campos y presentación

Se muestran primer y segundo nombre, primer y segundo apellido, nacimiento, celular,
correo y rol. La dirección se desglosa en provincia, cantón, distrito y detalle.
Los clientes incluyen su género e idioma existentes. El personal incluye sucursal
y fecha de contratación. Todos muestran ID y fecha de registro.

Los nombres y textos se conservan tal como están almacenados. Las fechas de nacimiento
y contratación llegan como `YYYY-MM-DD` y se presentan como `DD/MM/YYYY`, sin cambio
de zona horaria. La fecha de registro llega en UTC y se presenta en la zona de Costa
Rica. Los campos ausentes muestran «Sin registrar» y las fechas desconocidas,
«Desconocida». Un género no informado no equivale a «Prefiero no decirlo».

Los campos nuevos de «Otra identidad» quedan pospuestos. Se usa el nombre
Administrador para el rol técnico `ADMINISTRATOR`, igual que en creación y listado.
No se añade un estado activo/inactivo porque ese dato no existe en el modelo vigente.
El historial de compras no forma parte de esta historia.

`UserDetailDialog` reutiliza `BaseModal` y adopta la estética del diálogo de creación:
encabezado vino, grupos de campos y dos columnas, con una columna en móvil. Los
colores proceden de `variables.css`. Los datos se presentan como texto seleccionable,
sin controles de edición. El modal permite cerrar con la X, el botón Cerrar, Escape
o el fondo; bloquea el desplazamiento de la página y devuelve el foco al botón que
lo abrió. Modificar y Desactivar permanecen desactivados.

## Estados y errores

Al abrir se muestra la carga. La consulta tiene un timeout de 10 segundos.
Una falla de conexión o de la API muestra un mensaje y permite reintentar la lectura.
No se inicia ningún reintento automático ni ninguna operación de escritura.

- `400`: ID inválido, rechazado antes de consultar el usuario.
- `401`: sesión ausente o expirada; se reutiliza el flujo de sesión del dashboard.
- `403`: falta de permiso; se reutiliza la actualización de permisos del dashboard.
- `404`: el usuario ya no existe, por ejemplo si fue eliminado después del listado.
- `500`: falla interna, sin información de infraestructura en la respuesta.

Cerrar, cambiar de sección, cambiar de permisos o desmontar el diálogo cancela la
solicitud pendiente. Cambiar de selección retira los datos anteriores antes de cargar
los nuevos. Las respuestas tardías de solicitudes canceladas no se muestran.

## Verificación

1. Como administrador, seleccionar un cliente, un empleado y un administrador.
   Comprobar campos, dirección, fechas y prefijos. Como empleado, consultar clientes.
2. Comprobar que una cuenta de cliente no puede usar el listado ni las rutas de
   detalle del personal, y que un empleado recibe `403` al consultar personal.
3. Consultar un ID inexistente y uno inválido: distinguir `404` de `400`.
4. Detener la API y comprobar el error y el reintento. Cerrar durante una solicitud
   pendiente y volver a abrir otro registro; no debe reaparecer la respuesta anterior.
5. Comprobar X, Cerrar, Escape, foco, texto seleccionable y ventana móvil.

Ejecutar `npm run test:cov`, `npm run lint` y `npm run build` en ambos proyectos.
Después del build de la API, ejecutar
`npm run test:e2e -- --runInBand --runTestsByPath test/user-detail.e2e-spec.ts`.
En PowerShell con scripts deshabilitados, usar `npm.cmd`.
Las pruebas automatizadas simulan Oracle y ejercitan HTTP con DTO compilados;
la comprobación visual en navegador complementa estas pruebas.
