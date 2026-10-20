# Activar y desactivar usuarios

Desactivar conserva la fila, las credenciales, las direcciones y las relaciones
históricas. El usuario pierde el acceso, pero permanece visible en los listados y
en el detalle de gestión con estado Inactivo. No puede modificarse hasta activarlo.
La reactivación habilita un inicio de sesión nuevo con las credenciales vigentes;
no restablece contraseñas ni elimina registros.

## Permisos y protecciones

- Administradores: activar y desactivar clientes, empleados y otros administradores.
- Empleados: activar y desactivar clientes; no pueden cambiar el estado del personal.
- Clientes: no tienen acceso a estas operaciones.
- Un administrador no puede desactivar su propia cuenta.
- Debe permanecer al menos un administrador activo. También se impide convertir
  al último administrador activo en empleado.

El JWT se valida contra la identidad vigente en cada solicitud. Las sesiones de
una cuenta desactivada reciben `401` desde su siguiente solicitud autenticada;
no es necesario esperar al vencimiento del token. El acceso local del personal
y las consultas de credenciales locales de clientes excluyen cuentas inactivas.
Google y Facebook rechazan cuentas inactivas antes de emitir un token o vincular
otro proveedor. El correo y las credenciales siguen reservados: registrar una
cuenta con el correo de un cliente inactivo no crea ni reactiva esa cuenta.

## Oracle

Se agregaron `CLIENTS.STATUS` y `EMPLOYEES.STATUS` como
`VARCHAR2(8 CHAR) DEFAULT 'ACTIVE' NOT NULL`. Los checks
`CK_CLIENTS_STATUS` y `CK_EMPLOYEES_STATUS` admiten solamente `ACTIVE` e
`INACTIVE`. Los registros anteriores quedaron activos y las nuevas inserciones
usan el valor predeterminado. No se modificaron fechas ni relaciones.

El cambio se aplicó directamente al esquema configurado, sin generar un archivo
SQL. Al preparar otro ambiente, ejecutar el siguiente DDL desde el cliente de
Oracle con el propietario de las tablas y comprobar primero si los objetos
existen. Oracle confirma cada DDL; ante una ejecución parcial, completar
únicamente los objetos faltantes.

```sql
ALTER TABLE CLIENTS ADD (STATUS VARCHAR2(8 CHAR) DEFAULT 'ACTIVE' NOT NULL);
ALTER TABLE CLIENTS ADD CONSTRAINT CK_CLIENTS_STATUS
  CHECK (STATUS IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE EMPLOYEES ADD (STATUS VARCHAR2(8 CHAR) DEFAULT 'ACTIVE' NOT NULL);
ALTER TABLE EMPLOYEES ADD CONSTRAINT CK_EMPLOYEES_STATUS
  CHECK (STATUS IN ('ACTIVE', 'INACTIVE'));
```

La API requiere estas columnas antes de iniciarse. La desactivación actualiza
el estado y revoca las sesiones y recuperaciones pendientes en una misma transacción,
mediante `PASSWORD_RECOVERIES.RESET_AT`. Si falla la revocación, también se revierte
el cambio de estado. La tabla de recuperación existente es un requisito; no se
requieren nuevas columnas ni migraciones para esta ampliación. Se consulta la fila con
`SELECT ... FOR UPDATE` antes de evaluar su estado: un ID ausente produce `404`
y una cuenta que ya tiene el estado solicitado produce `409`, sin cambios. Las activaciones y desactivaciones de personal y los cambios de
rol usan `LOCK TABLE EMPLOYEES IN SHARE ROW EXCLUSIVE MODE` antes del bloqueo
de fila: serializan estas operaciones para proteger el último administrador.
Ese bloqueo puede hacer esperar otras escrituras de personal durante la
transacción. Se vuelve a comprobar el rol activo del administrador que desactiva
personal después de adquirir el bloqueo.

Las consultas internas de correo/proveedor conservan acceso a cuentas inactivas
para impedir duplicados o detectar un acceso social bloqueado. Las consultas
de identidad siguen filtrando cuentas activas. Las consultas de gestión incluyen
ambos estados por defecto y permiten filtrarlos; el conteo usa los mismos filtros. No se aplica un filtro por estado a tablas de
compras ni a otros registros históricos.

## API y diálogo

