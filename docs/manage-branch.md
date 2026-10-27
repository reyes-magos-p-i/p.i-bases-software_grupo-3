# Administrar sucursales (SCRUM-32)

Desde la sección Sucursales del dashboard, el administrador crea sucursales. El
listado y el detalle están en [view-branch.md](view-branch.md). El contrato está en
[`manage-branch.openapi.yaml`](manage-branch.openapi.yaml).

Las rutas son solo para administradores, pasan por el bloqueo de contraseña vencida
y, por ser escrituras con la cookie de sesión, exigen el `Origin` del frontend.

## Formulario

Crear usa un diálogo con dos campos obligatorios. La validación ocurre al pulsar
«Guardar». Si hay errores, cada alerta aparece debajo de su campo, todas a la vez
(UT-013), y no se envía nada. Una alerta se borra al cambiar su campo. La API aplica
las mismas reglas y textos.

| Campo | Regla | Alerta |
|---|---|---|
| Nombre | Obligatorio; un texto de solo espacios cuenta como vacío | El nombre es obligatorio |
| Nombre | Solo letras (con tildes y ñ) y espacios | El nombre solo puede contener letras y espacios |
| Nombre | De 1 a 50 caracteres | El nombre debe tener entre 1 y 50 caracteres |
| Nombre | Ninguna otra sucursal activa lo usa (lo revisa la API al guardar) | Ya existe una sucursal activa con ese nombre |
| Compañía | Obligatoria | Debe seleccionar una compañía |

- El nombre se guarda sin los espacios de los extremos. Las tildes escritas como
  marca aparte se unen a su letra (NFC), así «ó» cuenta como un carácter.
- Dos sucursales activas no pueden tener el mismo nombre. La comparación no distingue
  mayúsculas ni tildes: «Sucursal Heredia Oeste», «SUCURSAL HEREDIA OESTE» y
  «Sucursal Herédia Oeste» son el mismo nombre. Las sucursales desactivadas no
  cuentan, así que su nombre se puede volver a usar.
- La lista de compañías sale de `GET /api/cinemas/companies`. Una compañía sin nombre
  no se ofrece, porque no se podría distinguir.
- Mientras se guarda, el formulario y la navegación del dashboard quedan bloqueados.

## Crear (SCRUM-32)

El botón «Crear sucursal» abre el diálogo vacío. `POST /api/cinemas` crea la
sucursal activa y responde `201` con su detalle.

- Éxito: el diálogo se cierra, el listado se recarga y aparece el toast «Sucursal
  creada con éxito».
- Error de red o del servidor: «No se pudo crear la sucursal, intenta de nuevo». El
  diálogo sigue abierto con los datos escritos y no se guarda nada (UT-014).
- La compañía se valida dentro de la misma transacción del `INSERT`. Si no existe o
  no tiene nombre, responde `400` «Debe seleccionar una compañía».
- En la misma transacción se revisa el nombre. Si otra sucursal activa ya lo usa,
  responde `409` «Ya existe una sucursal activa con ese nombre», que aparece debajo
  del campo Nombre con los datos escritos. El índice único de
  [`20261027_cinemas_active_name.sql`](../database/migrations/20261027_cinemas_active_name.sql)
  da la misma respuesta si dos administradores guardan el mismo nombre a la vez.
- `403`: «No tiene permisos para acceder a esta sección» y se vuelve a comprobar la
  sesión. `401`: vuelve al inicio de sesión.

## Datos de prueba

El plan espera exactamente tres compañías (Cinetadel S.A, Cinetadel del Pacifico y
Cinetadel del Caribe). La base actual también tiene «Cinetadel» (ID 1), que aparece
en la lista, y una compañía sin nombre, que no aparece.

## Verificación

En `apps/api`: `npm test -- src/cinemas`, `npm run lint`, `npm run type-check`.
En `apps/web`: `npx vitest run src/__tests__/components/branches src/__tests__/utils/branch-validation.spec.ts`,
`npm run lint`, `npm run type-check`.
