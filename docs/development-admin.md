# Creación administrativa y retiro del administrador de desarrollo

`DevelopmentAdminGuard` fue retirado. Las variables `DEV_ADMIN_ENABLED` y
`DEV_ADMIN_EMPLOYEE_ID` ya no conceden acceso. La creación administrativa requiere
iniciar sesión con una cuenta real cuyo rol vigente sea `ADMINISTRATOR`.
La preparación de sesión y su prueba manual se describen en [Inicio de sesión del personal](employee-login.md).

## Estado de integración

### Runtime y política de contraseñas

El backend declara Node `^24.15.0`: versiones 24.x desde 24.15.0. La API
`node:crypto.argon2` existe desde Node 24.7.0, pero las herramientas de desarrollo
incluidas en el lockfile requieren como mínimo 24.15.0 dentro de esa serie.
Referencia: [Node 24.7.0](https://nodejs.org/download/release/v24.7.0/docs/api/crypto.html#cryptoargon2algorithm-parameters-callback).

CI utiliza el mismo rango y comprueba que `crypto.argon2` esté disponible antes de
instalar. El paso de despliegue comprueba también el Node de la sesión SSH antes de
instalar y compilar. Una incompatibilidad detiene ese paso; no instala ni cambia
Node en el servidor.

La versión del runtime de `cinetadel-api.service` todavía debe confirmarse en el
servidor: `setup-node` solo prepara CI, y systemd puede usar un ejecutable diferente
del de la sesión SSH. Inspeccionar allí, sin modificar el servicio:

```sh
node --version
systemctl show cinetadel-api.service -p ExecStart -p User -p WorkingDirectory
```

Comprobar la versión y la disponibilidad de `crypto.argon2` con el ejecutable Node
que realmente inicia el servicio. Si `ExecStart` utiliza npm o un script, revisar
su resolución de Node y el entorno del servicio localmente, sin publicar secretos.
No se considera verificado el runtime de producción solo porque CI pase.

`AuthService` y `UsersService` delegan el hashing en `PasswordHasher`. Su
implementación compartida genera Argon2id v19 con memoria de 65536 KiB (64 MiB),
3 pasadas, paralelismo 4, salt aleatorio de 16 bytes y resultado de 32 bytes.
Son los parámetros que ya utilizaba el registro público y la segunda configuración
recomendada en [RFC 9106](https://www.rfc-editor.org/rfc/rfc9106.html#section-4).

Se conserva el formato PHC, que incluye los parámetros en cada hash. Las
credenciales anteriores no se migran ni se recalculan. Las pruebas comprueban la
verificación tanto del perfil administrativo anterior (19456 KiB, 2 pasadas,
paralelismo 1) como del perfil de registro y del nuevo perfil compartido, incluyendo
el rechazo de contraseñas incorrectas. El registro público conserva el relleno
Base64 `==` de su columna `SALT`; el alta administrativa conserva la representación
sin relleno. Ambas codificaciones representan los mismos bytes del salt.

Las altas administrativas nuevas tienen un coste de hashing mayor. La capacidad
bajo concurrencia y las protecciones frente a muchas solicitudes quedan pendientes
de un incremento específico: medición de CPU/memoria, límites de solicitudes y de
hashes simultáneos, y saturación del pool de Oracle. Este incremento no añade esas
protecciones ni reduce parámetros automáticamente por carga.

### Persistencia compartida de clientes

El registro público sigue `AuthService → ClientsService → ClientsRepository`.
El alta administrativa sigue `UsersService → ClientsRepository`. El repositorio
de clientes usa `DatabaseService.transaction()` para guardar dirección opcional,
perfil y credenciales locales en una única transacción. Devuelve el identificador
después del commit; el envío de credenciales permanece en `UsersService`.

La inserción de perfiles sociales también reutiliza `ClientsRepository` dentro de
la transacción iniciada por `ClientsService`, que conserva las reglas de vinculación
y la escritura de credenciales externas. Las operaciones de empleados permanecen
en `UsersRepository`.

Se conservan campos opcionales y valores nulos. El registro público y social
mantienen su idioma predeterminado `es`; el alta administrativa puede omitirlo para
usar el valor predeterminado de Oracle. `ACCEPTED_TERMS_AT` solo se completa ante
`acceptedTerms === true`; un alta administrativa no representa consentimiento del
cliente. El género existente del registro público se conserva sin añadirlo al
formulario administrativo.

Las comprobaciones previas de correo se mantienen. Si dos solicitudes superan la
comprobación al mismo tiempo, `UQ_CLIENTS_EMAIL` resuelve la carrera: se revierte la
transacción perdedora y se devuelve `409`, sin enviar credenciales ni revelar el
mensaje privado de Oracle. Otros errores de integridad no se convierten en un
conflicto de correo.

### Flujos disponibles

`UsersModule` está registrado en `AppModule` y expone `POST /users` y
`GET /users/creation-options`. Conecta el
controlador, la validación, el guard, el repositorio Oracle, el generador aleatorio,
el hasher Argon2id y el envío de credenciales por SMTP. El servidor necesita la
configuración de Oracle y SMTP para arrancar.

El dashboard autenticado carga los catálogos mediante Axios al abrir el formulario
y permite crear clientes, empleados y administradores mediante `POST /users`. Valida
los campos, bloquea envíos duplicados y comunica el resultado. `CreateUserDialog.vue`
comparte el comportamiento modal y las validaciones entre las dos variantes.
En Clientes, «Añadir cliente» está disponible para el administrador autenticado;
el guard del backend sigue siendo quien autoriza cada solicitud.

La integración del formulario está lista para preparar las pruebas manuales. Antes
de realizarlas es necesario configurar los entornos locales de Vue y Nest, el
inicio de sesión y un proveedor SMTP real, y arrancar ambos servidores.
No se modifica automáticamente la base de datos ni el archivo `.env` al incorporar
este módulo; enviar el formulario sí crea registros reales y solicita un correo.

## Configuración prevista

El entorno local del backend necesita estas variables:

```dotenv
NODE_ENV=development
FRONTEND_URL=http://127.0.0.1:5179
```

También se requiere `JWT_SECRET`, con un valor aleatorio y privado. Usar las
credenciales locales de un empleado existente. El ID no está fijado en el código:
lo determina el JWT firmado durante el login. La estrategia JWT vuelve a consultar
`EMPLOYEE_ID` y `ROLE` en Oracle en cada solicitud protegida y no confía en roles
enviados en el cuerpo, encabezados personalizados ni claims de rol del token.

## Comportamiento y límites

- Una sesión ausente, inválida o expirada, o una identidad inexistente, producen `401`.
- Una identidad sin rol administrador produce `403` antes de validar el formulario.
- `POST /users` también exige el origen autorizado; GET de catálogos no requiere Origin.
- Los fallos operativos de Oracle impiden la operación y reciben una respuesta `500`
  sin detalles internos.
- El rol del formulario describe la cuenta por crear. Los encabezados, el cuerpo y
  las identidades enviadas por el navegador no eligen al administrador que actúa.
- La cookie HttpOnly conserva la sesión durante su plazo original de 24 horas.
  Cerrar sesión elimina la cookie de ese navegador; no revoca JWT en otros dispositivos.

## Catálogos del formulario

`GET /users/creation-options` devuelve los datos existentes en Oracle, con el mismo
guard de administrador autenticado que protege la creación. No requiere cuerpo
ni parámetros y responde con estas cuatro listas:

| Lista       | Tabla       | Campos de cada opción       |
| ----------- | ----------- | --------------------------- |
| `provinces` | `PROVINCES` | `id`, `label`               |
| `cantons`   | `CANTONS`   | `id`, `label`, `provinceId` |
| `districts` | `DISTRICTS` | `id`, `label`, `cantonId`   |
| `branches`  | `CINEMAS`   | `id`, `label`               |

Se consultan todos los registros y cada lista se ordena por nombre e identificador
en Oracle. No se renombran sucursales ni se crean datos. Una tabla vacía devuelve
una lista vacía. Cada consulta obtiene y libera una conexión mediante
`DatabaseService.query()`; si alguna consulta falla, la respuesta es `500` genérico y
no se envían catálogos parciales. La falta de sesión devuelve `401`; la falta de permisos, `403`.

Vue filtra cantones por `provinceId` y distritos por `cantonId` utilizando
los selectores existentes. La dirección exacta sigue siendo texto introducido por
el usuario; al crear la cuenta se envían `address.districtId` y `address.details`.
La sucursal se elige de forma independiente, sin atribuirle relaciones geográficas
que no están definidas en este contrato.

Este endpoint solo consulta datos: no genera contraseñas ni envía correos. La
configuración SMTP sigue siendo necesaria para iniciar el backend.

## Conexión local con Vue

El ejemplo `apps/web/.env.example` utiliza `VITE_API_BASE_URL=/api`. Para la
prueba integrada, configurar ese valor en el entorno local de Vite y reiniciar
el servidor de desarrollo si se modifica. No se editan automáticamente archivos
`.env` privados. El backend se espera en `http://127.0.0.1:3000`.

Vite reenvía `/api/users/creation-options` a `/users/creation-options` de Nest,
retirando el prefijo `/api`. Así el navegador consulta su mismo origen durante
el desarrollo local. Si se cambia el puerto del backend, también debe ajustarse
el destino en `vite.config.ts`. El proxy no se incluye en los archivos de producción:
el despliegue debe configurar su propia URL y enrutamiento hacia la API.

El registro público y la creación administrativa comparten la instancia Axios de
`apps/web/src/services/api.ts`. Ambos utilizan `VITE_API_BASE_URL`; la variable
anterior `VITE_API_URL` ya no se lee. Si un entorno la utilizaba, trasladar su URL
a `VITE_API_BASE_URL` y reiniciar Vite (o volver a compilar para producción).
Los servicios conservan sus contratos y mensajes; no hay reintentos automáticos.

`AuthModule` está registrado en `AppModule`. El registro público existente queda
accesible, junto con el login del personal, recuperación de sesión y logout.
El inicio de sesión de clientes y los proveedores externos siguen pendientes.

En `/dashboard`, «Añadir empleado» abre el diálogo y consulta los catálogos.
Mientras espera, muestra un aviso de carga y permite escribir los datos personales.
Si ocurre un error, muestra un mensaje en español y permite reintentar sin borrar
lo escrito. Los errores de permisos y de tiempo de espera tienen mensajes específicos.
Una respuesta exitosa con listas vacías muestra las opciones no disponibles, sin
presentarla como un fallo de conexión.

Las solicitudes GET tienen un tiempo de espera de diez segundos. Los catálogos se
reutilizan al cerrar y abrir el diálogo dentro de la misma sección; al cambiar de
sección o rol verificado se descartan y se cancelan las cargas pendientes. Al salir de
la vista también se cancela la solicitud. Las respuestas tardías de solicitudes
canceladas no cambian el formulario actual. No hay reintentos automáticos.

El rol de la vista procede de la sesión verificada. El backend comprueba los permisos
actuales independientemente de los controles visibles en la interfaz.

## Envío del formulario

«Crear usuario» valida todos los campos y enfoca el primer campo inválido. El cuerpo
incluye el rol de la cuenta, sus datos personales, `branchId` y la dirección anidada
con `districtId` y `details`. No envía los identificadores auxiliares de provincia
y cantón ni una contraseña. Los textos opcionales vacíos se omiten.

Mientras la solicitud está pendiente se bloquean los campos, el cierre del diálogo
y los nuevos envíos. Axios espera como máximo sesenta segundos para el POST, sin
reintentos automáticos. Este límite no cancela una transacción que el servidor ya
esté procesando. Salir del navegador tampoco garantiza cancelar la creación.

| Resultado                                                          | Comportamiento de la interfaz                                                                                                      |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `201`                                                              | Cierra y limpia el formulario, y anuncia la cuenta creada y la aceptación del correo por SMTP.                                     |
| `400`                                                              | Muestra la validación recibida y conserva los campos para corregirlos.                                                             |
| `401`                                                              | Retira la identidad local y solicita iniciar sesión nuevamente.                                                                    |
| `403`                                                              | Informa de la falta de permisos y conserva los campos.                                                                             |
| `409`                                                              | Informa del conflicto de correo y conserva los campos.                                                                             |
| `502` con el mensaje contractual de cuenta creada                  | Cierra y limpia el formulario; informa que la cuenta existe pero no se confirmó el envío del correo y pide no repetir su creación. |
| Error de red, tiempo agotado, `500` u otra respuesta no reconocida | Informa que no pudo confirmar la creación y bloquea nuevos envíos en esa vista para evitar duplicados. Conserva los datos.         |

Un `502` genérico de un proxy no confirma una cuenta creada: se trata como resultado
incierto. Tras un resultado incierto, cerrar y abrir el diálogo no desbloquea el envío.
Se debe comprobar el estado real antes de recargar la vista y efectuar otra creación;
el bloqueo de la interfaz no reemplaza la idempotencia del servidor. La comprobación
de cuentas existentes y la recuperación del correo no se implementan en este incremento.

La confirmación se muestra como un mensaje accesible; todavía no hay un listado de
empleados que se actualice después de crear la cuenta.

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
al portal o al cambio de contraseña, que sigue pendiente.

La ausencia o el formato inválido de una variable SMTP impiden inicializar el backend,
incluso antes de iniciar sesión. Esta validación
no abre conexiones SMTP y no comprueba credenciales ni permisos del remitente:
la disponibilidad y la autenticación del proveedor se comprueban al enviar.

El transporte exige cifrado y certificados válidos. Tiene tiempos de espera acotados
y no registra el contenido del mensaje, las contraseñas ni las respuestas privadas
del servidor. No utiliza un transporte alternativo que simule envíos exitosos.

## Resultado de la creación

1. La estrategia JWT comprueba la sesión, el guard exige ADMINISTRATOR y el pipe valida el cuerpo.
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

## Preparación local para las pruebas manuales

Los archivos `apps/api/.env` y `apps/web/.env.local` están excluidos de Git. Tras
integrar `dev`, adaptar Oracle a modo Thin según los pasos siguientes. Para el entorno acordado, el backend
usa `NODE_ENV=development`, `FRONTEND_URL=http://127.0.0.1:5179` y `JWT_SECRET` privado.
El frontend usa `VITE_API_BASE_URL=/api`.

### Migración de Oracle a modo Thin

El backend utiliza `DatabaseService` de `dev`, que administra un único pool.
`UsersRepository` y `ClientsRepository` utilizan `query()` para las lecturas y
`transaction()` para crear dirección, perfil y credenciales con una misma conexión
y un único commit, para empleados y clientes respectivamente. Un fallo
de escritura produce rollback. Los fallos de limpieza no sustituyen el error
original de la transacción.

1. Detener el backend anterior. Reiniciar el proceso es necesario para que deje
   de utilizar el cliente Thick que ya había cargado.
2. Conservar la wallet fuera de Git. Para la ubicación local existente,
   `apps/api/Wallet/` debe contener `tnsnames.ora` y `ewallet.pem`. No borrar la wallet
   ni modificar las tablas o los registros existentes.
3. Editar **`apps/api/.env`**, conservando `DB_USER`, `DB_PASSWORD`, las variables
   de autenticación y las de SMTP. El ejemplo general `apps/.env.example` no se carga
   automáticamente: Nest lee `.env` desde `apps/api/` al arrancar allí.
4. Renombrar `DB_CONNECTION_STRING` a `DB_CONNECT_STRING`, conservando el alias
   válido que ya usabas y que aparece en `tnsnames.ora`.
5. Añadir `DB_WALLET_DIR=./Wallet` al iniciar Nest desde `apps/api/`. También se puede
   usar una ruta absoluta; la carpeta debe contener los dos archivos anteriores.
6. Añadir `DB_WALLET_PASSWORD` con la contraseña de la wallet, introducida
   directamente en el archivo privado. Es la contraseña que protege `ewallet.pem`,
   no la contraseña SMTP, la de la cuenta Cinetadel ni necesariamente `DB_PASSWORD`.
   Si contiene `#` o espacios, escribir el valor entre comillas para conservarlo.
7. Si `DB_USER` es el propietario `PRODUCTION`, no hace falta `DB_SCHEMA`. Si usas
   otro usuario con permisos sobre esas tablas, configurar `DB_SCHEMA=PRODUCTION`.
   Esta variable selecciona el esquema; no concede permisos.
8. Eliminar del entorno del backend las variables antiguas `DB_CONNECTION_STRING`
   y `ORACLE_CLIENT_LIB_DIR`, que ya no se utilizan. No es necesario desinstalar
   Instant Client ni cambiar SQL Developer.
9. Tras instalar las dependencias con `npm ci` en cada aplicación, arrancar Nest y
   Vue con los comandos indicados abajo. Confirmar el mensaje de conexión a Oracle
   y abrir el formulario para comprobar los catálogos antes de crear otra cuenta.

El modo Thin es el modo predeterminado de node-oracledb cuando no se llama a
`initOracleClient()` y no requiere Instant Client. La configuración de esta rama
utiliza la wallet para la conexión mTLS. Referencia:
[documentación oficial de node-oracledb](https://node-oracledb.readthedocs.io/en/latest/user_guide/connection_handling.html#connecting-to-oracle-cloud-autonomous-databases).

### Correo y arranque

Para Gmail, configurar `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465` y
`SMTP_SECURE=true`. `SMTP_USER` y `SMTP_FROM` deben contener la cuenta remitente
acordada. Introducir `SMTP_PASSWORD` directamente en el archivo local: no usar la
contraseña del administrador del sistema ni compartir esta credencial en el chat.

Google requiere verificación en dos pasos para crear una contraseña de aplicación.
Desde la cuenta remitente, abrir [Contraseñas de aplicación](https://myaccount.google.com/apppasswords),
crear una para el entorno de desarrollo y copiarla a `SMTP_PASSWORD`. Si no aparece
esa opción, consultar las restricciones de la cuenta en la
[ayuda de Google](https://support.google.com/mail/answer/185833?hl=es).
Mientras `SMTP_PASSWORD` esté vacío, Nest no puede iniciar.

En una terminal ubicada en `apps/api/`, iniciar el backend con:

```sh
npm run start:dev
```

En otra terminal ubicada en `apps/web/`, iniciar Vue con:

```sh
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Si el frontend ya está ejecutándose en ese puerto, utilizar esa instancia; no
iniciar otra. Reiniciar los procesos si sus variables de entorno no se actualizan.
El proxy presupone que Nest escucha en el puerto 3000.

Abrir `http://127.0.0.1:5179/`, iniciar sesión como administrador y seleccionar
«Añadir empleado» en `/dashboard`. Comprobar
que aparecen las sucursales y provincias, y que provincia → cantón → distrito filtra
las opciones. Esta consulta no crea registros ni envía correo. Si falla, revisar:

- Que Vue tenga `VITE_API_BASE_URL=/api` y Nest esté escuchando en 3000.
- Que la configuración SMTP esté completa, pues es necesaria para arrancar Nest.
- Que la sesión corresponda a un empleado con rol vigente `ADMINISTRATOR`.
- Que `FRONTEND_URL` coincida exactamente con el origen abierto en el navegador.

La verificación SMTP de conexión y autenticación no envía mensajes ni garantiza que
el proveedor acepte un remitente o entregue un correo; eso se verifica en la prueba
real de creación.

## Prueba manual de creación de empleados y administradores

1. Usar un correo de prueba controlado que permita identificar la nueva cuenta.
2. Completar los datos, seleccionar una sucursal existente y una dirección, e
   introducir sus señas si corresponde. Elegir empleado o administrador.
3. Pulsar «Crear usuario» una sola vez. Comprobar el estado de envío y su resultado.
4. Si se confirma la creación, verificar el registro y sus relaciones en Oracle,
   y revisar la bandeja de entrada y correo no deseado del destinatario.
5. Ante `502` contractual, verificar la cuenta existente sin repetir su creación.
   Ante un resultado incierto, comprobar Oracle antes de efectuar otro intento.

Estas pruebas sí crean datos reales y envían correos. Requieren iniciar sesión
como administrador. Los listados reales de clientes y
empleados siguen pendientes; esta vista confirma la creación mediante mensajes.

## Prueba manual de creación de clientes

1. En `/dashboard`, con sesión de administrador, abrir Clientes
   y pulsar «Añadir cliente». La página del fondo debe quedar bloqueada mientras
   el diálogo esté abierto.
2. Completar primer nombre y un correo controlado y único. Son los únicos campos
   obligatorios, marcados con un asterisco rojo. Probar un correo mal formado y
   comprobar la retroalimentación al salir del campo y al corregirlo.
3. Dejar vacíos los datos opcionales y mantener desactivado «Añadir dirección».
   Pulsar «Crear cliente». Este caso no requiere sucursal ni catálogos geográficos.
   Comprobar el resultado, el correo recibido, el registro en `CLIENTS` y su
   relación con `CLIENT_LOCAL_CREDENTIALS`; `ID_ADDRESS` debe permanecer nulo.
4. Con otro correo controlado, repetir completando segundo nombre, apellidos,
   fecha de nacimiento, teléfono e idioma. Activar «Añadir dirección», seleccionar
   provincia → cantón → distrito e introducir el detalle si corresponde. Verificar
   la dirección creada en `ADDRESSES` y su relación con `CLIENTS`. Si se activa
   la dirección, debe completarse la selección geográfica antes de enviar.
5. Intentar crear otro cliente con un correo ya utilizado: debe aparecer el mensaje
   de duplicado y conservarse lo escrito para corregirlo. Cambiar de sección tras
   cerrar el diálogo debe abrir un formulario limpio y sin errores del anterior.
6. Cerrar sesión e ingresar con una cuenta de empleado: puede ver Clientes, pero no «Añadir cliente».

Los campos opcionales vacíos no se envían y una dirección desactivada tampoco.
El idioma inicial es español (`es`); también puede elegirse inglés (`en`). El alta
administrativa genera la contraseña en el backend y no declara una aceptación de
términos por parte del cliente. No solicita contraseña, género, rol ni sucursal.

Ante la respuesta contractual de cuenta creada sin correo confirmado, verificar
la cuenta sin repetir el envío. Ante un resultado incierto por conexión o servidor,
el bloqueo de nuevos envíos se conserva aunque se cambie de sección.
Verificar primero Oracle; cambiar de formulario no confirma ni revierte la operación.

La API también admite solicitudes JSON directas a `POST /users` con el contrato de
`create-user.openapi.yaml`. Requiere autenticación y rol ADMINISTRATOR vigente,
además del Origin autorizado en POST; el rol del cuerpo no otorga permisos.

## Verificación automatizada

Los specs del guard comprueban el rol de la identidad autenticada. La estrategia JWT
comprueba firma, expiración e identidad vigente. Los del repositorio verifican SQL
parametrizado y liberación de conexiones. Las pruebas HTTP del controlador ejecutan
autenticación y autorización reales con configuración,
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

En el frontend, los specs de Axios, el dashboard y el diálogo simulan
las respuestas HTTP. Verifican carga, selección geográfica, listas vacías, errores,
reintentos, conservación del texto y cancelación de solicitudes obsoletas.
También verifican el envío de empleados y administradores, el cuerpo enviado,
la validación completa, la prevención de duplicados, la limpieza tras una creación
confirmada y el tratamiento de errores corregibles o resultados inciertos.
