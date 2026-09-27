# Administrador de desarrollo

El guard `DevelopmentAdminGuard` permite probar la creación administrativa de usuarios
con un administrador real de Oracle, sin implementar inicio de sesión. Está aplicado
al controlador de usuarios y asocia `{ id, role }` a `request.user` únicamente después
de comprobar al administrador configurado.

## Estado de integración

El controlador todavía no está registrado en `AppModule`; `POST /users` continúa
sin estar disponible en la aplicación principal. Faltan la integración del módulo
de usuarios y el proveedor de correo. Este incremento agrega la protección y sus
pruebas; no activa el formulario ni modifica la base de datos o el archivo `.env`.

## Configuración prevista

Cuando se integre el módulo, el entorno local del backend necesitará estas variables:

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
y reiniciar el backend. Con el controlador integrado, las solicitudes seguirán
recibiendo `403` mientras no exista otro mecanismo de autorización aprobado.

## Verificación automatizada

Los specs del guard comprueban la configuración, la identidad mínima y la consulta
en cada solicitud. Los del repositorio verifican SQL parametrizado y liberación de
conexiones. Las pruebas HTTP del controlador ejecutan el guard real con configuración,
repositorio y servicio simulados: comprueban los rechazos y mantienen los casos de
creación de clientes, empleados y administradores. No crean registros en Oracle.
