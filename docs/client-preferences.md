# Preferencias cinematográficas del cliente

Desde `/account/profile`, la sección **Preferencias** muestra los géneros e idiomas registrados actualmente y permite seleccionar varios de cada grupo. Las opciones se consultan al abrir la sección y después de guardar; no se conservan catálogos fijos en el frontend. El idioma de registro de `CLIENTS` permanece independiente.

Los géneros e idiomas se seleccionan mediante desplegables reutilizables con búsqueda y checkboxes. Al abrir se pueden consultar todas las opciones, dentro de una lista con altura limitada y desplazamiento. El resumen muestra hasta tres etiquetas y la cantidad restante; todas las selecciones siguen disponibles dentro del menú. Se cierra al pulsar fuera, salir con el teclado o usar Escape. Las etiquetas muestran mayúscula inicial, sin modificar los catálogos almacenados.

La selección puede estar vacía. Guardar reemplaza ambos grupos; quitar todas las opciones elimina todas las asociaciones de preferencias del cliente. Las compras no modifican estas preferencias explícitas: aportan afinidad únicamente al cálculo del portal. Las asociaciones persisten al cerrar sesión y al desactivar o reactivar la cuenta.

## Prioridad en el portal

> Desde SCRUM-437 el portal ya no usa este orden: sus secciones son iguales para visitantes y
> clientes, y la personalización es la fila **Recomendaciones para ti** (SCRUM-439, ver
> [portal-sections.md](portal-sections.md)). `/clients/me/preferences/portal` y
> `/movie-fuctions/catalog` se conservan sin cambios.

El catálogo reúne películas con funciones futuras activas y asientos comprables. Cada película aparece una vez, con su próxima función disponible como orden base. Se suma un punto por cada género preferido y cada idioma preferido distinto asociado a la película. Se añaden 0,2 puntos por cada compra que coincida con cada uno de sus géneros o idiomas. Los géneros y los idiomas tienen el mismo peso dentro de cada fuente. Los empates conservan el orden por próxima función y, como desempate del orden base, el identificador de película.

La puntuación se calcula sobre el catálogo completo antes de limitar el carrusel a cuatro películas. El catálogo muestra todas las películas, incluidas las que no coinciden con ninguna preferencia o compra. Sin preferencias ni compras relacionadas, o sin sesión, se mantiene el orden base. Los cambios guardados y las compras confirmadas se consideran al volver a consultar el portal; no se introduce una sección visual de recomendaciones ni se cambia el registro de idiomas o géneros de películas.

### Afinidad por compras — SCRUM-417

Se consulta el historial completo de facturas pagadas (`PAID`) de la identidad autenticada, con al menos una línea de producto `TICKET`. Cada factura aporta una vez a cada género e idioma de su película; comprar cinco asientos no aporta cinco veces. Compras separadas de la misma película sí acumulan afinidad. Cinco coincidencias de compras equivalen al punto de una preferencia explícita; no hay un límite artificial ni una ventana temporal de compras.

Se excluyen facturas canceladas, pendientes, fallidas y compras de invitados, incluso si su correo coincide con el del cliente. Los boletos vigentes pueden pertenecer a funciones activas, en curso o finalizadas. Si una función fue cancelada o quedó inactiva, la factura solo aporta cuando conserva algún boleto reprogramado a una función válida. No se multiplica la aportación por los boletos reprogramados. Las facturas históricas sin vínculos individuales de boletos se reconocen por sus líneas de entradas y por el estado de su función original, sin inventar asociaciones.

Las películas ya adquiridas en esas compras permanecen en la cartelera y conservan su puntuación por preferencias explícitas, pero no reciben bonificación del historial ni se consideran recomendadas por compras. Las afinidades proceden de los géneros e idiomas actualmente asociados a las películas adquiridas. No se infiere el idioma de un boleto concreto: el modelo actual lo registra en la película.

La rama no tiene un estado o entidad de reembolso. Este cálculo utiliza los estados existentes de facturas y funciones. Cuando se implemente la gestión de reembolsos deberá incorporarse su criterio de exclusión; no se atribuye aquí información de reembolsos que el esquema no registra.

`scoreMoviesForClient` es una función pura que devuelve la película, la puntuación por preferencias, la de compras, el total y el indicador `recommended`. Unidades enteras de puntuación evitan desempates accidentales entre una preferencia y cinco coincidencias de compras. `rankMoviesByPreferences` reutiliza ese cálculo y conserva el orden base en empates. La futura sección de recomendaciones puede reutilizar el cálculo y el indicador sin implementar otro algoritmo.

