<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Límite de solicitudes del login del personal

`POST /auth/employees/login` utiliza `@nestjs/throttler` con un máximo de
**5 solicitudes en 60 segundos por IP de origen**, configurado en `AuthModule`.
Cuenta tanto los logins correctos como los intentos fallidos y las solicitudes
que rechaza la validación del DTO. En IPv6 se conserva la agrupación por subred
`/64` de la biblioteca para impedir el cambio de dirección dentro de la misma
subred como forma de eludir el límite.

La sexta solicitud devuelve `429` con un mensaje en español y la cabecera
`Retry-After`, expresada en segundos. Inicia una espera de 60 segundos; los
reintentos bloqueados no prolongan esa espera. El guard rechaza esas solicitudes
antes de consultar Oracle o verificar el hash de la contraseña. Cambiar el correo
no reinicia el contador. Personas que comparten una IP pública comparten el cupo.

El guard se aplica únicamente al login del personal. No cambia los límites del
registro ni de `/auth/me`. No bloquea cuentas ni modifica registros de Oracle.
Las pruebas HTTP usan el módulo, el guard y el almacenamiento reales del
limitador, con una aplicación nueva por prueba para aislar los contadores.

### Condiciones para activar el login

`AuthModule` todavía no está importado por `AppModule`: estas rutas permanecen
sin activar en la aplicación principal. El contrato está en
[employee-auth.openapi.yaml](../../docs/employee-auth.openapi.yaml).

El almacenamiento del limitador es **local a cada proceso**. Sus contadores se
pierden al reiniciar y no se comparten entre procesos o réplicas. Esta protección
no sustituye límites globales de carga ni limita hashes simultáneos entre IP
distintas. Antes de activar el login en producción:

- Confirmar cuántos procesos o réplicas atienden peticiones. Si hay varios,
  preparar almacenamiento compartido o una protección equivalente en el punto
  de entrada; no considerar este contador como un límite global.
- Verificar los proxies y la ruta de acceso al backend. El guard usa `req.ip` de
  Express; actualmente no se configura `trust proxy`. Detrás de un proxy, las
  peticiones pueden compartir la IP del proxy y consumir el mismo cupo.
- Configurar la confianza exclusivamente para los proxies comprobados, con
  cabeceras de origen controladas por ellos. No aceptar `X-Forwarded-For` o
  `X-Real-IP` arbitrarios ni activar `trust proxy: true` sin verificar la topología.
- Verificar por HTTP el límite y la IP efectiva en el despliegue. La configuración
  del servidor y el número de procesos no se han confirmado desde el repositorio.

