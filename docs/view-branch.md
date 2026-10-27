# Ver sucursales (SCRUM-35)

La sección Sucursales del dashboard lista las sucursales activas y abre el detalle
de una de ellas en un diálogo de solo lectura. Una sucursal es una fila de la tabla
`CINEMAS`; su compañía está en `COMPANIES`. Las pantallas siguen el Figma
CINETADEL2.0: P-500 (listado), P-500.1 (sin resultados), P-500.2 (error), P-502
(detalle) y P-502.1 (datos incompletos).

## Permisos y API

Solo los administradores ven la opción en el menú y pueden usar estas rutas. Un
empleado regular no ve la opción, y si llama a la API recibe `403` sin datos. Las
rutas también pasan por el bloqueo de contraseña vencida.

- `GET /api/cinemas/list`: listado paginado de sucursales activas.
- `GET /api/cinemas/companies`: compañías para el filtro (y para el formulario de
  SCRUM-32).
- `GET /api/cinemas/:id`: detalle de una sucursal, con su estado.
- `GET /api/cinemas`: sin cambios. Sigue devolviendo todas las sucursales como un
  arreglo simple, porque Salas lo usa en sus formularios.

El contrato está en [`view-branch.openapi.yaml`](view-branch.openapi.yaml).
Requiere la migración `20261016_cinemas_status.sql` (columna `CINEMAS.STATUS`).

## Listado

- Columnas: Nombre, ID Sucursal, Compañía y Acciones. El ID visible es `SU-` más
  el número con al menos tres dígitos (`SU-001`).
- Solo aparecen sucursales con `STATUS = 'ACTIVE'`, ordenadas por ID.
- Búsqueda «Nombre o ID de sucursal»: busca el texto dentro del nombre, sin
  distinguir mayúsculas ni tildes («ramon» encuentra «San Ramón»). Si el texto
  tiene forma de ID (`SU-001`, `su1`, `001` o `1`), también busca esa sucursal por
  ID. Un texto de solo espacios, con caracteres de control o de más de 100
  caracteres se rechaza antes de consultar.
- Filtro Compañía: «Todas» o una compañía.
- Paginación: «Mostrar» 10, 20 o 50 por página, con Anterior y Siguiente. Una
  página mayor que la última se ajusta a la última.
- El contador muestra «N sucursales» (o «1 sucursal»).
- Sin coincidencias: «No se encontraron sucursales». Sin sucursales registradas:
  «No hay sucursales registradas».
- Error al consultar: «No se pudieron cargar las sucursales» con Reintentar.
  Sin permiso: «No tiene permisos para acceder a esta sección».
- «Crear sucursal» abre el formulario de SCRUM-32 ([manage-branch.md](manage-branch.md)).
  Modificar y Desactivar se muestran deshabilitados con el aviso «Pendiente» hasta
  SCRUM-33 y SCRUM-34.

## Detalle

El ícono Ver abre «Detalle de sucursal» con ID Sucursal, Estado, Nombre y
Compañía, todos de solo lectura. Los nombres se muestran completos, sin recortar.
El botón Modificar se muestra deshabilitado hasta SCRUM-33.

En la base de datos el nombre de la sucursal y el de su compañía son obligatorios
(`NOT NULL`). Por eso un dato «vacío» es un texto de solo espacios. La API aplica
`TRIM` y devuelve `null` en ese caso (Oracle guarda el texto vacío como `NULL`), y
la interfaz muestra:

| Caso | Alerta |
|---|---|
| Nombre vacío (UT-021, UT-023) | Esta sucursal no tiene nombre registrado |
| Compañía vacía (UT-022, UT-023) | Esta sucursal no tiene compañía asignada |

Con cualquiera de las dos, también aparece «Hay datos incompletos en esta sucursal.
Modifícala para completarlos.». En el listado, esos valores se muestran como «Sin
nombre registrado» y «Sin compañía asignada».

Errores del detalle: `404` muestra «La sucursal seleccionada no existe.», un error
del servidor muestra «No se pudo cargar la sucursal, intenta de nuevo» con
Reintentar, `403` muestra el mensaje de permisos y `401` vuelve al inicio de sesión.

## Datos de prueba

[`database/seeds/20261019_branches_test_data.sql`](../database/seeds/20261019_branches_test_data.sql)
crea las compañías Cinetadel S.A, Cinetadel del Pacifico y Cinetadel del Caribe, una
compañía sin nombre y las sucursales de UT-016 a UT-023. Se puede ejecutar más de una
vez: solo inserta lo que falta. Es solo para ambientes de prueba.

## Verificación

En `apps/api`: `npm test -- src/cinemas`, `npm run lint`, `npm run typecheck`.
En `apps/web`: `npx vitest run src/__tests__/components/branches`, `npm run lint`,
`npm run type-check`. Las pruebas HTTP usan los guards reales con la base simulada.
