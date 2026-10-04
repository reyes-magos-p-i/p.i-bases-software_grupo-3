# Desactivar un usuario

Desactivar conserva la fila, las credenciales, las direcciones y las relaciones
históricas. El usuario deja de aparecer en listados y búsquedas, no puede
consultarse ni modificarse mediante la gestión de usuarios y pierde el acceso.
Esta historia no incluye reactivación ni eliminación física.

## Permisos y protecciones

- Administradores: desactivar clientes, empleados y otros administradores.
- Empleados: desactivar clientes; no pueden desactivar personal.
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
solamente el estado dentro de una transacción. Un ID ausente o ya inactivo
produce `404`, sin cambios. Las desactivaciones de personal y los cambios de
rol usan `LOCK TABLE EMPLOYEES IN SHARE ROW EXCLUSIVE MODE` antes del bloqueo
de fila: serializan estas operaciones para proteger el último administrador.
Ese bloqueo puede hacer esperar otras escrituras de personal durante la
transacción. Se vuelve a comprobar el rol activo del administrador que desactiva
personal después de adquirir el bloqueo.

Las consultas internas de correo/proveedor conservan acceso a cuentas inactivas
para impedir duplicados o detectar un acceso social bloqueado. Las consultas
de gestión y de identidad filtran cuentas activas, incluidos los conteos y
todos los términos de búsqueda. No se aplica un filtro por estado a tablas de
compras ni a otros registros históricos.

## API y diálogo

- `PATCH /api/users/clients/:id/deactivate`: personal autorizado.
- `PATCH /api/users/employees/:id/deactivate`: administradores.
- ID: entero positivo dentro del rango seguro de JavaScript.
- Cuerpo: omitido o `{}`; no admite campos.
- Se requiere autenticación y el origen autorizado de la sesión.
- Éxito: `204` sin cuerpo.
- `400`: solicitud inválida; `401`: sesión no vigente; `403`: permiso u
  origen incorrecto; `404`: inexistente/inactivo; `409`: cuenta protegida;
  `500`: error interno sin detalles de Oracle.

El contrato está en [deactivate-user.openapi.yaml](deactivate-user.openapi.yaml).
El ícono de la tabla abre `DeactivateUserDialog`, que reutiliza `BaseModal`
y los colores de `variables.css`. Identifica al usuario por nombre e ID
visible y advierte que perderá acceso, conservando sus datos.

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
listado. Las pruebas HTTP usan controladores y DTO compilados, repositorios
reales y Oracle simulado; no desactivan cuentas de la base configurada.

En `apps/api`, ejecutar `npm run test:cov`, `npm run lint` y `npm run build`.
Después, `npm run test:e2e -- --runInBand --runTestsByPath test/users-deactivation.e2e-spec.ts`.
En `apps/web`, ejecutar `npm run test:cov`, `npm run lint` y `npm run build`.
En PowerShell con scripts deshabilitados, usar `npm.cmd`.

En navegador, comprobar cancelación, errores, foco y presentación móvil;
desactivar una cuenta de prueba, verificar su ausencia y probar una sesión
abierta previamente. Para pruebas manuales usar cuentas prescindibles porque
la reactivación no tiene interfaz en esta historia.
