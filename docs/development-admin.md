# Administrador de desarrollo

El guard `DevelopmentAdminGuard` permite probar la creación administrativa de usuarios
con un administrador real de Oracle, sin implementar inicio de sesión. Está aplicado
al controlador de usuarios y asocia `{ id, role }` a `request.user` únicamente después
de comprobar al administrador configurado.

## Estado de integración

`UsersModule` está registrado en `AppModule` y expone `POST /users` y
`GET /users/creation-options`. Conecta el
controlador, la validación, el guard, el repositorio Oracle, el generador aleatorio,
el hasher Argon2id y el envío de credenciales por SMTP. El servidor necesita la
configuración de Oracle y SMTP para arrancar.

La vista de desarrollo carga los catálogos mediante Axios al abrir el formulario.
Sigue pendiente conectar el envío del formulario y gestionar sus resultados.
Las pruebas manuales del flujo se realizarán
cuando esa integración esté lista. No se modifica automáticamente la base de datos
ni el archivo `.env` al incorporar este módulo.

## Configuración prevista

El entorno local del backend necesita estas variables:

```dotenv
NODE_ENV=development
DEV_ADMIN_ENABLED=true
DEV_ADMIN_EMPLOYEE_ID=21
```

El ID `21` corresponde al administrador inicial del entorno de desarrollo actual;
no está fijado en el código. Debe apuntar a un empleado existente de la base conectada
mediante la configuración Oracle habitual. El ID debe ser una cadena de dígitos,
sin espacios ni ceros iniciales, que represente un entero positivo seguro de JavaScript.
No se requiere su contraseña ni se consultan correo, hash o salt.

Las dos primeras variables deben coincidir exactamente con los valores del ejemplo.
En cada solicitud el repositorio consulta únicamente `EMPLOYEE_ID` y `ROLE`, usando
un parámetro SQL para el ID y liberando la conexión al terminar. Solo se permite
continuar si el registro existe y su rol actual es `ADMINISTRATOR`. No se almacena
esa comprobación en caché.

## Comportamiento y límites

- La configuración deshabilitada o inválida, un empleado inexistente o un rol distinto
  de administrador producen `403 Forbidden`, antes de validar el formulario o crear registros.
- Los fallos operativos de Oracle impiden la operación y reciben una respuesta `500`
  sin detalles internos.
- El rol del formulario describe la cuenta por crear. Los encabezados, el cuerpo y
  las identidades enviadas por el navegador no eligen al administrador que actúa.
- Este modo asigna el mismo administrador a cualquier solicitud que alcance el controlador
  en el servidor de desarrollo habilitado. No verifica la identidad de la persona:
  debe utilizarse en un entorno local controlado, sin exponerlo públicamente.
- No hay inicio de sesión, JWT ni sesiones. La autenticación y autorización de producción
  corresponden a otra historia; este guard siempre deniega fuera de `development`.

Para deshabilitarlo, establecer `DEV_ADMIN_ENABLED=false` o eliminar esa variable
y reiniciar el backend. Las solicitudes seguirán
recibiendo `403` mientras no exista otro mecanismo de autorización aprobado.

## Catálogos del formulario

`GET /users/creation-options` devuelve los datos existentes en Oracle, con el mismo
guard de administrador de desarrollo que protege la creación. No requiere cuerpo
ni parámetros y responde con estas cuatro listas:

| Lista       | Tabla       | Campos de cada opción       |
| ----------- | ----------- | --------------------------- |
| `provinces` | `PROVINCES` | `id`, `label`               |
| `cantons`   | `CANTONS`   | `id`, `label`, `provinceId` |
| `districts` | `DISTRICTS` | `id`, `label`, `cantonId`   |
| `branches`  | `CINEMAS`   | `id`, `label`               |

Se consultan todos los registros y cada lista se ordena por nombre e identificador
en Oracle. No se renombran sucursales ni se crean datos. Una tabla vacía devuelve
una lista vacía. Las consultas de los cuatro catálogos utilizan una conexión que
se libera al terminar; si alguna consulta falla, la respuesta es `500` genérico y
no se envían catálogos parciales. Un rechazo del guard devuelve `403`.

Vue filtra cantones por `provinceId` y distritos por `cantonId` utilizando
los selectores existentes. La dirección exacta sigue siendo texto introducido por
el usuario; al crear la cuenta se envían `address.districtId` y `address.details`.
La sucursal se elige de forma independiente, sin atribuirle relaciones geográficas
que no están definidas en este contrato.

Este endpoint solo consulta datos: no genera contraseñas ni envía correos. La
configuración SMTP sigue siendo necesaria para iniciar el backend.

## Conexión local con Vue

El ejemplo `apps/web/.env.example` utiliza `VITE_API_BASE_URL=/api`. Para la futura
prueba integrada, configurar ese valor en el entorno local de Vite y reiniciar
el servidor de desarrollo si se modifica. No se editan automáticamente archivos
`.env` privados. El backend se espera en `http://127.0.0.1:3000`.

Vite reenvía `/api/users/creation-options` a `/users/creation-options` de Nest,
retirando el prefijo `/api`. Así el navegador consulta su mismo origen durante
el desarrollo local. Si se cambia el puerto del backend, también debe ajustarse
el destino en `vite.config.ts`. El proxy no se incluye en los archivos de producción:
el despliegue debe configurar su propia URL y enrutamiento hacia la API.

En `/dev/dashboard`, «Añadir empleado» abre el diálogo y consulta los catálogos.
Mientras espera, muestra un aviso de carga y permite escribir los datos personales.
Si ocurre un error, muestra un mensaje en español y permite reintentar sin borrar
lo escrito. Los errores de permisos y de tiempo de espera tienen mensajes específicos.
Una respuesta exitosa con listas vacías muestra las opciones no disponibles, sin
presentarla como un fallo de conexión.

