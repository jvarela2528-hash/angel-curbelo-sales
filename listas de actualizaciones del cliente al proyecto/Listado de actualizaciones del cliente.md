##### Listado de actualizaciones del cliente Angel Curbelo Sales en su CRM



1. Crear una pagina de reclutamiento para las companies que el representa con un cuestionario para ello.

2. Tener mas de un usuario en su CRM con log para saber que accion realizo cada usuario con timesptamp para tener mayor control.

3. Cambiar los siguientes etiquetas de compañias

   1. Solar
      1. Cambiar para sistema
         1.Solar de PLacas y baterias

   2. Zendure
      1. Cambiar por Sistemas de BAckup para Casas y Apartamentos

   3. H\&H DIstributor
      1. Cambiar por Sistema de Filtracion de Aguas y Bienestar

4. Cuestionario Solar
   1. Añadir una pagina de segregacion al hacer click en solar y si es dueño
      1. Placas Solas
      2. Sistema con Baterias
      3. Sistema solo Backup ( Segregar a Backup para Casas y Apartamentos)
      4. Sistema Off Grip (Desconeccion total de luma)
      5. Sistema Medicion Neta (Credito en Factura)

5. Añadir en area Creativa del CRM
   1. Poder Crear Publicidad en Facebook o Instagram o Tiktock con el boton mas informacion
      1. Que se le pueda crear una especie de landing page para recluatmiento y una para ventas o promociones de venta especial.





Estructura de creacion de estas actualizaciones:



Archivo 1- Subagente \_auditoria\_Multiusuario



\# Instrucciones para Antigravity - Subagente 1: Auth, Multi-usuario y Logs de Auditoría



Actúa como un Ingeniero de Cloud Security y Backend especializado en Firebase Modular SDK v9. Vamos a expandir la arquitectura del CRM para soportar múltiples vendedores y dejar un rastro de auditoría de cada acción crítica en el sistema.



\## Cambios y Estructura Requerida



\### 1. Inicialización de la Colección `users` en Firestore

\- Crea una estructura para almacenar los perfiles de los usuarios o vendedores autorizados a entrar al sistema.

\- Cada documento dentro de la colección `users` debe contener:

&#x20; - `uid` (String): ID único de autenticación de Firebase.

&#x20; - `email` (String): Correo electrónico del usuario.

&#x20; - `name` (String): Nombre completo del vendedor.

&#x20; - `role` (String): Restringido a valores `'admin'` o `'vendedor'`.



\### 2. Creación de la Colección de Auditoría `logs`

\- Implementa una función helper asíncrona o Cloud Function para registrar cada acción crítica que se realice en el CRM (ej. inicios de sesión, cambios manuales de estatus de un lead, eliminación de registros).

\- Cada documento de log debe tener la siguiente estructura exacta:

&#x20; ```json

&#x20; {

&#x20;   "userId": "UID\_DEL\_USUARIO",

&#x20;   "userName": "Nombre del Usuario",

&#x20;   "action": "Descripción textual de la acción realizada",

&#x20;   "timestamp": "serverTimestamp()"

&#x20; }



3\. Modificaciones en el Panel Administrativo (src/admin.js)

Modifica la inicialización del script para que reconozca qué usuario de Firebase Auth está logueado de forma legítima y despliegue su nombre en la esquina superior de la interfaz.



Intercepta el evento de cambio en el selector de estados de los leads (status-select). Al ejecutarse un cambio, además de actualizar el documento del lead, debe disparar la función para guardar el log correspondiente en la colección logs.



4\. Actualización de Reglas de Seguridad (firestore.rules)

Modifica el archivo de reglas de producción para asegurar el grado empresarial:



Solo los usuarios autenticados cuyo UID exista en la colección users con el rol correspondiente pueden realizar lecturas en leads y escrituras en logs.



El acceso de lectura a la colección logs queda estrictamente reservado para usuarios con role === 'admin'.



5.Verificación de Integridad

Al finalizar las modificaciones, ejecuta un chequeo del build general y de funciones para certificar que no existan errores de sintaxis o fallas en el tipado de datos con el SDK modular v9.



\### 📂 Archivo 2: `02\_subagente\_ui\_rebranding\_flujos.md`

