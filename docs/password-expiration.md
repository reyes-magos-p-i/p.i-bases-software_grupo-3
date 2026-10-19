# Expiración de contraseña (SCRUM-287)

Aplica a clientes y empleados con contraseña local. No requiere cambios de base
de datos: usa `PASSWORD_SET_AT` y `EXPIRATION_DAYS` de
`CLIENT_LOCAL_CREDENTIALS` y `EMPLOYEE_LOCAL_CREDENTIALS`.

## Reglas

- Periodos permitidos: 30, 60, 90 y 120 días. Toda cuenta nueva, de cliente o
  de empleado, empieza con 120 días (`DEFAULT_PASSWORD_EXPIRATION_DAYS`).
- La contraseña vence en el instante exacto en que se cumple el periodo,
  calculado en horas desde `PASSWORD_SET_AT` con la hora del servidor. Con 30
  días, una contraseña creada el 01/10/2026 08:00 vence el 31/10/2026 08:00; a
  las 07:59 aún es válida.
- Una contraseña de empleado sin fecha conocida se trata como vencida.
- Con la contraseña vencida, las rutas protegidas responden `403`
  `PASSWORD_EXPIRED` y la interfaz redirige a la pantalla de cambio con
  «Tu contraseña venció. Define una nueva para continuar.».
- Al cambiarla, se guarda la fecha nueva y el periodo elegido, y se muestra
  «Contraseña actualizada con éxito».

## Aviso de vencimiento próximo

`GET /api/auth/password-status` devuelve `status`, `expirationDays` y
`expiresInDays`.
[employee-auth.openapi.yaml](employee-auth.openapi.yaml) documenta el contrato.

- `expiresInDays` solo tiene valor si la contraseña es válida y faltan 72 horas
  o menos. Se calcula como horas restantes ÷ 24, redondeado hacia arriba: con
  72 h exactas es 3 y con 1 minuto es 1. Con 72 h y 1 minuto es `null`.
- La interfaz muestra una notificación en la esquina inferior derecha al
  ingresar al sistema: el cliente al iniciar sesión o restaurar su sesión, y el
  empleado al abrir el dashboard. Dura 10 segundos y se pausa al pasar el
  cursor encima. El texto es «Tu contraseña vence en {N} días. Cámbiala en
  Perfil > Cambiar contraseña.», en singular con 1 día.
- El cálculo ocurre en la API, así que las pruebas que ajustan el reloj del
  servidor (UT-080 a UT-084) no dependen del reloj del navegador.

## Formulario de cambio

El selector «Vigencia de la contraseña» ofrece solo 30, 60, 90 y 120 días. Se
preselecciona el periodo actual de la cuenta. Sin contraseña local, y en la
recuperación (que no conoce el periodo), se preselecciona 120.
