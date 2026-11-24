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
- la película ya estrenó o su preventa ya empezó (`RELEASE_DATE` vacía o ≤ hoy, o
  `PRESALE_START` ≤ hoy);
- al menos un asiento libre.

La compra aplica la misma regla, compartida en `MOVIE_ON_SALE`
(`purchase-catalog.repository.ts`): al listar las funciones, al cotizar y otra vez al confirmar
dentro de la transacción, con o sin sesión. Una película de Estrenos no se puede comprar ni
entrando directo a `/buy-tickets?movieId=<id>`: no muestra funciones y una confirmación responde
`FUNCTION_UNAVAILABLE`.

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

**Reintentar** vuelve a pedir solo esa sección. El carrusel destacado muestra las películas de
Cartelera. Los títulos de sección usan Bebas Neue (`--font-display`), como el prototipo. El pie
de página enlaza a cada sección (`/#cartelera`, `/#preventas`, `/#estrenos`).

El pulido visual del portal y el pie de página (SCRUM-438) va en su propia historia.

## Recomendaciones para ti (SCRUM-439)

Fila que solo ve un cliente con sesión, arriba de Cartelera. Ordena las películas de **Cartelera**
y **Preventas** con el sistema de recomendación de SCRUM-417 ([client-preferences.md](client-preferences.md)):
`scoreMoviesForClient` suma sus **géneros e idiomas favoritos** (Mi perfil › Preferencias) y su
**historial de compras**. Solo entran las películas con puntuación; a igual puntuación, por próxima
función. Estrenos no entra porque todavía no se puede comprar.

- Un cliente con solo idiomas favoritos, o solo compras, también recibe recomendaciones, y una
  compra nueva cambia el orden al volver al portal.
- Subtítulo: "Según tus preferencias (Aventura, Español) y tus compras". En lugar de **Ver todas**,
  el enlace **Editar preferencias** abre Mi perfil en *Preferencias*.
- Si la película coincide con un género favorito, la tarjeta dice **Te gusta <género>** (el primero
  que coincide, por nombre). Las recomendadas por idioma o por compras no llevan etiqueta. Se
  compra igual que en su sección; una preventa conserva su insignia.
- Se vuelve a pedir cada vez que se entra al portal, así que los cambios de preferencias y las
  compras nuevas se ven al volver, sin recargar. Al cerrar sesión la fila desaparece.

| Estado | Mensaje |
| --- | --- |
| Sin géneros ni idiomas favoritos, y nada por compras | Configura tus preferencias en Mi perfil para recibir recomendaciones. (botón **Configurar preferencias**) |
| Ninguna película coincide | No hay recomendaciones para ti por ahora. |
| Error (con **Reintentar**) | No se pudieron cargar tus recomendaciones. |

API: `GET /api/clients/me/preferences/recommendations` (sesión de cliente, `Cache-Control: no-store`)
devuelve `{ genres, languages, movies }`. Contrato en
[`client-profile.openapi.yaml`](client-profile.openapi.yaml). No necesita cambios en la base de datos.

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

Pruebas automáticas:

- API: `apps/api/src/movie-fuctions/portal-sections.spec.ts`, más las de fechas en
  `apps/api/src/movies/`.
- API (SCRUM-439): `portal-sections.spec.ts` y `apps/api/src/clients/profile/client-profile.http.spec.ts`.
- Web (SCRUM-439): `apps/web/src/__tests__/components/landing/PortalRecommendations.spec.ts`.
- Web: `apps/web/src/__tests__/components/landing/PortalSections.spec.ts`,
  `apps/web/src/__tests__/App.spec.ts` y las del CRUD en `apps/web/src/__tests__/Movie/`.
