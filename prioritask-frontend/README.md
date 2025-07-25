# Prioritask Frontend

Interfaz web desarrollada con **React**, **TypeScript** y **Vite** para consumir la API de Prioritask.

## Puesta en marcha

1. Instala las dependencias y copia la configuración de ejemplo:

```bash
npm install
cp .env.example .env  # en Windows usa "copy .env.example .env"
```

2. Ejecuta el servidor de desarrollo:

```bash
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173) en el navegador para ver la aplicación.

## Backend CORS configuration

Si la API establece restricciones de CORS, define la variable de entorno `CORS_ORIGINS` como un array JSON con los dominios permitidos, tal y como se indica en el README principal.

## Comandos útiles

- `npm run build` – genera una versión lista para producción.
- `npm run preview` – lanza un servidor para revisar la build generada.
- `npm run lint` – ejecuta ESLint sobre el código.

## Estructura

El código fuente se encuentra en la carpeta `src/` y está organizado en componentes, páginas y contextos de React.