# 100 Miembros Dijeron

Juego web estático con tablero, panel de control y banco compartido de preguntas.

## Abrir el juego

- `index.html`: tablero para proyectar.
- `control.html`: control de la ronda activa.
- `questions.html`: crear, editar y archivar preguntas compartidas.

## Conectar Supabase Free

1. Crea un proyecto gratuito en Supabase.
2. Abre **SQL Editor** y ejecuta completo [`supabase/schema.sql`](./supabase/schema.sql).
3. En **Project Settings > API Keys**, copia la URL del proyecto y la clave **Publishable**.
4. Coloca ambos valores en [`supabase-config.js`](./supabase-config.js):

   ```js
   global.SUPABASE_CONFIG = Object.freeze({
     url: "https://TU-PROYECTO.supabase.co",
     publishableKey: "sb_publishable_..."
   });
   ```

5. Publica los cambios en GitHub Pages.

No coloques una clave `secret` ni `service_role` en este repositorio. La clave
publicable está diseñada para código de navegador y el acceso se limita con RLS.

## Persistencia

- Las preguntas activas se guardan en `public.questions`.
- Cada creación, edición, archivado o restauración genera una copia inmutable en
  `public.question_versions`.
- El rol público no tiene permiso de `DELETE`; archivar nunca borra el historial.
El acceso es público por requisito: cualquier persona con el enlace puede crear,
editar o archivar preguntas.

## Cuando Supabase no responde

Cada descarga correcta conserva una copia de las preguntas en el navegador.
Si falla la conexión, el juego permite usar esa copia e indica que puede estar
desactualizada. Crear, editar y archivar siguen requiriendo conexión al banco
compartido; no se anuncian cambios locales como si estuvieran guardados en línea.
Usa **Actualizar** en el banco o **Actualizar banco** en el control para reintentar
después de restaurar el proyecto en Supabase. Un navegador que nunca descargó
el banco solo dispone de las preguntas incluidas.

Las preguntas originales siguen disponibles en **Preguntas anteriores** y las
actualizaciones conservan la ronda guardada, sus puntos y sus respuestas abiertas.
