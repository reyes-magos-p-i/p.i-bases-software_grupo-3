# Preferencias cinematográficas del cliente

Desde `/account/profile`, la sección **Preferencias** muestra los géneros e idiomas registrados actualmente y permite seleccionar varios de cada grupo. Las opciones se consultan al abrir la sección y después de guardar; no se conservan catálogos fijos en el frontend. El idioma de registro de `CLIENTS` permanece independiente.

Los géneros e idiomas se seleccionan mediante desplegables reutilizables con búsqueda y checkboxes. Al abrir se pueden consultar todas las opciones, dentro de una lista con altura limitada y desplazamiento. El resumen muestra hasta tres etiquetas y la cantidad restante; todas las selecciones siguen disponibles dentro del menú. Se cierra al pulsar fuera, salir con el teclado o usar Escape. Las etiquetas muestran mayúscula inicial, sin modificar los catálogos almacenados.

La selección puede estar vacía. Guardar reemplaza ambos grupos; quitar todas las opciones elimina todas las asociaciones de preferencias del cliente. No se infieren preferencias de los datos históricos. Las asociaciones persisten al cerrar sesión y al desactivar o reactivar la cuenta.

## Prioridad en el portal

El catálogo reúne películas con funciones futuras activas. Cada película aparece una vez, con su próxima función como orden base. Se suma un punto por cada género preferido y cada idioma preferido distinto asociado a la película. Ambos tipos de coincidencia tienen el mismo peso. Los empates conservan el orden por próxima función y, como desempate del orden base, el identificador de película.

La puntuación se calcula sobre el catálogo completo antes de limitar el carrusel a cuatro películas. El catálogo muestra todas las películas, incluidas las que no coinciden con ninguna preferencia. Sin preferencias o sin sesión se mantiene el orden base. Los cambios guardados se consideran al volver a consultar el portal; no se introduce una sección de recomendaciones ni se cambia el registro de idiomas o géneros de películas.

La identidad de la sesión determina la consulta personalizada. Cerrar sesión borra los resultados anteriores y carga el catálogo público. Una consulta pública no depende de la versión de una sesión anónima: si esta cambia durante la carga, la respuesta pública vigente se conserva. Las comprobaciones de versión y token siguen protegiendo las consultas personalizadas; cualquier solicitud sustituida o desmontada se descarta. Las solicitudes se cancelan y sus respuestas se descartan si cambia la sesión o se desmonta la vista. Restaurar la misma identidad no repite una consulta idéntica. Un fallo de personalización muestra una notificación y permite consultar la cartelera general; si también falla esta consulta, se muestra un error con la opción de reintentar.

## API y validaciones

Contrato: [client-profile.openapi.yaml](client-profile.openapi.yaml). Las rutas se sirven bajo `/api`.

| Método | Ruta                             | Respuesta                                                                                                   |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| GET    | `/clients/me/preferences`        | `{ genres: [{id, name}], languages: [{id, name}], selected: {genreIds, languageIds}, maxSelections: 1000 }` |
| PUT    | `/clients/me/preferences`        | Reemplaza las preferencias y devuelve `{genreIds, languageIds}`                                             |
| GET    | `/clients/me/preferences/portal` | `[{id, title, posterImage}]` ordenados para el cliente autenticado                                          |
| GET    | `/movie-fuctions/catalog`        | El mismo formato en orden público, sin datos de preferencias                                                |

Los endpoints propios reutilizan JWT, cuenta activa, rol de cliente y vigencia de contraseña. El identificador del cliente proviene exclusivamente de la sesión. La escritura requiere además un origen autorizado. Las respuestas usan `Cache-Control: no-store`. El endpoint público no recibe identificadores de clientes ni aplica preferencias de otra cuenta.

