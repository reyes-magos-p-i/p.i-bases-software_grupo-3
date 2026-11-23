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

**Reintentar** vuelve a pedir solo esa sección. El carrusel destacado muestra las películas de
Cartelera. Los títulos de sección usan Bebas Neue (`--font-display`), como el prototipo. El pie
de página enlaza a cada sección (`/#cartelera`, `/#preventas`, `/#estrenos`).

Recomendaciones para ti (SCRUM-439) y el pulido visual del portal y el pie de página (SCRUM-438)
van en sus propias historias.

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

Pruebas automáticas:

- API: `apps/api/src/movie-fuctions/portal-sections.spec.ts`, más las de fechas en
  `apps/api/src/movies/`.
- Web: `apps/web/src/__tests__/components/landing/PortalSections.spec.ts`,
  `apps/web/src/__tests__/App.spec.ts` y las del CRUD en `apps/web/src/__tests__/Movie/`.
