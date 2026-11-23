# Secciones del portal

SCRUM-437. El portal principal divide la oferta en **Cartelera**, **Preventas** y **Estrenos**.
Cada película aparece en una sola sección, y las secciones son iguales para visitantes y clientes.
Diseño: prototipo de Figma "Portal principal", opción A.

## Reglas

Se usan dos fechas nuevas de la película, en hora de Costa Rica:

- `RELEASE_DATE`: fecha de estreno. Vacía significa que la película ya estrenó (todas las
  anteriores a esta historia).
- `PRESALE_START`: inicio de preventa. Necesita una fecha de estreno y debe ser anterior a ella.

| Sección | Regla | Qué muestra la tarjeta |
| --- | --- | --- |
| **Cartelera** | Ya estrenó (`RELEASE_DATE` vacía o ≤ hoy) y tiene funciones a la venta | Clasificación, duración, géneros y **Comprar boletos** |
| **Preventas** | `PRESALE_START` ≤ hoy < `RELEASE_DATE`, con funciones a la venta | Insignia **Preventa**, "Estreno el 4 dic" y **Comprar boletos** |
| **Estrenos** | Estrena después de hoy y su preventa no empezó; no necesita funciones | **Estreno · 18 dic** y, si la preventa ya tiene fecha, "Preventa desde el 1 dic". No se puede comprar. |

"Funciones a la venta" es la misma regla que ya usaba el catálogo para comprar:

- función `ACTIVE` que todavía no empieza;
- sala y sucursal activas;
- la película disponible en esa sucursal;
- al menos un asiento libre.

Una película de Estrenos también debe estar disponible en alguna sucursal activa.

Cartelera y Preventas se ordenan por la próxima función. Estrenos, por fecha de estreno.

## Dashboard

En **Películas › Crear** y **Modificar**, la sección *Información general* tiene dos campos
opcionales: **Fecha de estreno** e **Inicio de preventa**.

- La preventa debe empezar antes del estreno. El formulario lo valida, la API lo vuelve a validar
  con las fechas que quedarían guardadas, y la base lo garantiza con
  `CK_MOVIES_PRESALE_BEFORE_RELEASE`.
- Borrar una fecha al modificar la deja vacía. Por ejemplo, quitar la preventa devuelve la
  película a Estrenos.
- **Ver** muestra "En cartelera" cuando no hay fecha de estreno y "Sin preventa" cuando no hay
  preventa.

| Mensaje | Cuándo |
| --- | --- |
| Indica la fecha de estreno para programar la preventa. | Hay inicio de preventa sin fecha de estreno. |
| La preventa debe empezar antes de la fecha de estreno. | La preventa es el mismo día o después del estreno. |

## API

`GET /api/movie-fuctions/sections/{section}`, con `section` = `cartelera`, `preventas` o
`estrenos`. Es pública, sin credenciales ni caché (`Cache-Control: no-store`). Contrato:
[`portal-sections.openapi.yaml`](portal-sections.openapi.yaml).

Cada sección es una petición aparte: si una falla, las otras cargan igual (UT-045).

## Portal

Cada sección tiene título, subtítulo, una fila horizontal con flechas y **Ver todas (n)**, que
muestra todas las películas en cuadrícula. También tiene sus propios estados:

| Sección | Vacía | Error (con botón **Reintentar**) |
| --- | --- | --- |
| Cartelera | No hay películas en cartelera por ahora. | No se pudo cargar la cartelera. |
| Preventas | No hay películas en preventa por ahora. | No se pudieron cargar las preventas. |
| Estrenos | No hay próximos estrenos por ahora. | No se pudieron cargar los estrenos. |

**Reintentar** vuelve a pedir solo esa sección. Los títulos de sección usan Bebas Neue
(`--font-display`), como el prototipo.

## Diseño del portal (SCRUM-438)

Sigue la opción A del prototipo de Figma. Los valores salen de su HTML, y los colores, de los tokens
de `variables.css`.

- **Encabezado**: logo, enlaces a las secciones (**Para ti** solo con sesión de cliente,
  **Cartelera**, **Preventas**, **Estrenos**) y la cuenta o **Iniciar sesión** / **Registrarse**. En
  el celular los enlaces bajan a una segunda fila que se desliza de lado.
- **Destacada** (`PortalHero`, reemplaza al carrusel): las primeras cinco películas de Cartelera,
  con título, clasificación, duración, géneros, sinopsis, **Comprar boletos** y **Ver cartelera**. El
  fondo y el póster de la derecha son el póster real (el prototipo usa degradados de ejemplo).
  Cambia cada 7 s, salvo que el visitante la pause, tenga el cursor o el foco encima, o prefiera
  movimiento reducido. Las miniaturas y las flechas eligen la película. Sin Cartelera muestra
  "Cartelera, preventas y estrenos".