Las solicitudes GET tienen un tiempo de espera de diez segundos. Los catálogos se
reutilizan al cerrar y abrir el diálogo dentro de la misma sección; al cambiar de
sección o rol visual se descartan y se cancelan las cargas pendientes. Al salir de
la vista también se cancela la solicitud. Las respuestas tardías de solicitudes
canceladas no cambian el formulario actual. No hay reintentos automáticos.

El rol de la vista sigue siendo una simulación visual: no se envía como autorización.
El backend comprueba el administrador configurado en su propio entorno. El botón
«Crear usuario» continúa deshabilitado hasta el próximo incremento.

## Configuración de correo

El emisor implementa `InitialCredentialsSender` mediante Nodemailer. Para cambiar
de proveedor SMTP no es necesario modificar `UsersService`. Las variables obligatorias
se leen desde `ConfigService`; los valores privados deben permanecer fuera de Git.

| Variable        | Valor esperado                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| `SMTP_HOST`     | Nombre del servidor, por ejemplo `smtp.example.com`; sin protocolo, puerto ni espacios.                            |
| `SMTP_PORT`     | Puerto entero entre 1 y 65535, escrito sin espacios ni ceros iniciales.                                            |
| `SMTP_SECURE`   | `true` para TLS desde el inicio (habitualmente puerto 465); `false` para STARTTLS obligatorio (habitualmente 587). |
| `SMTP_USER`     | Usuario de autenticación SMTP del proveedor.                                                                       |
| `SMTP_PASSWORD` | Credencial SMTP del proveedor; no es la contraseña del administrador de Cinetadel.                                 |
| `SMTP_FROM`     | Una dirección de correo válida y autorizada por el proveedor, sin nombre ni múltiples destinatarios.               |

El nombre visible del remitente es **Cinetadel**. El mensaje en español incluye el
correo y la contraseña inicial de la cuenta creada, sin enlaces a funcionalidades
de inicio de sesión o cambio de contraseña que todavía no están implementadas.

La ausencia o el formato inválido de una variable SMTP impiden inicializar el backend,
incluso si el modo de administrador de desarrollo está deshabilitado. Esta validación
no abre conexiones SMTP y no comprueba credenciales ni permisos del remitente:
la disponibilidad y la autenticación del proveedor se comprueban al enviar.

El transporte exige cifrado y certificados válidos. Tiene tiempos de espera acotados
y no registra el contenido del mensaje, las contraseñas ni las respuestas privadas
del servidor. No utiliza un transporte alternativo que simule envíos exitosos.

## Resultado de la creación

1. El guard comprueba el administrador configurado y el pipe valida el cuerpo.
2. El servicio genera una contraseña aleatoria y calcula el hash y salt.
3. Oracle guarda dirección, perfil y credenciales en la misma transacción, cuando
   corresponde. Un error de persistencia impide enviar el correo.
4. Después de confirmar la transacción, se envía el correo únicamente a la cuenta creada.
5. Se devuelve `201` con `id`, `role` y `email` si SMTP acepta al destinatario.
   La aceptación por SMTP no garantiza recepción en la bandeja de entrada.

Si el envío falla, se devuelve `502` indicando que **la cuenta ya fue creada**.
No se revierte la cuenta ni se reintenta automáticamente el correo. No se debe
repetir `POST /users`: podría crear otra cuenta o provocar un conflicto. Una conexión
interrumpida también puede impedir confirmar el envío aunque el servidor haya aceptado
el mensaje. La recuperación o reenvío de credenciales requiere un incremento posterior.

## Prueba manual futura

Una vez integrado el frontend y configurado el entorno local, usar un correo de
prueba controlado y los catálogos reales para crear una cuenta. Verificar el resultado
en pantalla, el registro en Oracle y la recepción del mensaje. Una respuesta `502`
debe comunicarse como creación completada con fallo de correo, sin ofrecer repetir
la creación automáticamente. Estas pruebas sí crean datos reales y envían correos.

La API también admite solicitudes JSON directas a `POST /users` con el contrato de
`create-user.openapi.yaml`. No requiere un token en este modo: actúa el administrador
configurado en el servidor, no el rol seleccionado en la vista de desarrollo.

## Verificación automatizada

Los specs del guard comprueban la configuración, la identidad mínima y la consulta
en cada solicitud. Los del repositorio verifican SQL parametrizado y liberación de
conexiones. Las pruebas HTTP del controlador ejecutan el guard real con configuración,
repositorio y servicio simulados: comprueban los rechazos y mantienen los casos de
creación de clientes, empleados y administradores.

Además, `users.module.spec.ts` importa `AppModule` y prueba la ruta registrada con
servicio, repositorio, generador, hasher y emisor reales; solo sustituye configuración,
pool/conexiones Oracle y transporte SMTP. Comprueba los tres roles, la protección,
la validación, el rollback y el envío posterior al commit. Los specs del emisor
verifican configuración, cifrado, contenido, destinatarios rechazados y errores.
Las pruebas de catálogos cubren el mapeo de las cuatro tablas, los resultados vacíos,
la liberación de conexiones ante errores y la ruta GET protegida dentro de la
aplicación. Comprueban que consultar opciones no invoque creación ni credenciales.
No crean registros en Oracle ni envían correos reales.

En el frontend, los specs de Axios, la vista de desarrollo y el diálogo simulan
las respuestas HTTP. Verifican carga, selección geográfica, listas vacías, errores,
reintentos, conservación del texto y cancelación de solicitudes obsoletas.
