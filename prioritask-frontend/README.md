# Prioritask Frontend

Interfaz web desarrollada con **React 18**, **TypeScript** y **Vite** para consumir la API de Prioritask.

## ✨ Características Principales

- **Sistema de Diseño Retro 90's Mobile-First**: Estética nostálgica inspirada en interfaces clásicas con ventanas flotantes (`.retro-window`), titlebars con controles `─ □ ✕`, sombras duras retro, cyber-grid y feedback táctil en botones (`.btn-retro`).
- **Navegación Móvil Ergonómica (`MobileBottomNav`)**: Dock inferior fijo optimizado para uso con una sola mano, con botón central elevado para creación rápida de tareas.
- **Motor de Temas Claro y Oscuro (`ThemeContext`)**: Soporte completo para modo oscuro y claro con persistencia automática en `localStorage` y detección de preferencias del sistema.
- **Componentes Comunes Reutilizables (`src/components/common/`)**: Tarjetas de tareas polivalentes (`<TaskCard />`), badges de prioridad y estado (`<Badges />`), contenedores modulares (`<RetroWindow />`) y estados vacíos informativos (`<EmptyState />`).
- **Consumo Seguro de API**: Integración transparente con el backend FastAPI, autenticación vía tokens JWT con renovación automática y soporte estricto de CORS.

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

## 🛡️ Configuración de CORS con el Backend

Para conectar con la API de Prioritask, asegúrate de que el backend incluya la URL de este frontend (ej. `http://localhost:5173`) en su variable `CORS_ORIGINS`. El backend implementa una política CORS estricta que no admite wildcards `*` con credenciales activas.

## Comandos útiles

- `npm run build` – genera una versión lista para producción optimizada con Vite.
- `npm run preview` – lanza un servidor para previsualizar la build de producción.
- `npm run lint` – ejecuta ESLint sobre el código TypeScript/React.

## Estructura del Proyecto

```text
src/
├── auth/          # Módulos y vistas de autenticación (Login, Register)
├── components/    # Componentes de UI (Sidebar, TaskList, TaskForm, etc.)
│   └── common/    # Componentes atómicos reutilizables (RetroWindow, TaskCard, Badges)
├── context/       # Contextos globales de React (Auth, Room, TaskUpdate, Theme)
├── hooks/         # Custom hooks (useAsync, etc.)
├── pages/         # Páginas y vistas principales de la aplicación
├── types/         # Definiciones e interfaces de TypeScript
└── utils/         # Utilidades y funciones auxiliares (selectStyles, etc.)
```