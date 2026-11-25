# Sucursales de una película

Una película solo se puede programar en una sala, y solo aparece en el portal, si está
**disponible en la sucursal** (`CINEMA_MOVIES.IS_AVAILABLE = 1`). Antes, la única forma de
dejarla disponible era un `INSERT` manual. Ahora se elige desde la gestión de películas.

## Interfaz

En **Crear película** y **Modificar película** está la sección **Sucursales**:

- un buscador con selección múltiple que muestra las sucursales activas sin necesidad de escribir;
- un botón **Seleccionar todas**;
- el campo es opcional. Sin sucursales, la película queda guardada, pero no se pueden programar
  funciones con ella y no sale en Cartelera, Preventas ni Estrenos.

El detalle de la película muestra las sucursales donde está disponible, o "Ninguna".

## API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/movies/branches` | Sucursales activas, como `{ id, name }[]` y ordenadas por nombre |
| `POST` | `/api/movies` | Acepta `branchIds?: number[]` |
| `PATCH` | `/api/movies/:id` | Acepta `branchIds?: number[]`. Si no se envía, la disponibilidad no cambia |
| `GET` | `/api/movies/:id` | Agrega `branches: { id, name }[]`, solo las sucursales activas y disponibles |

Todas las rutas son exclusivas del administrador.

### Reglas

- `branchIds` es un arreglo de enteros positivos, sin repetidos. Si trae una sucursal inexistente o
  inactiva, la respuesta es `400` con "Selecciona únicamente sucursales activas.".
- Al modificar, la disponibilidad se trata como una marca y no se borran filas:
  - las sucursales activas que no vengan en la lista pasan a `IS_AVAILABLE = 0`;
  - las de la lista pasan a `1`, o se insertan si no tenían fila (`MERGE`);
  - las sucursales inactivas conservan su valor.
- Al eliminar una película, también se borran sus filas de `CINEMA_MOVIES`. Sin eso, la llave
  foránea impedía eliminarla.
- Quitar una sucursal no cancela las funciones ya programadas allí. Esas funciones dejan de
  venderse, porque la compra y el portal exigen que la película esté disponible.