- `PATCH /api/users/clients/:id/deactivate`: personal autorizado.
- `PATCH /api/users/employees/:id/deactivate`: administradores.
- `PATCH /api/users/clients/:id/activate`: empleados y administradores.
- `PATCH /api/users/employees/:id/activate`: administradores.
- ID: entero positivo dentro del rango seguro de JavaScript.
- Cuerpo: omitido o `{}`; no admite campos.
- Se requiere autenticación y el origen autorizado de la sesión.
- Éxito: `204` sin cuerpo.
- `400`: solicitud inválida; `401`: sesión no vigente; `403`: permiso u
  origen incorrecto; `404`: inexistente; `409`: cuenta con el estado solicitado o protegida;
  `500`: error interno sin detalles de Oracle.

El contrato está en [deactivate-user.openapi.yaml](deactivate-user.openapi.yaml).
El ícono de la tabla abre `UserStatusDialog`, que reutiliza `BaseModal`
y los colores de `variables.css`. Identifica al usuario por nombre e ID
visible y advierte los efectos de activar o desactivar, conservando sus datos.
La acción y el ícono cambian según el estado; Modificar queda deshabilitado para
cuentas inactivas. El detalle sigue disponible para ambos estados.

Cancelar, X, Escape y el fondo cierran sin escribir antes de confirmar.
Durante la escritura se bloquean el cierre y las confirmaciones duplicadas.
Al completar, se cierra el diálogo, se muestra éxito y se recarga el listado
con sus filtros, búsqueda y orden. El servidor ajusta la página si ya no existe.
La acción de la propia cuenta está deshabilitada en la tabla y protegida en API.

Un error muestra una advertencia accesible y permite cerrar. No se repite una
escritura automáticamente: ante una respuesta incierta se indica cerrar y
actualizar el listado antes de intentar otra vez. Los errores de sesión y
permisos reutilizan el flujo existente del dashboard.

## Verificación

Las pruebas unitarias comprueban transacciones, permisos, cuentas protegidas,
rechazo social, validación de sesión, confirmación, errores y actualización del
listado. Las pruebas HTTP aisladas usan controladores, DTO, guards y servicios
reales con repositorios simulados; las pruebas de repositorio verifican SQL,
bloqueos, commit y rollback con Oracle simulado. No desactivan cuentas de la base configurada.

Resultados locales del 16 de octubre de 2026:

- API: 78 suites y 1771 pruebas aprobadas; cobertura global de líneas 97,62% y de ramas 90,09%.
- Web: 49 suites y 855 pruebas aprobadas; cobertura global de líneas 95,25% y de ramas 89,59%.
- Líneas ejecutables nuevas frente a HEAD, incluidas las de archivos nuevos: 100% en ambos proyectos, según LCOV.
- Ramas nuevas: 96% en API y 94,83% en web.
- Compilación, ESLint y Prettier aprobados en ambos proyectos.

Las pruebas usan Oracle, SMTP y proveedores simulados; estos resultados no sustituyen
la comprobación de bloqueos en Oracle real ni la revisión visual en navegador.

En `apps/api`, ejecutar `npm run test:cov`, `npm run lint` y `npm run build`.
En `apps/web`, ejecutar `npm run test:cov`, `npm run lint` y `npm run build`.
En PowerShell con scripts deshabilitados, usar `npm.cmd`.

En navegador, comprobar cancelación, errores, foco y presentación móvil;
desactivar una cuenta de prueba y comprobar su estado Inactivo y el bloqueo de
edición. Probar una sesión abierta previamente, activar la cuenta y verificar que
esa sesión sigue recibiendo 401, mientras un nuevo login funciona. Comprobar también
un enlace de recuperación solicitado antes de la desactivación: no debe revivir.

Ambas transiciones avanzan la versión de sesión y eliminan los secretos de una
recuperación pendiente. Un cambio de estado sin solicitud de recuperación no inicia
un cooldown nuevo; se conserva el cooldown de una solicitud real existente. Activar
no renueva la fecha de contraseña, la contratación ni el registro, y no confirma
correos pendientes ni envía credenciales nuevas. Las cuentas sociales deben iniciar
sesión nuevamente con su proveedor.

El guardado de contraseña de cliente bloquea y comprueba la cuenta activa en la
misma transacción de escritura, evitando que una operación iniciada antes de la
desactivación pueda guardar después. La limpieza existente de registros públicos
pendientes elimina también su fila de recuperación antes de eliminar la cuenta,
manteniendo la integridad referencial y la retención ya establecida.
