# Inicio de sesión del personal

El portal integra el inicio de sesión de empleados y administradores. El formulario
de clientes permite llegar al del personal. El acceso local y social de clientes
se documenta en [client-login.md](client-login.md); el vínculo «Olvidé mi contraseña»
abre la [recuperación por correo](password-recovery.md).

## Preparación local

Usar Node 24.x desde 24.15.0 y las dependencias del proyecto. El backend conserva
Oracle Thin, las credenciales existentes y la configuración SMTP ya utilizada para
crear usuarios. Este incremento no cambia tablas ni crea cuentas automáticamente.

En el archivo privado `apps/api/.env`, conservar Oracle y SMTP y configurar:

```dotenv
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://127.0.0.1:5178
```

También se requiere `JWT_SECRET`: una clave aleatoria privada de al menos 32 bytes.
Para generar un valor en tu propia terminal:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Guardar ese valor solamente en el entorno privado del backend; no compartirlo,
incluirlo en capturas ni subirlo a Git. Cambiarlo invalida los tokens firmados con
la clave anterior. `apps/.env.example` es una referencia y no se carga automáticamente.
Las variables `DEV_ADMIN_ENABLED` y `DEV_ADMIN_EMPLOYEE_ID` ya no tienen efecto.

En `apps/web/.env.local` o el entorno de Vite:

```dotenv
VITE_API_BASE_URL=/api
```

La URL del navegador debe coincidir exactamente con `FRONTEND_URL`, incluido el
puerto. `localhost` y `127.0.0.1` son orígenes distintos. El navegador envía la cookie
automáticamente a su mismo origen; Axios no lee ni almacena el JWT. No configurar
la URL de la API como `http://127.0.0.1:3000`: el flujo utiliza el proxy `/api`.

Arrancar Nest desde `apps/api`:

```sh
npm run start:dev
```

Arrancar Vue desde `apps/web`:

```sh
npm run dev -- --host 127.0.0.1 --port 5178 --strictPort
```

Si los procesos ya estaban activos, reiniciarlos tras cambiar variables de entorno.
Abrir `http://127.0.0.1:5178/`. El proxy de Vite conserva `/api` al reenviar a Nest,
que utiliza ese prefijo global.

## Prueba manual

1. Sin sesión, abrir `/dashboard`: debe volver al portal y abrir el formulario del
   personal. `/dev/dashboard` redirige a la misma ruta protegida.
2. Cerrar el diálogo y recorrer «Iniciar sesión» → «¿Es un empleado? Haga clic aquí».
   El cambio debe funcionar al primer clic, incluso con el correo vacío o inválido.
   Probar los campos obligatorios y mostrar/ocultar contraseña.
3. Introducir las credenciales locales de un administrador existente. La solicitud
   pendiente bloquea envíos duplicados, cambio de formulario y cierre del diálogo.
   Al confirmar el acceso, debe abrir `/dashboard` con el primer nombre del empleado
   en la cabecera y las opciones correspondientes a su rol real.
4. Recargar `/dashboard`: conserva la sesión mediante `GET /api/auth/me`. La cabecera
   conserva el primer nombre devuelto por este endpoint. No hay selector de rol
   simulado. La recarga no renueva la expiración de la sesión.
5. Abrir el formulario de creación y comprobar los catálogos. Crear una cuenta
   requiere los datos reales de Oracle y envía correo; seguir las pruebas de
   [creación administrativa](development-admin.md). No repetir un envío cuyo
   resultado sea incierto sin comprobar antes la base de datos.
6. Cerrar sesión. Debe volver al portal y una nueva visita a `/dashboard` debe pedir
   autenticación. Si el cierre falla por conexión, se muestra el error y puede
   reintentarse; no se confirma un cierre que no se pudo verificar.
7. Ingresar con una cuenta de empleado existente: no muestra Empleados ni Tablero,
   y tampoco ofrece creación de clientes o empleados. Un POST directo a `/api/users`
   con esa sesión y Origin correcto debe recibir `403`. Sin sesión recibe `401`.
8. Probar una contraseña incorrecta: el error no revela si el correo existe. Corregir
   la contraseña y volver a enviar en el mismo diálogo, sin recargar la página. Hacer
   seis solicitudes en un minuto desde la misma IP: la sexta devuelve `429`; el
   formulario espera el plazo de `Retry-After`, sin reenviar automáticamente. Los
   accesos correctos también cuentan. Esperar a que termine el bloqueo antes de
   continuar otras pruebas.
9. Para simular pérdida de sesión, eliminar únicamente la cookie del personal con
   las herramientas del navegador. Recargar o abrir catálogos debe pedir login.
   Esto comprueba ausencia de cookie; las pruebas HTTP verifican por separado
   expiración real del JWT, firma inválida y eliminación/cambio de rol en Oracle.
10. Detener temporalmente el backend: el portal permite reintentar la recuperación
    y el login informa del problema de conexión; no lo presenta como contraseña
    incorrecta. Repetir el recorrido con una ventana estrecha y teclado.

## Contrato y límites

- `POST /api/auth/employees/login`: perfil seguro y cookie; nunca un token en JSON.
- `GET /api/auth/me`: ID, rol y primer nombre vigentes del personal; `401` si no hay sesión válida.
- `POST /api/auth/employees/logout`: `204`, elimina la cookie incluso si ya expiró.
- Cookie `cinetadel_employee_session`: HttpOnly, SameSite=Strict, Path=/api, duración
  original de 24 horas y Secure en HTTPS. HTTP se admite solo en desarrollo/pruebas
  locales. No hay renovación automática, refresh tokens ni almacenamiento del token
  en JavaScript. La identidad reactiva se mantiene solo en memoria.