La API actual devuelve únicamente `{id, title, posterImage}` en el orden calculado: no expone facturas, compras, afinidades ni puntuaciones. Se conservan los enlaces y la presentación de películas existentes. Una película retirada o sin funciones disponibles se gestiona mediante la consulta y los mensajes del flujo de compra actual.

Los catálogos público y personalizado reutilizan `HAS_FREE_SEAT`, la misma condición de la compra. Una función necesita un asiento registrado, libre, dentro de las dimensiones actuales de su sala y sin boleto asignado para esa función. Se omiten las películas cuyas funciones estén agotadas o carezcan de asientos comprables. Si existe otra función futura disponible, la película permanece y esa función determina su orden base. Comprar continúa revalidando la disponibilidad en el servidor.

La lectura utiliza una consulta Oracle agregada con `CLIENT_ID` enlazado. Agrupa cada género e idioma por facturas distintas y reutiliza los índices existentes; no realiza consultas por película ni modifica el esquema. No hay una caché de afinidades que deba invalidarse al comprar. Si falla el historial, la solicitud personalizada falla y el frontend utiliza su recuperación existente para mostrar la cartelera pública y una notificación. No presenta una personalización parcial como si el historial se hubiera consultado correctamente.

La identidad de la sesión determina la consulta personalizada. Cerrar sesión borra los resultados anteriores y carga el catálogo público. Una consulta pública no depende de la versión de una sesión anónima: si esta cambia durante la carga, la respuesta pública vigente se conserva. Las comprobaciones de versión y token siguen protegiendo las consultas personalizadas; cualquier solicitud sustituida o desmontada se descarta. Las solicitudes se cancelan y sus respuestas se descartan si cambia la sesión o se desmonta la vista. Restaurar la misma identidad no repite una consulta idéntica. Un fallo de personalización muestra una notificación y permite consultar la cartelera general; si también falla esta consulta, se muestra un error con la opción de reintentar.

## API y validaciones

Contrato: [client-profile.openapi.yaml](client-profile.openapi.yaml). Las rutas se sirven bajo `/api`.

| Método | Ruta                                      | Respuesta                                                                                                   |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| GET    | `/clients/me/preferences`                 | `{ genres: [{id, name}], languages: [{id, name}], selected: {genreIds, languageIds}, maxSelections: 1000 }` |
| PUT    | `/clients/me/preferences`                 | Reemplaza las preferencias y devuelve `{genreIds, languageIds}`                                             |
| GET    | `/clients/me/preferences/portal`          | `[{id, title, posterImage}]` ordenados por preferencias e historial del cliente autenticado                 |
| GET    | `/movie-fuctions/catalog`                 | El mismo formato en orden público, sin datos de preferencias                                                |
| GET    | `/clients/me/preferences/recommendations` | `{ genres: string[], movies: [...] }` de "Recomendaciones para ti" (SCRUM-439)                              |

Los endpoints propios reutilizan JWT, cuenta activa, rol de cliente y vigencia de contraseña. El identificador del cliente proviene exclusivamente de la sesión. La escritura requiere además un origen autorizado. Las respuestas usan `Cache-Control: no-store`. El endpoint público no recibe identificadores de clientes ni aplica preferencias de otra cuenta.

La escritura requiere ambos arreglos, incluso vacíos. Cada uno acepta hasta 1000 identificadores únicos, enteros positivos seguros, sin convertir cadenas a números. Se rechazan propiedades desconocidas. El frontend valida los identificadores disponibles, duplicados y límites al enviar, sin interrumpir la selección. El backend verifica además la existencia actual de las opciones dentro de la transacción. Una opción retirada obliga a volver a cargar las preferencias, con un mensaje comprensible. Los fallos de escritura no se muestran como guardados exitosos.

## Persistencia y despliegue

Se agregan `CLIENT_GENRE_PREFERENCES` y `CLIENT_LANGUAGE_PREFERENCES`. Las claves primarias compuestas impiden duplicados; las claves foráneas mantienen la integridad de cliente y catálogo. Los índices secundarios permiten consultar asociaciones desde cada opción. `ON DELETE CASCADE` solo actúa ante una eliminación real; la desactivación mantiene las preferencias.