```markdown

\# Instrucciones para Antigravity - Subagente 2: UI, Rebranding y Segregación Solar



Actúa como un Desarrollador Frontend experto en UI/UX y Tailwind CSS. Vamos a actualizar la identidad visual de las marcas dentro del CRM, añadir el sistema de reclutamiento y crear el nuevo flujo intermedio de segmentación solar profunda.



\## Cambios y Estructura Requerida



\### 1. Rebranding Global de Etiquetas Comerciales

\- Ejecuta una búsqueda y reemplazo inteligente en todo el proyecto (especialmente en `admin.html`, `src/admin.js` y formularios de captación) para actualizar los nombres de las compañías por sus nuevas etiquetas comerciales:

&#x20; - Cambiar `Solar` por: \*\*Solar de Placas y Baterías\*\*

&#x20; - Cambiar `Zendure` por: \*\*Sistemas de Backup para Casas y Apartamentos\*\*

&#x20; - Cambiar `H\&H Distributor` por: \*\*Sistema de Filtración de Aguas y Bienestar\*\*



\### 2. Nueva Pantalla Intermedia de Segregación Solar

\- Modifica el flujo lógico dentro de `cuestionario.html` e `index.html`. 

\- Cuando un prospecto seleccione la opción "Solar" y marque "Sí es dueño de propiedad", el sistema no debe saltar directo a las preguntas de consumo. Debe desplegar una \*\*nueva pantalla o sección de segregación intermedia\*\* con 5 botones estilizados con Tailwind CSS:

&#x20; 1. \*\*Placas Solas\*\*

&#x20; 2. \*\*Sistema con Baterías\*\*

&#x20; 3. \*\*Sistema solo Backup\*\*: Al hacer clic en esta opción específica, el código debe redirigir al usuario automáticamente al flujo de captación de \*Sistemas de Backup para Casas y Apartamentos\* (antiguo Zendure) para reutilizar la lógica existente.

&#x20; 4. \*\*Sistema Off Grid (Desconexión total de Luma)\*\*

&#x20; 5. \*\*Sistema Medición Neta (Crédito en Factura)\*\*

\- Modifica el objeto de guardado para capturar esta selección en un nuevo campo de Firestore llamado `subCategory` dentro del documento del lead.



\### 3. Página y Cuestionario de Reclutamiento

\- Crea un archivo HTML independiente llamado `reclutamiento.html` utilizando la misma línea de diseño de modo oscuro del proyecto principal.

\- Añade un formulario optimizado para registrar compañías o vendedores independientes que el cliente representa. El formulario debe capturar:

&#x20; - Nombre completo o de la empresa.

&#x20; - Años de experiencia en el sector.

&#x20; - Teléfono de contacto.

&#x20; - Correo electrónico.

&#x20; - Breve cuestionario de cualificación de venta.

\- Al presionar enviar, los datos deben guardarse de forma segura en una nueva colección independiente en Firestore llamada `reclutamiento` con el campo `status: "nuevo"` por defecto.



\## Verificación de Integridad

\- Ejecuta la prueba de compilación local del frontend mediante:

&#x20; ```bash

&#x20; npm run build



1.Certifica que todas las redirecciones relativas funcionen sin romper el router o la estructura del árbol de archivos en /dist.



\### 📂 Archivo 3: `03\_subagente\_creativo\_ia\_landings.md`

```markdown



\# Instrucciones para Antigravity - Subagente 3: Generador Creativo con IA y Landings para Ads



Actúa como un Ingeniero de Inteligencia Artificial y Fullstack experto en Cloud Environments. Vamos a desarrollar el módulo automatizado de marketing digital dentro de la sección creativa del CRM para generar copys publicitarios y desplegar landing pages modulares.



\## Cambios y Estructura Requerida



\### 1. Interfaz del Generador de Anuncios con IA

\- Dentro del panel de administración (`admin.html`), añade una nueva pestaña o sección destacada llamada "Generador de Anuncios".

\- La interfaz debe permitir al administrador seleccionar tres parámetros mediante menús desplegables:

&#x20; - \*\*Plataforma destino\*\*: Facebook, Instagram, TikTok.

&#x20; - \*\*Producto/Servicio\*\*: Solar de Placas y Baterías, Sistema de Filtración, Sistemas de Backup, Reclutamiento.

&#x20; - \*\*Enfoque del anuncio\*\*: Oferta especial, Concientización, Reclutamiento directo.



\### 2. Backend: Integración con la API de Gemini mediante Cloud Functions

\- Crea una nueva Cloud Function de 2da generación en Node.js 22 llamada `generateMarketingCopy` (o expande la existente `generateAIAsset`).

\- La función debe recibir los parámetros de la interfaz, conectarse de forma segura usando la API Key de Google AI Studio al modelo Gemini, e inyectar un prompt de ingeniería que devuelva:

&#x20; - 3 variaciones de Copy publicitario de alta conversión.

&#x20; - Estructura optimizada con ganchos (hooks) iniciales, llamadas a la acción (CTA) claras y emojis contextualmente correctos.

\- La respuesta debe retornar en un formato JSON limpio para ser renderizado en cajas de texto con un botón de "Copiar al portapapeles" en la UI.



\### 3. Estructura de Landing Pages Modulares Dinámicas

\- Crea una nueva colección en Firestore llamada `landings\_config` para almacenar las ofertas o promociones que el administrador configure desde el panel. Cada documento guardará de forma simple: `titulo`, `subtitulo`, `oferta\_especial`, `color\_enfoque`, y `formulario\_destino`.

\- Desarrollar una plantilla maestra HTML llamada `promo.html`. Esta página debe estar diseñada para recibir un parámetro ID en la URL (ej. `promo.html?id=OFERTA\_VERANO`).

\- Al cargar, `promo.html` leerá la configuración correspondiente de Firestore y renderizará dinámicamente los textos y el botón de "Más Información", el cual abrirá el modal o redirigirá al cuestionario de captación específico asignado en la base de datos.



\## Verificación de Integridad

\- Realiza una prueba de compilación completa en el backend de funciones para asegurar que las dependencias del SDK oficial de Google Gen AI no generen conflictos en el entorno de Node 22:

&#x20; ```bash

&#x20; cd functions \&\& npm run build