- Logout elimina la cookie de ese navegador. No revoca JWT copiados ni sesiones de
  otros dispositivos; los tokens conservan su fecha original de expiración.
- Login, logout y creación de usuarios requieren Origin igual al configurado.
  Las consultas GET no dependen de Origin. No se envía Authorization desde Vue;
  el backend conserva Bearer cuando no se utiliza la cookie. Enviar ambas
  credenciales se rechaza, incluso si contienen el mismo token.
- El límite de login sigue siendo cinco solicitudes por minuto/IP/proceso; no es
  un contador distribuido. Nest confía solo en proxies loopback. La configuración
  Nginx compartida reenvía desde 127.0.0.1 y añade la IP visitante a X-Forwarded-For.
  Confirmar la topología y cantidad de procesos antes de desplegar múltiples instancias.
- Activar AuthModule hace accesible también el registro público existente. No se
  cambian sus reglas. El inicio de sesión de clientes se documenta por separado.

## Producción

La configuración de Nginx debe conservar `/api/` hacia Nest en 127.0.0.1:3000.
La configuración compartida anteriormente retiraba el prefijo y requiere este ajuste
antes de desplegar la versión integrada con `dev`:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

La ausencia de `/` final en `proxy_pass` conserva la ruta completa. Mantener los
demás ajustes existentes de HTTPS y comprobar la configuración con `sudo nginx -t`
antes de recargar Nginx. Configurar `NODE_ENV=production`, el origen HTTPS exacto como
`FRONTEND_URL` y una `JWT_SECRET` privada estable. El frontend sigue usando `/api`.
El navegador debe aceptar el certificado TLS. Nginx debe servir la SPA también al
recargar `/dashboard`. Este incremento no modifica el servidor ni verifica una
instalación desplegada a partir de las pruebas locales.

## Verificación automatizada

Los comandos existentes `npm run test:cov`, `npm run lint` y `npm run build` se
ejecutan en cada aplicación. Las pruebas HTTP verifican los módulos reales con
Oracle y SMTP simulados: cookies, rol vigente, origen, permisos, rate limiting,
logout y creación posterior al login. No escriben en Oracle ni envían mensajes.

Los specs del frontend prueban Axios, recuperación concurrente, descarte de
respuestas antiguas, rutas protegidas, mensajes, espera de reintento y continuidad
del flujo de creación. La comprobación en navegador complementa esas pruebas.

## Correcciones de continuidad de sesión

La creación de empleados guarda explícitamente `PASSWORD_SET_AT = SYSTIMESTAMP`
y `EXPIRATION_DAYS = 30` (vigencia fija del personal) junto con el hash, dentro de la transacción existente.
Una contraseña con fecha desconocida en una cuenta anterior se considera vencida:
la sesión puede comprobarse y el dashboard solicita cambiarla usando la contraseña
actual. No se inventan fechas históricas ni se modifican registros automáticamente.

`?login=employee&reason=unavailable` significa que falló la comprobación de sesión;
no equivale a credenciales incorrectas. Para diagnosticarlo, revisar primero
`POST /api/auth/employees/login` y después `GET /api/auth/me`. El código anterior
permitía crear credenciales sin fecha y rechazaba ese valor durante `/auth/me`,
por lo que podía producir login 200 seguido de 500. La URL por sí sola no confirma
que esa haya sido la causa de un incidente concreto.

Los mensajes habituales de validación, credenciales incorrectas, sesión vencida y
límite de intentos no muestran códigos técnicos. Los fallos excepcionales muestran
el HTTP real, como `Error 404` o `Error 503`, y una explicación segura. Conexión,
timeout y respuesta inválida utilizan `AUTH_NETWORK`, `AUTH_TIMEOUT` y
`AUTH_RESPONSE_INVALID`; no se presentan como una respuesta HTTP inexistente.

Un token de cliente almacenado se verifica antes de bloquear el acceso del
personal. Si venció o fue revocado, se elimina; si la verificación falla por
conexión, se conserva para permitir reintentar.

### Verificación local del 15 de octubre de 2026

| Área | Pruebas aprobadas   | Líneas globales | Líneas nuevas/modificadas | Ramas nuevas/modificadas |
| ---- | ------------------- | --------------- | ------------------------- | ------------------------ |
| API  | 1.704, en 76 suites | 97,57 %         | 95,45 % (21/22)           | 100 % (38/38)            |
| Web  | 837, en 48 suites   | 95,21 %         | 94,21 % (114/121)         | 88,34 % (144/163)        |

La medición del incremento cruza LCOV con las líneas añadidas/modificadas respecto
del HEAD anterior a estos cambios e incluye el nuevo módulo de mensajes. SonarQube
calculará sus métricas respecto de la base del PR; no se ejecutó el análisis remoto.
Compilación, ESLint y Prettier pasan en los archivos afectados.

Las regresiones verifican creación de empleado y uso de la contraseña del correo
simulado, vigencia desconocida, recuperación seguida de login y consulta de estado,
tokens rechazados, separación de cookie/Bearer, errores con y sin código y respuestas
tardías del proveedor. Oracle, SMTP y proveedores se simulan: esta ejecución no
confirma el incidente histórico ni la configuración de producción.