El repositorio bloquea la cuenta activa, valida y bloquea las opciones en orden, reemplaza las asociaciones con parámetros enlazados y confirma todo en una transacción. Cualquier fallo revierte ambos grupos. Las lecturas de la selección usan una sola sentencia para evitar combinar versiones parciales. No se modifican otras tablas ni preferencias de otros clientes.

Antes de tomar los bloqueos, el guardado ejecuta `ALTER SESSION DISABLE PARALLEL DML` en su conexión, siguiendo el patrón existente de compras y proyecciones. En Autonomous Database, una sesión con DML paralelo puede producir `ORA-12860` al borrar asociaciones y volver a insertarlas en la misma transacción. La configuración se establece en cada guardado, por lo que no depende de cómo se haya utilizado previamente la conexión del pool. Las escrituras son secuenciales y conservan la misma transacción: no se añaden confirmaciones intermedias ni reintentos que puedan guardar solo uno de los grupos. Las consultas paralelas no se deshabilitan.

El 18 de noviembre de 2026 pasaron las 2778 pruebas de las 126 suites de API, con 98,28 % de cobertura global de líneas y 100 % de las líneas ejecutables añadidas al repositorio de preferencias. La regresión con persistencia simulada reproduce `ORA-12860` sin la protección y comprueba guardados sucesivos al añadir y retirar idiomas y géneros, vaciar la selección y volver a configurarla. Las pruebas existentes mantienen las comprobaciones de validación, cuenta activa, commit y rollback. Pasan ESLint, Prettier, tipos y compilación.

La comprobación real utilizó `DatabaseService` con la configuración local: usuario y esquema activos `DEVELOPMENT`, columnas requeridas de 13 tablas y las dos claves primarias y cuatro claves foráneas de preferencias habilitadas. Se ejecutaron los métodos existentes de lectura de géneros, idiomas, catálogo, preferencias e historial; el catálogo devolvió siete películas y una cuenta inexistente fue rechazada. No se modificaron datos, esquema ni configuración. El guardado y su rollback se probaron con mocks, no mediante escrituras en Oracle.

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
- La función de prioridad es independiente de HTTP y persistencia y combina preferencias con afinidad por compras. El repositorio del catálogo agrega las compras; el servicio coordina las lecturas. La API no devuelve las asociaciones ni la puntuación en ninguno de los catálogos.
- `ClientPreferencesForm` solo maneja selección, validación y eventos. La vista de perfil coordina solicitudes, notificaciones y confirmación de descarte con los mecanismos existentes.
- `usePortalRecommendations` carga las recomendaciones solo con sesión de cliente, las vuelve a pedir al entrar al portal o al cambiar la sesión y las descarta al cerrarla.
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

### Verificación de recomendaciones por compras — SCRUM-417

El 14 de noviembre de 2026 pasaron las suites completas con persistencia y transporte simulados: 122 suites y 2693 pruebas de API; 122 archivos y 1799 pruebas de web. La cobertura global de líneas es 98,26 % y 95,89 %, respectivamente. La medición local respecto de `a633f98` cubre 29/29 líneas nuevas y 16/16 ramas nuevas en API, y 1/1 líneas nuevas en web. SonarQube calculará su cobertura de código nuevo con la base de comparación de la PR. Pasan ESLint, Prettier, tipos, compilación y las 35 referencias del documento OpenAPI.

Las pruebas cubren los pesos combinados, compras acumuladas, películas ya adquiridas, empates exactos, historial vacío o sin coincidencias, nuevas compras entre consultas, aislamiento entre cuentas y descarte de respuestas antiguas. La API no permite elegir otro cliente mediante parámetros ni expone afinidades o facturas; un fallo de historial devuelve un error genérico y conserva la disponibilidad del catálogo público. El frontend verifica la recuperación pública con una notificación y la sustitución de los resultados personalizados anteriores.

Se ejecutaron además las consultas extraídas del código con datos SQL simulados en memoria. La lectura de historial cubre estados de factura, invitados, funciones finalizadas o en curso, reprogramaciones, facturas históricas y cantidades de asientos. La consulta del catálogo cubre funciones agotadas, asientos no registrados, reservados o fuera del plano, sucursales y salas inactivas y disponibilidad en otra función futura. En esta comprobación de catálogo se sustituyó únicamente la expresión de hora actual de Oracle por una hora fija. No se accedió a Oracle real, SMTP ni servicios de pago, ni se modificaron el esquema, CI/CD o SonarQube.
