# Inicio de sesión de clientes

El modal existente del portal permite iniciar sesión con correo y contraseña,
Google o Facebook. Al completar cualquiera de estos accesos se cierra el modal,
se muestra el menú de cuenta existente y se vuelve al portal `/`.

## Comportamiento

- El acceso local utiliza las credenciales de clientes existentes. Normaliza el
  correo, conserva exactamente la contraseña y valida ambos campos con las reglas
  compartidas del proyecto. No exige las reglas de complejidad del registro para
  comprobar una contraseña existente.
- Una cuenta inexistente, sin credenciales locales, inactiva o con contraseña
  incorrecta recibe el mismo error. La verificación del hash también se ejecuta
  cuando no se encuentra la cuenta.
- Con contraseña correcta y correo pendiente de confirmación, se solicita
  confirmar el correo y no se emite un token. Se reutiliza la verificación de
  correo existente. «Olvidé mi contraseña» abre la
  [recuperación por correo](password-recovery.md).
- Google y Facebook conservan sus integraciones y sus reglas de creación y
  vinculación de cuentas. El componente compartido bloquea clics simultáneos y
  comunica al modal cuándo hay una operación en curso.
- Durante una solicitud se bloquean envíos repetidos y el cambio o cierre del
  formulario. Los errores permiten corregir los datos y volver a intentarlo.

## Sesión y seguridad

El nuevo `POST /api/auth/clients/login` reutiliza `LoginDto`, `PasswordHasher`,
`ClientsService`, la emisión de JWT y los guards existentes. Aplica cinco
solicitudes por minuto/IP/proceso, con bloqueo de un minuto, y requiere que
`Origin` coincida con `FRONTEND_URL`. La respuesta lleva `Cache-Control: no-store`.
El formulario respeta `Retry-After` y no reenvía solicitudes automáticamente.

La sesión utiliza el servicio de clientes existente y la clave `accessToken` de
`localStorage`, como el registro social y la confirmación de correo. Al recargar,
se comprueba el token con `GET /api/auth/me`; el perfil almacenado en memoria solo
se restablece tras una respuesta válida. Esta consulta usa el adaptador Fetch de
Axios con `withCredentials: false` para enviar Bearer sin la cookie del personal.
No se añaden credenciales de clientes a las solicitudes administrativas.

Un `401` elimina el token y el perfil local. Un problema de conexión conserva el
token para permitir reintentar la comprobación. Una respuesta antigua no puede
reemplazar un login más reciente ni restaurar una sesión después de cerrarla.
La estrategia JWT existente rechaza cuentas inactivas y confirmaciones pendientes.

Los tokens mantienen la duración existente de 24 horas. Cerrar sesión retira las
credenciales de este navegador; no revoca tokens copiados u otros dispositivos.
La persistencia en `localStorage` conserva las limitaciones del mecanismo actual:
el token es accesible a JavaScript del mismo origen. No se migra a otro sistema
de almacenamiento en esta historia.

## Configuración y prueba manual

Se conservan las variables y el proxy descritos en [employee-login.md](employee-login.md):
`VITE_API_BASE_URL=/api`, `FRONTEND_URL` igual al origen exacto del navegador,
`JWT_SECRET` y la configuración Oracle privada existente. No hay migraciones de
base de datos ni cambios de dependencias, CI/CD o SonarQube.

Google y Facebook requieren la configuración previa de sus aplicaciones y los
orígenes autorizados correspondientes. Este incremento no altera esa configuración
ni las credenciales privadas.

1. Abrir el modal de clientes. Comprobar correo inválido, campos vacíos y mostrar
   u ocultar contraseña, usando teclado y una ventana estrecha.
2. Introducir credenciales de un cliente activo con correo confirmado. Comprobar
   el retorno a `/`, el nombre en la cabecera y el menú de cuenta.
3. Recargar y comprobar la restauración del perfil. Cerrar sesión y recargar:
   debe volver a mostrarse «Iniciar sesión».
4. Probar una contraseña incorrecta y corregirla dentro del mismo modal. Probar
   una cuenta pendiente de confirmación y comprobar el aviso correspondiente.
5. Realizar seis intentos en un minuto. La sexta solicitud recibe `429`; esperar
   el plazo mostrado antes de continuar. Los intentos correctos también cuentan.
6. Entrar mediante Google y Facebook con sus aplicaciones configuradas. Comprobar
   la redirección al portal, la creación o vinculación habitual y que dos clics
   no abran operaciones paralelas.
7. Detener temporalmente la API y recargar: comprobar el aviso de conexión y el
   botón de reintento. Restaurar la API y reintentar.
8. Comprobar que «¿Es un empleado?» sigue abriendo el acceso del personal y que
   este conserva su redirección a `/dashboard`.

## Pruebas automatizadas

Las pruebas nuevas siguen Jest/Vitest y contienen aserciones explícitas en cada
caso. Los hooks preceden a los casos. `src/auth/client-login.http.spec.ts` usa los
módulos fuente y participa en `test:cov`, como las demás pruebas HTTP aisladas.
La regresión anterior `users-validation.e2e-spec.ts` conserva la comprobación de
metadatos de los DTO en la aplicación compilada.

La suite HTTP comprueba login, normalización, rechazo de entradas inválidas,
credenciales incorrectas, cuenta inactiva, confirmación pendiente, expiración,
desactivación posterior, origen, límite de intentos y errores saneados. Usa el
hash real y simula Oracle y SMTP; no escribe cuentas ni envía correos.

Las pruebas de componentes y servicios comprueban validación, mensajes,
redirección, sesión restaurada, respuestas tardías y bloqueo de acciones
concurrentes. Las integraciones sociales se simulan: las pruebas automatizadas
no confirman la configuración ni el consentimiento de cuentas reales en los proveedores.

Comandos desde `apps/api`:

```sh
npm run build
npm run test:cov -- --runInBand
npm run test -- --runInBand src/auth/client-login.http.spec.ts
npm run lint
```

Desde `apps/web`:

```sh
npm run test:cov -- --maxWorkers=2
npm run lint
npm run build
```

Resultados locales del 5 de octubre de 2026:

| Comprobación                          | Resultado                           |
| ------------------------------------- | ----------------------------------- |
| API, suite completa                   | 59 suites y 1.420 pruebas aprobadas |
| API, cobertura de líneas / ramas      | 97,49 % / 89,86 %                   |
| Frontend, suite completa              | 25 suites y 537 pruebas aprobadas   |
| Frontend, cobertura de líneas / ramas | 98,13 % / 93,02 %                   |
| E2E del nuevo acceso de clientes      | 17 pruebas aprobadas                |
| ESLint                                | API y frontend aprobados            |
| Compilación                           | API y frontend aprobados            |

El análisis remoto de SonarQube y la prueba manual con cuentas reales de Google
y Facebook no se ejecutaron como parte de esta verificación local.

El contrato del nuevo endpoint está en [client-auth.openapi.yaml](client-auth.openapi.yaml).