El limitador no modifica el proxy, systemd ni la base de datos.
Referencia: [limitación de solicitudes en NestJS](https://docs.nestjs.com/security/rate-limiting).

## Sesión del personal

`AuthModule` prepara una sesión mediante JWT en la cookie
`cinetadel_employee_session`. Todavía no está importado por `AppModule`; este
incremento no publica rutas ni activa incidentalmente `/auth/register`.

Tras un login válido, el cuerpo HTTP contiene únicamente `{ user: ... }`.
El JWT se entrega en `Set-Cookie`, con `HttpOnly`, `SameSite=Strict`, `Path=/api`
y sin `Domain`. La cookie es persistente, con un plazo máximo de **24 horas**
desde la emisión del JWT, alineado con su `exp`. Recuperar la identidad mediante
`GET /api/auth/me` no renueva la cookie ni extiende el plazo. Ambas respuestas
exitosas incluyen `Cache-Control: no-store`.

La cookie solo autentica tokens del personal (`type=employee`). Los tokens Bearer
existentes siguen funcionando sin esta cookie. Enviar cookie y `Authorization`
simultáneamente devuelve `401`, incluso si contienen el mismo token; tampoco se
recurre a Bearer cuando la cookie es inválida. El frontend del personal deberá
usar la cookie, sin guardar el JWT en `localStorage` o `sessionStorage` ni añadir
una cabecera `Authorization`. Su integración se realizará en otro incremento.

La lectura de cookies usa `cookie-parser` en las rutas de `AuthController`.
La protección de origen se aplica al login del personal: `Origin` debe coincidir
exactamente con el origen de `FRONTEND_URL`. No se admiten orígenes ausentes,
`null`, inválidos o diferentes; se responde `403` antes de consultar Oracle o
verificar contraseñas. El guard de limitación se ejecuta primero, por lo que esas
solicitudes también consumen el cupo y pueden recibir `429`. No se confía en
`Host`, `Referer` ni cabeceras reenviadas para autorizar el origen.

Cuando se habiliten otras operaciones que modifiquen datos mediante esta cookie,
también deberán incorporar protección contra CSRF. Este cambio no sustituye la
autorización administrativa de `/users` ni configura CORS o `trust proxy`.

### Configuración prevista para integrar la sesión

`EmployeeSessionService` valida `FRONTEND_URL` al inicializar el módulo. Debe ser
un origen absoluto sin credenciales, rutas, consulta ni fragmento. Se permite
una barra final y se normaliza al origen. HTTPS establece siempre `Secure`.
HTTP solo se acepta cuando `NODE_ENV` es `development` o `test` y el host es
`localhost`, `127.0.0.1` o `[::1]`. Una configuración inválida impide iniciar
`AuthModule`; no rebaja automáticamente la seguridad.

- Desarrollo local: `NODE_ENV=development`, `FRONTEND_URL=http://localhost:5173`
  y `VITE_API_BASE_URL=/api`. El origen debe coincidir con el que se abre en el
  navegador; otro puerto o cambiar `localhost` por `127.0.0.1` requiere ajustarlo.
- Despliegue previsto: `NODE_ENV=production`,
  `FRONTEND_URL=https://159.54.166.238` y `VITE_API_BASE_URL=/api`.
  Debe resolverse la confianza del certificado HTTPS antes de activar el flujo.
- Conservar `JWT_SECRET` en la configuración privada del backend. No se modifica
  ni se proporciona un secreto predeterminado en este incremento.

Nginx recibe `/api/` y lo reenvía a `http://127.0.0.1:3000/`, retirando el prefijo.
Vite realiza la misma traducción localmente. Las rutas internas de Nest siguen
siendo `/auth/...`; el navegador usa `/api/auth/...` porque la cookie tiene
`Path=/api`. No se ha añadido un prefijo global a la aplicación principal.
Las pruebas HTTP sí simulan ese prefijo externo para verificar el recorrido con
un navegador simulado que conserva y envía la cookie según su ruta.

### Verificación del correo de clientes

El registro con correo y contraseña crea la cuenta como pendiente y guarda un
hash SHA-256 de un token aleatorio de un solo uso. El enlace vence en
`EMAIL_VERIFICATION_TTL_MINUTES` (15 minutos por defecto; se permiten valores
enteros de 1 a 1440). Al confirmarlo, el token se consume en una transacción,
se activa la cuenta y se devuelve la sesión de cliente. Los tokens de clientes
no pueden autenticar mientras exista una verificación pendiente.

La tabla `CLIENT_EMAIL_VERIFICATIONS` es necesaria antes de probar el registro.
En una base existente, ejecuta una vez
[`database/migrations/20261003_client_email_verifications.sql`](../../database/migrations/20261003_client_email_verifications.sql)
en el esquema configurado para la API. Para una instalación nueva, la tabla
también está definida en `database/script.sql`. Las cuentas existentes y el
registro social no requieren filas en esta tabla. Google y Facebook mantienen
su flujo social independiente.

El correo usa la configuración SMTP existente (`SMTP_HOST`, `SMTP_PORT`,
`SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`) y `FRONTEND_URL` para
construir `/verify-email?token=...`. Si la entrega falla después de crear la
cuenta, el API devuelve `EMAIL_DELIVERY_FAILED`; el formulario conserva el
correo y permite llamar a `/auth/resend-email-verification`. El endpoint de
reenvío responde de forma genérica para no revelar si una dirección tiene una
cuenta pendiente.

Si se vuelve a enviar el formulario con un correo que ya tiene una cuenta
pendiente, se reenvía el enlace desde el mismo flujo en lugar de rechazarlo como
duplicado. La antigüedad de la cuenta no se reinicia al reenviar: después de
siete días desde el registro inicial, el API elimina la cuenta pendiente y sus
credenciales en una transacción. Una limpieza periódica corre cada hora; al
intentar registrarse o reenviar para ese correo, también se elimina de inmediato
si el plazo ya venció. Los siete días de retención son independientes de los
minutos de validez de cada enlace.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

To add it to this project:

```bash
$ npm install @nestjs/observe
```

Then follow the [setup guide](https://docs.nestjs.com/observability/overview) - it takes a single import and an app key.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