- **Pie de página**: marca, **Contáctanos** (teléfono y correo enlazados), **Cartelera** (un enlace
  por sección) y **Sobre Cinetadel**. Cada fila mide 44 px con la misma separación; son 4 columnas,
  2 hasta 1100 px y 1 en el celular.
- **Contraste**: todos los textos tienen al menos 4.5:1 contra su fondo, con y sin sesión. El texto
  del hero se apoya en el degradado del fondo de página, así que no depende del póster.
- **Celular** (360 y 390 px): sin scroll horizontal. Las filas muestran unas dos tarjetas y el botón
  de compra queda en una línea.

## Recomendaciones para ti (SCRUM-439)

Fila que solo ve un cliente con sesión, arriba de Cartelera. Muestra las películas de **Cartelera**
y **Preventas** que tienen alguno de sus **géneros favoritos** (Mi perfil › Preferencias). Primero
van las que coinciden con más géneros y después por próxima función. Estrenos no entra porque
todavía no se puede comprar.

- Subtítulo: "Según tus géneros favoritos: Aventura, Drama". En lugar de **Ver todas**, el enlace
  **Editar preferencias** abre Mi perfil en *Preferencias*.
- Cada tarjeta dice **Te gusta <género>** (el primer género favorito que coincide, por nombre) y se
  compra igual que en su sección; una preventa conserva su insignia.
- Se vuelve a pedir cada vez que se entra al portal, así que los cambios de preferencias se ven al
  volver, sin recargar. Al cerrar sesión la fila desaparece.

| Estado | Mensaje |
| --- | --- |
| Sin géneros favoritos | Configura tus preferencias en Mi perfil para recibir recomendaciones. (botón **Configurar preferencias**) |
| Ninguna película coincide | No hay recomendaciones para ti por ahora. |
| Error (con **Reintentar**) | No se pudieron cargar tus recomendaciones. |

API: `GET /api/clients/me/preferences/recommendations` (sesión de cliente, `Cache-Control: no-store`)
devuelve `{ genres, movies }`. Sin géneros favoritos responde listas vacías sin consultar películas.
Contrato en [`client-profile.openapi.yaml`](client-profile.openapi.yaml). No necesita cambios en la
base de datos.

## Base de datos

[`20261123_movie_release_presale_dates.sql`](../database/migrations/20261123_movie_release_presale_dates.sql)
agrega las dos columnas y la restricción. Se puede repetir y no necesita permisos nuevos para
`CINETADEL_APP`. Se aplica como dueño del esquema, primero en `DEVELOPMENT` (aplicada el
23/11/2026) y después en `PRODUCTION`.

## Pruebas

| Caso | Qué verifica |
| --- | --- |
| UT-040 y UT-041 | Las tres secciones con su título, iguales con o sin sesión. |
| UT-042 y UT-043 | Una película en preventa aparece solo en Preventas, y ninguna película se repite. |
| UT-044 | Sin preventas, la sección mantiene su título y muestra su mensaje. |
| UT-045 | Si falla Preventas, muestra su aviso y **Reintentar**; las otras dos cargan normal. |
| UT-046 | Con preferencia Aventura recomienda "The Odyssey" con "Te gusta Aventura". |
| UT-047 | Sin preferencias invita a configurarlas y enlaza a Mi perfil › Preferencias. |
| UT-048 y UT-049 | Un visitante no ve la fila, y desaparece al cerrar sesión. |
| UT-050 | Si nada coincide, la fila mantiene su título y dice que no hay recomendaciones. |
| UT-051 | Al volver al portal después de cambiar las preferencias, la fila se actualiza. |
| UT-052 | El pie de página usa listas con filas iguales en sus tres columnas. |
| UT-053 | Las cuatro secciones comparten componente: mismo título, tarjetas y separación. |
| UT-054 | Revisado en 1366, 390 y 360 px: `scrollWidth <= clientWidth` en los tres. |
| UT-055 y UT-056 | Contraste de cada texto del portal, del menú de la cuenta y de las recomendaciones. |

Pruebas automáticas:

- API: `apps/api/src/movie-fuctions/portal-sections.spec.ts`, más las de fechas en
  `apps/api/src/movies/`.
- API (SCRUM-439): `portal-sections.spec.ts` y `apps/api/src/clients/profile/client-profile.http.spec.ts`.
- Web (SCRUM-439): `apps/web/src/__tests__/components/landing/PortalRecommendations.spec.ts`.
- Web (SCRUM-438): `PortalHero.spec.ts` y `PortalContrast.spec.ts` en
  `apps/web/src/__tests__/components/landing/`, más `AppHeader.spec.ts` y `AppFooter.spec.ts`.
- Web: `apps/web/src/__tests__/components/landing/PortalSections.spec.ts`,
  `apps/web/src/__tests__/App.spec.ts` y las del CRUD en `apps/web/src/__tests__/Movie/`.
