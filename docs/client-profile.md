# Perfil de cliente

La ruta `/account/profile` permite consultar y modificar la cuenta del cliente autenticado. El menú de cuenta del portal incluye **Mi perfil**. El acceso mantiene las comprobaciones existentes de sesión, estado activo y vigencia de contraseña.

## Alcance

- **Mis datos:** consulta de nombres, apellidos, correo, celular, nacimiento, género, dirección, fecha de registro y estado. La edición permite nombres, apellidos, celular, dirección y los valores de género existentes (`M`, `F`, `O`, `N` o sin especificar). Nacimiento y fecha de registro son únicamente de consulta.
- **Seguridad:** cambio de correo verificado y reutilización del formulario de cambio de contraseña. Se mantiene la contraseña actual para cuentas con contraseña local y el comportamiento existente de configuración para cuentas sociales.
- **Preferencias:** muestra el idioma registrado. La edición de preferencias, géneros de películas y recomendaciones corresponde a otra historia.
- **Desactivar cuenta:** requiere confirmación, conserva los registros, cambia el estado a inactivo y revoca las sesiones. La reactivación continúa a cargo del personal autorizado mediante el CRUD existente.
- Se utiliza el avatar predeterminado. La carga y administración de imágenes corresponde a otra historia.

## Validación y edición

El backend reutiliza los DTO del CRUD mediante `@nestjs/mapped-types`. La actualización propia excluye correo, identificadores, rol, estado, fechas e idioma. El identificador de la cuenta proviene exclusivamente del JWT; no existe un endpoint de perfil que acepte seleccionar otra cuenta.

Los nombres admiten letras, marcas de acentuación y espacios. El celular acepta el formato móvil de Costa Rica, con prefijo `+506` opcional, y se normaliza a ocho dígitos. La dirección utiliza los mismos catálogos y límites de almacenamiento del CRUD. El frontend reutiliza sus utilidades de validación y muestra errores al salir del campo o enviar, sin interrumpir la escritura. El contador de dirección muestra caracteres. Los mensajes evitan detalles técnicos de almacenamiento.

La validación al perder foco distingue las acciones del usuario: cerrar, cancelar, mostrar contraseñas, abrir un calendario y navegar no deben provocar mensajes que desplacen el control antes de completar la acción. `useBlurValidation` comparte esta protección entre los formularios del perfil, el CRUD y la autenticación (incluida la recuperación). Admite foco por teclado y gestos de ratón, táctiles y lápiz, incluso cuando el navegador no informa el destino del foco. Al enviar se mantienen todas las validaciones. Los eventos y temporizadores de esta protección se liberan al desmontar el formulario.

El primer nombre sigue siendo obligatorio. Los campos opcionales de clientes creados por personal conservan esa condición. Los nombres históricos que no se modifican no se vuelven a enviar. Una actualización vacía se rechaza. La dirección se crea o desvincula dentro de la transacción existente, sin alterar direcciones compartidas.

La edición solicita confirmación antes de guardar. Cancelar, cambiar de sección o abandonar una edición con cambios pendientes requiere confirmar el descarte. Durante las solicitudes se impiden envíos repetidos. Después de guardar se vuelve a consultar el perfil y se actualiza la identidad del menú. Un fallo de esa consulta se distingue de un fallo al guardar. Las respuestas tardías no sustituyen una sesión más reciente.

## Cambio de correo

1. El cliente introduce un nuevo correo desde Seguridad. Se comprueba el formato, que sea diferente al actual y que no esté reservado por otro cliente, incluso inactivo.
2. El sistema envía al nuevo buzón un enlace con vigencia de **30 minutos**. No cambia el correo actual ni modifica los demás datos.
3. El enlace abre `/account/confirm-email#<token>`. El token viaja en el fragmento, se mantiene en memoria y no se guarda en `localStorage`.
4. La página es pública y exige pulsar **Confirmar nuevo correo**. Abrir el enlace o realizar un GET no modifica datos.
5. La confirmación bloquea la fila de la cuenta y comprueba estado activo, correo anterior y versión de sesiones. Vuelve a comprobar unicidad, cambia el correo y revoca las sesiones **en una única transacción**.
6. Se ofrece iniciar sesión con el nuevo correo. No se emite una sesión automáticamente. En el navegador se elimina únicamente la sesión correspondiente, siempre que no haya sido reemplazada durante la solicitud.

El JWT de confirmación tiene audiencia y propósito `client-email-change`, firma HS256 y carece del tipo de cuenta utilizado en los JWT de acceso. No puede utilizarse para iniciar sesión. Usar un enlace, recuperar la contraseña, desactivar la cuenta o revocar sus sesiones invalida los enlaces con una versión anterior. Cambiar el correo anterior también los invalida. Pueden existir varias solicitudes pendientes; confirmar una invalida las demás. Un fallo al revocar sesiones revierte el cambio de correo.

Se reutilizan el transporte SMTP y la plantilla de confirmación de registro con un propósito distinto. El registro conserva su contenido y comportamiento. No se utilizan los registros pendientes de verificación de registro ni su limpieza automática para cuentas establecidas. **No se crean tablas ni se modifica el esquema.** La versión de sesiones se obtiene de `PASSWORD_RECOVERIES`, ya utilizada por la autenticación y la desactivación.

