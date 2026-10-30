# Expiración de contraseña (SCRUM-287)

Aplica a clientes y empleados con contraseña local. Usa `PASSWORD_SET_AT` y
`EXPIRATION_DAYS` de `CLIENT_LOCAL_CREDENTIALS` y `EMPLOYEE_LOCAL_CREDENTIALS`.
La migración `database/migrations/20261025_password_expiration_30_days.sql`
fija el periodo de 30 días; se aplica junto con la versión del API que lo usa.

## Reglas

- **Empleados:** la vigencia es obligatoria y fija de 30 días
  (`EMPLOYEE_PASSWORD_EXPIRATION_DAYS`). No se puede elegir otra al crear la
  cuenta, al cambiar la contraseña ni al recuperarla. La base de datos lo
  refuerza con `CHECK (expiration_days = 30)`.
  - La migración pasa a 30 días las contraseñas del personal que tenían otro
    periodo sin tocar `PASSWORD_SET_AT`. Por eso, una contraseña definida hace
    más de 30 días vence en ese momento y se pide cambiarla.
- **Clientes:** toda cuenta nueva empieza con 30 días
  (`DEFAULT_PASSWORD_EXPIRATION_DAYS`). Al cambiar o recuperar la contraseña
  pueden elegir 30, 60, 90 o 120 días. Las cuentas existentes conservan el
  periodo que ya tenían.
- La contraseña vence en el instante exacto en que se cumple el periodo,
  calculado en horas desde `PASSWORD_SET_AT` con la hora del servidor. Con 30
  días, una contraseña creada el 01/10/2026 08:00 vence el 31/10/2026 08:00; a
  las 07:59 aún es válida.
- Una contraseña de empleado sin fecha conocida se trata como vencida.
- Al cambiarla, se guarda la fecha nueva y el periodo elegido, y se muestra
  «Contraseña actualizada con éxito».

## Bloqueo con contraseña vencida

Con la contraseña vencida (o sin configurar), todo queda restringido hasta
cambiarla (CA-05 y CA-08). La pantalla muestra «Tu contraseña venció. Define una
nueva para continuar.».

- **API:**
  - Toda ruta autenticada con JWT usa `PasswordStatusGuard` y responde `403`
    `PASSWORD_EXPIRED` o `PASSWORD_MUST_SET`.
  - Solo se exceptúan, con `@AllowExpiredPassword()`, las rutas necesarias para
    recuperarse: `/auth/me`, `/auth/password-status` y el cambio de contraseña.
  - `password-guard-coverage.spec.ts` recorre todos los controladores y falla si
    una ruta con JWT no cumple esta regla.
- **Dashboard (personal):**
  - Se puede pulsar cualquier sección de la barra lateral, pero solo se muestra
    «Cambiar contraseña».
  - El bloqueo se levanta al volver al tablero, cuando el servidor confirma la
    contraseña vigente.
- **Cliente:**
  - El guard de rutas restaura la sesión guardada antes de cualquier ruta, no
    solo las de cliente.
  - Así redirige a `/account/password` incluso en una carga directa de página,
    sin mostrarla antes.
- **En ambos casos:**
  - Si un endpoint responde `403 PASSWORD_EXPIRED` o `PASSWORD_MUST_SET` durante
    la sesión (por ejemplo, porque la contraseña venció con la página abierta),
    un interceptor de axios (`onPasswordBlocked` en `services/api.ts`) lleva a
    la pantalla de cambio.

## Aviso de vencimiento próximo

`GET /api/auth/password-status` devuelve `status`, `expirationDays` y
`expiresInDays`.
[employee-auth.openapi.yaml](employee-auth.openapi.yaml) documenta el contrato.

- `expiresInDays` solo tiene valor si la contraseña es válida y faltan 72 horas
  o menos. Se calcula como horas restantes ÷ 24, redondeado hacia arriba: con
  72 h exactas es 3 y con 1 minuto es 1. Con 72 h y 1 minuto es `null`.
- La interfaz muestra una notificación en la esquina inferior derecha **solo
  justo después de iniciar sesión**:
  - el cliente, con correo, Google o Facebook;
  - el empleado, al llegar al dashboard desde el login.

  Al refrescar la página o restaurar la sesión no aparece. El login marca una
  bandera en memoria que consume la primera consulta de estado; un refresh la
  borra. Cerrar sesión oculta el aviso.

- La notificación dura 10 segundos y se pausa al pasar el cursor encima. El
  texto es «Tu contraseña vence en {N} días. Cámbiala en Perfil > Cambiar
  contraseña.», en singular con 1 día.
- El cálculo ocurre en la API, así que las pruebas que ajustan el reloj del
  servidor (UT-080 a UT-084) no dependen del reloj del navegador.

## Formulario de cambio

- **Clientes:** el selector «Vigencia de la contraseña» ofrece solo 30, 60, 90
  y 120 días. Se preselecciona el periodo actual de la cuenta. Sin contraseña
  local, y en la recuperación (que no conoce el periodo), se preselecciona 30.
- **Empleados:** no hay selector. El formulario muestra «30 días. La vigencia
  de las contraseñas del personal es fija.» y la petición no envía
  `expirationDays`; si se envía, `PATCH /auth/employees/password` responde
  `400`. En la recuperación del personal el valor se ignora.