La escritura requiere ambos arreglos, incluso vacíos. Cada uno acepta hasta 1000 identificadores únicos, enteros positivos seguros, sin convertir cadenas a números. Se rechazan propiedades desconocidas. El frontend valida los identificadores disponibles, duplicados y límites al enviar, sin interrumpir la selección. El backend verifica además la existencia actual de las opciones dentro de la transacción. Una opción retirada obliga a volver a cargar las preferencias, con un mensaje comprensible. Los fallos de escritura no se muestran como guardados exitosos.

## Persistencia y despliegue

Se agregan `CLIENT_GENRE_PREFERENCES` y `CLIENT_LANGUAGE_PREFERENCES`. Las claves primarias compuestas impiden duplicados; las claves foráneas mantienen la integridad de cliente y catálogo. Los índices secundarios permiten consultar asociaciones desde cada opción. `ON DELETE CASCADE` solo actúa ante una eliminación real; la desactivación mantiene las preferencias.

El repositorio bloquea la cuenta activa, valida y bloquea las opciones en orden, reemplaza las asociaciones con parámetros enlazados y confirma todo en una transacción. Cualquier fallo revierte ambos grupos. Las lecturas de la selección usan una sola sentencia para evitar combinar versiones parciales. No se modifican otras tablas ni preferencias de otros clientes.

DDL aplicado y verificado en la base configurada el 25 de octubre de 2026. Se comprobaron columnas, claves, referencias e índices mediante el diccionario Oracle. El archivo temporal de ejecución fue eliminado; no se incorpora ningún archivo `.sql` nuevo al repositorio. Para otros entornos, aplicar el siguiente DDL con el propietario correspondiente antes de desplegar la API:

```sql
CREATE TABLE CLIENT_GENRE_PREFERENCES (
  CLIENT_ID NUMBER NOT NULL,
  GENRE_ID NUMBER NOT NULL,
  CONSTRAINT PK_CLIENT_GENRE_PREFS PRIMARY KEY (CLIENT_ID, GENRE_ID),
  CONSTRAINT FK_CL_GENRE_PREF_CLIENT FOREIGN KEY (CLIENT_ID) REFERENCES CLIENTS (CLIENT_ID) ON DELETE CASCADE,
  CONSTRAINT FK_CL_GENRE_PREF_GENRE FOREIGN KEY (GENRE_ID) REFERENCES GENRES (GENRE_ID) ON DELETE CASCADE
);
CREATE INDEX IX_CL_GENRE_PREF_GENRE ON CLIENT_GENRE_PREFERENCES (GENRE_ID);

CREATE TABLE CLIENT_LANGUAGE_PREFERENCES (
  CLIENT_ID NUMBER NOT NULL,
  LANGUAGE_ID NUMBER NOT NULL,
  CONSTRAINT PK_CLIENT_LANGUAGE_PREFS PRIMARY KEY (CLIENT_ID, LANGUAGE_ID),
  CONSTRAINT FK_CL_LANG_PREF_CLIENT FOREIGN KEY (CLIENT_ID) REFERENCES CLIENTS (CLIENT_ID) ON DELETE CASCADE,
  CONSTRAINT FK_CL_LANG_PREF_LANGUAGE FOREIGN KEY (LANGUAGE_ID) REFERENCES LANGUAGES (LANGUAGE_ID) ON DELETE CASCADE
);
CREATE INDEX IX_CL_LANG_PREF_LANGUAGE ON CLIENT_LANGUAGE_PREFERENCES (LANGUAGE_ID);
```

## Separación de responsabilidades

- El controlador deriva la identidad de la sesión y aplica las guardas existentes. El servicio reutiliza los catálogos de películas y el servicio del portal. El repositorio concentra las consultas y la transacción Oracle.
- La función de prioridad es independiente de HTTP y persistencia. La API no devuelve las asociaciones ni la puntuación al catálogo público.
- `ClientPreferencesForm` solo maneja selección, validación y eventos. La vista de perfil coordina solicitudes, notificaciones y confirmación de descarte con los mecanismos existentes.
- `usePortalMovies` comparte una carga entre carrusel y catálogo, gestiona cambios de sesión y errores. Ambos componentes reciben datos y no realizan solicitudes.
- Se reutilizan `NotificationPopup`, `LoadingState`, el transporte autenticado y las variables de la paleta actual. No se agregan dependencias ni se cambia CI/CD o la configuración de SonarQube.

