# Información legal del portal

SCRUM-418 incorpora los textos de términos y condiciones, aviso de privacidad y
política de reembolso. Son contenido estático de la aplicación, con fecha de
actualización explícita; no hay tablas, servicios de contenido ni consultas para
obtenerlos. Para actualizar un documento se modifica su vista y su fecha.

## Rutas y presentación

| Documento              | Ruta pública            | Vista                 |
| ---------------------- | ----------------------- | --------------------- |
| Términos y condiciones | `/terms-and-conditions` | `TermsConditions.vue` |
| Aviso de privacidad    | `/privacy-policy`       | `PrivacyPolicy.vue`   |
| Política de reembolso  | `/refund-policy`        | `RefundPolicy.vue`    |

`LegalDocument.vue` comparte la cabecera, pie, navegación al portal, título,
fecha y estilos. El contenido usa secciones con encabezados de segundo nivel,
párrafos y listas. El ancho de lectura es limitado y se adapta al contenedor del
portal; los colores proceden de `variables.css`. Hay un enlace de salto al
contenido accesible por teclado.

El footer conserva sus rutas. En el registro, los enlaces de términos y privacidad
abren otra pestaña con `noopener noreferrer`, sin enviar el formulario ni perder
sus campos. Se conserva la aceptación existente y su validación.

## Acceso y sesiones

Las tres rutas llevan `meta.publicLegal`. El guard de clientes permite consultarlas
sin comprobar la sesión ni la contraseña. La cabecera puede restaurar la identidad
para mostrar el menú habitual, pero no obliga a cambiar la contraseña mientras se
consulta un documento legal. Una respuesta tardía de contraseña tampoco interrumpe
la lectura. Las operaciones de cuenta y compra conservan sus guards y validaciones.

No se cambia la persistencia de sesiones: clientes continúan usando
`localStorage`, y empleados/administradores la cookie existente. No se modifican
su duración, emisión, cierre, revocación ni proveedores de acceso social.

No se añade un banner de cookies en esta entrega. La revisión detectó que
`loadFBSDK.ts` activa cookies de Facebook y llama a `FB.AppEvents.logPageView()` al
inicializarse. El aviso de privacidad describe ese comportamiento. Por decisión
de alcance, el control de consentimiento previo de servicios externos se trata
en otra tarea; publicar esta información no sustituye dicho control ni constituye
una verificación integral del cumplimiento del tratamiento de datos.

## Correspondencia con el sistema

- Seleccionar asientos no los reserva. La confirmación de compra comprueba su
  disponibilidad y registra la operación de forma atómica.
- El comprobante y QR identifican la compra. No se promete un lector de QR ni un
  control de ingreso que todavía no existen.
- El cliente consulta sus compras en el perfil y el invitado mediante su enlace
  privado. El envío de correo y su reenvío conservan el flujo existente.
- La reprogramación solo se describe cuando el sistema ofrece alternativas de
  la misma película y sucursal; no se incorporan reglas de otra cadena sobre
  cambios de película, cargos o plazos.
- La compra actual registra pagos simulados. Los textos no prometen integración
  bancaria, cobros con tarjeta ni reembolsos automáticos. La política indica el
  correo de asistencia para las revisiones y respeta los derechos aplicables.
- Desactivar una cuenta no elimina su historial. El aviso distingue esa operación
  de una solicitud de acceso, rectificación o supresión de datos.

El contacto utilizado es el correo ya publicado en el footer:
`cinetadel2026@gmail.com`. No se inventan una razón social, cédula jurídica,
canales de soporte ni tiempos de devolución.

## Referencias consultadas

- [Ley 8968 publicada por MICITT](https://www.micitt.go.cr/sites/default/files/marco_juridico_legal/08.%20Ley%20n.%C2%B0%208968%20Ley%20de%20Protecci%C3%B3n%20de%20la%20Persona%20frente%20al%20tratamiento%20de%20sus%20datos%20personales..pdf): información sobre el tratamiento y derechos de las personas.
- [Términos de Cinépolis Costa Rica](https://cinepolis.co.cr/wp-content/uploads/2026/02/Terminos-y-condiciones-CR-boletos-y-comida.pdf): referencia de temas habituales de boletos y cancelaciones. No se copian sus reglas de medios de pago, cargos, plazos, formularios ni condiciones incompatibles con Cinetadel.

## Verificación

Las pruebas con mocks cubren rutas públicas con la API de autenticación no
disponible, conservación de la identidad y token del cliente, navegación real
desde el footer, enlace de salto, jerarquía del contenido y ausencia de textos
provisionales. Las regresiones comprueban que el registro conserva sus datos y
que las páginas legales no reciben redirecciones por contraseña vencida, incluidas
respuestas tardías. Las rutas protegidas mantienen sus comprobaciones anteriores.

Para revisión manual:

1. Abrir cada ruta sin sesión, desde el footer y directamente.
2. Repetir con una sesión de cliente y comprobar que el menú y la sesión se conservan.
3. Comprobar las tres rutas con una contraseña vencida; al volver a una operación
   protegida debe mantenerse la exigencia de cambio de contraseña.
4. Abrir términos y privacidad desde el registro y volver a la pestaña del
   formulario: los datos y la casilla deben conservarse.
5. Recorrer enlaces con Tab, usar «Ir al contenido», desplazarse hasta el final y
   volver al portal. Revisar a 320, 390, 768 y 1440 píxeles.

Se usan los scripts existentes de Vitest, cobertura, ESLint, comprobación de tipos
y compilación. No se modifican CI/CD, SonarQube, dependencias, configuración
privada ni la base de datos.

### Resultados del 17 de noviembre de 2026

- Vitest: 1.859 pruebas aprobadas en 125 archivos.
- Cobertura global de líneas: 95,96 %.
- Líneas ejecutables añadidas o modificadas respecto a `HEAD`: 100 % (24/24).
- Ramas de esas líneas: 100 % (70/70).
- ESLint, tipos, compilación y Prettier: correctos.

La cobertura del incremento cruza LCOV con el diff y los archivos nuevos; no
mide CSS ni sustituye la definición de código nuevo de SonarQube.

En Chrome sin interfaz visible se revisaron las tres páginas a 320, 390, 768 y
1440 píxeles: no hubo desbordamiento horizontal y se pudo llegar al footer.
También se inspeccionaron capturas de móvil y escritorio. Con API y SDK de Google
simulados, las tres páginas conservaron una identidad de cliente y su token, el
enlace de salto recibió foco mediante Tab y llevó el foco al contenido mediante
Enter, y no se registraron excepciones sin controlar. Estas comprobaciones no
validan cuentas reales, consentimientos de proveedores ni un teléfono físico.
