# Recuperar contraseña

El vínculo «Olvidé mi contraseña» del modal de acceso permite solicitar una
recuperación para clientes o personal. El correo incluye un enlace a
`/recover-password#<token>` y una contraseña temporal. Ambos vencen en 30 minutos.
La contraseña temporal sirve únicamente para completar la recuperación; no
reemplaza la contraseña actual ni permite iniciar sesión.

La pantalla reutiliza `ChangePasswordView.vue`, la confirmación de contraseña,
las reglas del cambio autenticado y la selección de vigencia de 30, 60, 90 o
120 días. Se conserva el estilo de la rama y sus variables de colores.

## Cuentas elegibles

- Clientes activos con contraseña local y sin confirmación de correo pendiente.
- Empleados y administradores activos con credenciales locales.
- El tipo de cuenta se toma del modal desde el que se solicita la recuperación;
  un mismo correo puede corresponder a cuentas independientes de cliente y personal.
- Las cuentas exclusivamente sociales conservan el acceso por Google/Facebook.
- La respuesta de solicitud es la misma para cuentas elegibles, inexistentes,
  inactivas, pendientes, sociales o que hayan solicitado otro correo recientemente.
  No se revelan los motivos de exclusión.

## Seguridad y persistencia

Se reutilizan el generador criptográfico, Argon2, el transporte SMTP, Oracle y el
guard de origen existentes. No se agregan dependencias ni se modifica CI/CD o
SonarQube. Cada endpoint admite cinco solicitudes por minuto/IP/proceso. En Oracle
se limita el envío a una solicitud por minuto/cuenta y se bloquea la recuperación
después de cinco contraseñas temporales incorrectas.

El token aleatorio tiene 256 bits y se guarda como SHA-256. La contraseña temporal
tiene 192 bits de aleatoriedad y se guarda como Argon2. No se devuelven secretos
en respuestas API ni se registran en logs. El token viaja en el fragmento del
enlace y posteriormente en el cuerpo de las solicitudes, evitando incluirlo en
URLs HTTP y encabezados Referer. La pantalla elimina el fragmento al completar
el cambio y limpia los campos de contraseña.

`PASSWORD_RECOVERIES` conserva una fila por cuenta. Una nueva solicitud reemplaza
el secreto anterior, pero conserva la fecha de la última recuperación completada.
El proceso está vinculado al correo y al hash de credenciales que existían al
solicitarlo. Si cambian, la recuperación anterior deja de ser válida.

La actualización de credenciales y el consumo del enlace se realizan en la misma
transacción. Se bloquean primero la cuenta y sus credenciales y después la fila
de recuperación, manteniendo el mismo orden al solicitar y completar el proceso.
Se vuelve a comprobar la cuenta, la vigencia y el límite de intentos antes de
guardar, de modo que dos solicitudes concurrentes no puedan consumir el enlace.

Después del cambio se rechazan los JWT emitidos antes de `RESET_AT`, incluyendo
las sesiones anteriores de esa cuenta. Como JWT expresa `iat` en segundos, se
rechazan conservadoramente los tokens emitidos en el mismo segundo del cambio;
una sesión nueva emitida en el segundo siguiente es válida. La recuperación no
inicia sesión automáticamente. El usuario vuelve al login correspondiente.

Si falla el envío de instrucciones, se invalida ese token y se registra un aviso
sin datos personales. La respuesta pública sigue siendo genérica para no revelar
cuentas. Si falla la notificación posterior al cambio, no se revierte la contraseña
ni se muestra falsamente que la operación falló. El correo de notificación nunca
incluye la nueva contraseña.

## Configuración y despliegue

Se mantienen `FRONTEND_URL`, la configuración Oracle y las variables `SMTP_*`
existentes. `FRONTEND_URL` debe usar el origen autorizado del portal y HTTPS en
producción. No se requieren nuevas variables de entorno.

La tabla fue aplicada al entorno Oracle configurado el 7 de octubre de 2026.
Debe crearse antes de desplegar esta versión en otros entornos: la comprobación
de sesiones también consulta esta tabla. No hay creación automática al arrancar.
No se incorporó ningún archivo `.sql` al repositorio.

DDL de referencia para otros entornos, ejecutado por el responsable del esquema:

```sql
CREATE TABLE PASSWORD_RECOVERIES (
  RECOVERY_ID NUMBER GENERATED ALWAYS AS IDENTITY,
  CLIENT_ID NUMBER,
  EMPLOYEE_ID NUMBER,
  TOKEN_HASH VARCHAR2(64 CHAR),
  TEMPORARY_HASH VARCHAR2(512 CHAR),
  CREDENTIAL_HASH VARCHAR2(512 CHAR),
  EMAIL VARCHAR2(150 CHAR),
  REQUESTED_AT TIMESTAMP(6) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  EXPIRES_AT TIMESTAMP(6) WITH TIME ZONE,
  ATTEMPTS NUMBER DEFAULT 0 NOT NULL,
  RESET_AT TIMESTAMP(6) WITH TIME ZONE,
  CONSTRAINT PK_PASSWORD_RECOVERIES PRIMARY KEY (RECOVERY_ID),
  CONSTRAINT FK_RECOVERY_CLIENT FOREIGN KEY (CLIENT_ID) REFERENCES CLIENTS(CLIENT_ID),
  CONSTRAINT FK_RECOVERY_EMPLOYEE FOREIGN KEY (EMPLOYEE_ID) REFERENCES EMPLOYEES(EMPLOYEE_ID),
  CONSTRAINT UQ_RECOVERY_CLIENT UNIQUE (CLIENT_ID),
  CONSTRAINT UQ_RECOVERY_EMPLOYEE UNIQUE (EMPLOYEE_ID),
  CONSTRAINT UQ_RECOVERY_TOKEN UNIQUE (TOKEN_HASH),
  CONSTRAINT CK_RECOVERY_ACCOUNT CHECK (
    (CLIENT_ID IS NOT NULL AND EMPLOYEE_ID IS NULL)
    OR (EMPLOYEE_ID IS NOT NULL AND CLIENT_ID IS NULL)
  ),
  CONSTRAINT CK_RECOVERY_ATTEMPTS CHECK (ATTEMPTS BETWEEN 0 AND 5)
);
```

## Prueba manual

1. Desde el login de clientes, abrir «Olvidé mi contraseña», introducir un correo
   local activo y comprobar el mensaje genérico y la llegada del correo.
2. Abrir el enlace sin una sesión iniciada. Comprobar la contraseña temporal,
   advertencia de vencimiento, reglas de contraseña y confirmación.
3. Probar una temporal incorrecta, contraseñas distintas y una contraseña débil.
   La contraseña actual debe seguir funcionando mientras no termine el cambio.
4. Completar el cambio. Comprobar el mensaje de éxito y el correo de notificación.
   Iniciar sesión con la contraseña nueva; la anterior debe ser rechazada.
5. Reutilizar el enlace y probar una sesión anterior: ambos deben rechazarse.
6. Repetir para un empleado y un administrador desde el acceso del personal.
7. Comprobar un enlace vencido y solicitar otro desde el modal. Verificar que un
   reenvío antes de un minuto no genere otro correo ni invalide el enlace actual.
8. Verificar el formulario con teclado y en una pantalla móvil.

## Pruebas automatizadas y resultados

Las pruebas HTTP recorren solicitud, correo simulado, validación, cambio, rechazo
del secreto usado, revocación de sesión y nuevo login. Se usa Argon2 real y se
simulan persistencia y SMTP. Las pruebas del repositorio comprueban consultas
parametrizadas, transacciones, cambios concurrentes, caducidad e intentos.
Las pruebas de Vue comprueban validación, bloqueo de envíos duplicados, mensajes,
espera tras un 429 y retorno al login. Cada caso contiene aserciones explícitas.

La validación contra Oracle comprobó la tabla y analizó las 17 sentencias del flujo
mediante `DBMS_SQL.PARSE`, sin ejecutarlas contra cuentas reales. No se enviaron
correos reales durante las pruebas automatizadas.

Comandos desde `apps/api`:

```sh
npm run build
npm run lint
npm run test:cov -- --runInBand
```

Comandos desde `apps/web`:

```sh
npm run build
npm run lint
npm run test:cov -- --maxWorkers=2
```

La medición de código nuevo cruza los rangos añadidos de `git diff --unified=0`
y los archivos nuevos con los registros de líneas y ramas de ambos `lcov.info`.
Es una comprobación local; SonarQube calculará su resultado respecto de la base
del PR cuando se ejecute el análisis remoto.

Resultados locales del 7 de octubre de 2026:

| Área | Pruebas                   | Líneas globales | Ramas globales | Líneas nuevas/modificadas | Ramas nuevas/modificadas |
| ---- | ------------------------- | --------------- | -------------- | ------------------------- | ------------------------ |
| API  | 1571 aprobadas, 67 suites | 97,68%          | 89,81%         | 99,45%                    | 89,92%                   |
| Web  | 640 aprobadas, 32 suites  | 96,64%          | 91,55%         | 97,41%                    | 96,57%                   |

En conjunto, el código nuevo/modificado alcanza 294/298 líneas cubiertas
(98,66%) y 285/304 ramas cubiertas (93,75%). Los archivos de implementación
completamente nuevos tienen 100% de cobertura de líneas. Los porcentajes globales
y los del incremento superan el mínimo del 80%.

La verificación acordada para esta historia utiliza pruebas con mocks, sin exigir
E2E contra servicios reales. El archivo existente `users-validation.e2e-spec.ts`
solo recibió ajustes de sus mocks para conservar la integración; sus 19 casos pasan.

Como observación de una ejecución anterior a esa aclaración:
La prueba E2E general `app.e2e-spec.ts` falla porque conserva la expectativa inicial
`GET /` → `200 Hello World!`, pero el `AppModule` actual no registra esa ruta y
responde 404. Se confirmó con acceso a Oracle; el fallo no procede del flujo de
recuperación. Esa prueba y la configuración de CI/SonarQube no se modificaron.