## Verificación

Las pruebas usan Oracle, catálogos y transporte HTTP simulados; las pruebas HTTP ejecutan Nest y las guardas JWT reales. Cubren selección múltiple y vacía, persistencia entre sesiones, opciones vigentes, entradas inválidas, aislamiento de cuenta, permisos, transacciones y rollback, prioridad antes del límite, empates, catálogo completo, fallos y respuestas tardías.

Desde `apps/api`: `npm run test:cov -- --runInBand`, `npm run lint`, `npm run build` y `npm run type-check`.

Desde `apps/web`: `npm run test:cov -- --maxWorkers=2`, `npm run lint` y `npm run build`.

Resultados de la implementación inicial, antes del ajuste de desplegables y carga pública (25 de octubre de 2026):

| Comprobación                        | API                               | Web                                 |
| ----------------------------------- | --------------------------------- | ----------------------------------- |
| Suite completa con mocks            | 90 suites, 2045 pruebas correctas | 73 archivos, 1116 pruebas correctas |
| Cobertura global de líneas          | 97,57 %                           | 95,52 %                             |
| Cobertura global de ramas           | 89,26 %                           | 90,71 %                             |
| Líneas nuevas cubiertas             | 120/120 (100 %)                   | 150/150 (100 %)                     |
| Ramas nuevas cubiertas              | 58/71 (81,69 %)                   | 102/110 (92,73 %)                   |
| Cobertura combinada de código nuevo | 93,19 %                           | 96,92 %                             |

La medición local de código nuevo cruza LCOV con las líneas añadidas respecto de `HEAD` e incluye todos los archivos fuente nuevos, excluyendo las pruebas. SonarQube calculará las métricas con la base de comparación de la PR. Compilación, comprobación de tipos, ESLint y Prettier completados correctamente.

Además de los mocks, se ejecutaron las consultas compiladas del catálogo, opciones y lectura de preferencias contra Oracle, sin modificar datos de cuentas. Se comprobó que la consulta rechaza una cuenta inexistente. Esta comprobación no sustituye la prueba manual del flujo desplegado.

La comprobación manual del entorno desplegado debe incluir guardar una selección, cerrar e iniciar sesión, comprobar sus opciones seleccionadas, observar el nuevo orden del portal y retirar todas las preferencias. También debe comprobar que una opción añadida o renombrada en los catálogos se refleja al volver a abrir la sección.

### Ajuste de selección compacta y acceso de invitados

- Suite web completa: 73 archivos y 1130 pruebas correctas, incluidos los consumidores existentes del desplegable en el CRUD de películas.
- Pruebas HTTP de perfil y preferencias con persistencia simulada: 37 casos correctos. Se comprueba explícitamente que un invitado obtiene el mismo catálogo completo y ordenado que un cliente sin preferencias, sin consultar la identidad ni las preferencias del invitado.
- Cobertura global web: 95,67 % de líneas y 90,80 % de ramas.
- Código nuevo web respecto de `HEAD`: 192/192 líneas cubiertas (100 %), 149/163 ramas cubiertas (91,41 %) y cobertura combinada de 96,06 %.
- Compilación y tipos web, tipos API, ESLint de ambas aplicaciones y formato Prettier correctos.

La regresión de carga pública reproduce con mocks un cambio de versión de sesión mientras se espera la respuesta: antes se descartaba y quedaba una lista vacía; ahora se conserva si sigue siendo la solicitud vigente. También cubre fallos de red y el rechazo de respuestas públicas antiguas después de cargar una cartelera personalizada. Este caso demostrado no permite atribuir por sí solo todos los resultados vacíos del entorno real: una respuesta `[]` de la API sigue representando ausencia de funciones futuras activas.
