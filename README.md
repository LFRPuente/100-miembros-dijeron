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