Los enlaces de correo utilizan el `FRONTEND_URL` existente. La configuración SMTP y `JWT_SECRET` son las existentes. La solicitud y confirmación de correo tienen un límite de cinco solicitudes por minuto por IP y validación de origen. Los datos de perfil y las respuestas de confirmación no deben almacenarse en caché. Las contraseñas y sus hashes nunca forman parte de la respuesta del perfil.

## API

El contrato se encuentra en [client-profile.openapi.yaml](client-profile.openapi.yaml). Todos los paths se sirven bajo `/api`.

| Método | Ruta                            | Acceso                                                   | Resultado                                    |
| ------ | ------------------------------- | -------------------------------------------------------- | -------------------------------------------- |
| GET    | `/clients/me`                   | Cliente con contraseña vigente                           | Datos propios                                |
| GET    | `/clients/me/address-options`   | Cliente con contraseña vigente                           | Provincias, cantones y distritos             |
| PATCH  | `/clients/me`                   | Cliente y origen autorizado                              | 204 al actualizar datos personales           |
| PATCH  | `/clients/me/deactivate`        | Cliente y origen autorizado                              | 204 al desactivar y revocar sesiones         |
| POST   | `/clients/me/email-change`      | Cliente, origen autorizado y límite de solicitudes       | 202 después de aceptar el correo para envío  |
| POST   | `/clients/email-change/confirm` | Enlace válido, origen autorizado y límite de solicitudes | ID de la cuenta confirmada; sin credenciales |

## Verificación automatizada

Las pruebas de servicio, DTO, guardas y HTTP usan persistencia Oracle y correo simulados. Las pruebas HTTP ejecutan Nest y la estrategia JWT reales, sin conectarse a Oracle, SMTP, Google o Facebook. Las pruebas Vue simulan las solicitudes y comprueban validación diferida, confirmaciones, cancelaciones, errores y protección frente a respuestas tardías.

Desde `apps/api`: `npm run test:cov -- --runInBand`, `npm run lint`, `npm run build` y `npm run type-check`.

Desde `apps/web`: `npm run test:cov -- --maxWorkers=2`, `npm run lint` y `npm run build`.

La validación automatizada no acredita la entrega real de correo ni la configuración del entorno desplegado. La prueba manual de integración debe comprobar recepción, vencimiento y reutilización del enlace, inicio de sesión con el correo nuevo, rechazo del anterior y rechazo de sesiones previas a la confirmación o desactivación.

### Resultados de esta implementación

| Verificación               | API                               | Web                                 |
| -------------------------- | --------------------------------- | ----------------------------------- |
| Suite completa con mocks   | 86 suites, 1982 pruebas correctas | 67 archivos, 1034 pruebas correctas |
| Cobertura global de líneas | 97,38 %                           | 95,01 %                             |
| Cobertura global de ramas  | 89,58 %                           | 90,40 %                             |
| Líneas nuevas cubiertas    | 146/147 (99,32 %)                 | 343/346 (99,13 %)                   |
| Ramas nuevas cubiertas     | 113/136 (83,09 %)                 | 378/406 (93,10 %)                   |

Las métricas de código nuevo se calcularon cruzando los informes LCOV con las líneas añadidas respecto de `HEAD` y todos los archivos fuente nuevos. Las pruebas se excluyen de esa medición. La cobertura combinada local de líneas y ramas nuevas es 91,52 % en API y 95,88 % en web; ambas superan el 80 %. SonarQube realizará su propio cálculo sobre la base de comparación de la PR. No se modificó su configuración.

### Revisión de interacción y header (24 de octubre de 2026)

El header utiliza `--navbar-background` (`--surface-background` en la paleta actual) cuando no está superpuesto, de modo que se distingue de `--page-background` sin introducir colores fijos. En el portal conserva el fondo transparente mediante la variante `overlay`, para mantener el efecto sobre el carrusel. La protección de validaciones al perder foco se aplica al registro, inicio de sesión y recuperación, creación y modificación de clientes y personal, edición del perfil y cambio de correo.

Las pruebas simulan foco, eventos nativos de puntero y solicitudes. Cubren cerrar y cancelar al primer intento, abrir el calendario, mostrar contraseñas, navegación por teclado, gestos cancelados y limpieza de listeners y temporizadores. Se conserva el rechazo de datos inválidos al enviar. No requieren conexiones a Oracle ni a proveedores externos.

- Suite del área afectada: 8 archivos y 252 pruebas correctas.
- Suite web completa: 68 archivos y 1075 pruebas correctas.
- Cobertura global web: 95,03 % de líneas y 90,43 % de ramas.
- Código nuevo de este ajuste respecto de `HEAD`: 38/39 líneas (97,44 %) y 33/35 ramas (94,29 %), con cobertura combinada de 95,95 % según LCOV.
- `useBlurValidation.ts`: 100 % de líneas cubiertas.
- Compilación, comprobación de tipos, ESLint y formato Prettier correctos.
