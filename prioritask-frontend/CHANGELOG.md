# 📋 CHANGELOG & QA AUDIT RELEASE NOTES — Prioritask Frontend

## 🚀 Versión 1.2.0 (Modernización UI/UX Retro 90's, Modo Oscuro/Claro y Refactorización Arquitectónica) — [2026-09-25]

### 🎨 Sistema de Diseño y Experiencia de Usuario (UI/UX)
- **[FE-UI-001] Sistema de Diseño Retro 90's Mobile-First**: Ventanas flotantes `.retro-window`, titlebars `─ □ ✕`, cyber-grid, botones físicos táctiles `.btn-retro`, badges de prioridad (`⚡ Alta`, `🔷 Media`, `🟢 Baja`).
- **[FE-UI-002] Barra de Navegación Inferior Fija (`MobileBottomNav`)**: Dock ergonómico para una sola mano en pantallas móviles con botón central elevado para creación rápida de tareas.
- **[FE-UI-003] Motor de Temas Claro y Oscuro (`ThemeContext.tsx`)**: Persistencia en `localStorage`, detección de preferencias del sistema, adaptabilidad completa en `index.css` y switches interactivos en header móvil, sidebar y perfil.
- **[FE-UX-001] Paridad en Tareas del Hogar y Limpieza de Filtros**: Inclusión de `<TaskCard />` con completado directo en `RoomTasks.tsx` y botón "Limpiar Filtros" en `TaskList.tsx`.

### 🏗️ Arquitectura y Mantenibilidad de Código (Architecture & Maintenance)
- **[FE-ARCH-001] Capa Atómica de Componentes Reutilizables (`src/components/common/`)**: Creación de `<RetroWindow />`, `<TaskCard />`, `<Badges />`, `<EmptyState />` y utilitario `selectStyles.ts` para estilizado temático de `react-select`.
- **[FE-MAINT-001] Custom Hooks y Eliminación de Código Muerto**: Exportación de hooks reutilizables `useRoom()` y `useTaskUpdate()`, resolución integral de advertencias de Fast Refresh de React y eliminación del archivo obsoleto `Dashboard.module.css`.

---

## 🚀 Versión 1.1.0-rc (Parches de Estabilidad, Estado y UX) — [2026-08-04]

### 🔴 Correcciones Críticas (Critical & High Bugs)
- **[FE-001] Debounce de Búsqueda y Filtros Stale (`TaskList.tsx`)**: Se corrigió el `useEffect` de búsqueda para que recargue al limpiar el input. Se agruparon dependencias de filtro mediante `useCallback`.
- **[FE-002] Closure Stale y Doble Submit (`TaskList.tsx`)**: Eliminación de tareas actualizada a la forma setter funcional `setTareas(prev => ...)` y estado `deletingId`/`completingId` para deshabilitar botones por fila.
- **[FE-003] Interceptor de Refresh Token (`api.ts`)**: Validación explícita de `newToken` antes de persistir en `localStorage` y propagación del error con `Promise.reject(refreshError)`.
- **[FE-004] Memory Leaks por Unmounted `setState` (`Dashboard.tsx`)**: Implementación del patrón `isMounted` combinado con `AbortController` en peticiones concurrentes.
- **[FE-012] Enlace Duplicado en Navegación (`Sidebar.tsx`)**: Eliminación del ítem duplicado "Historial".

### 🟡 Mejoras de Robustez y UX (Medium Bugs)
- **[FE-005] Estado `isSubmitting` en Formularios (`TaskForm.tsx`, `AssignTaskForm.tsx`, `Login.tsx`, `Register.tsx`)**: Bloqueo de entradas y botones durante peticiones en vuelo.
- **[FE-006] Reemplazo Completo de Etiquetas (`TaskForm.tsx`)**: Ajustada la edición para permitir eliminar todas las etiquetas enviando array vacío al backend.
- **[FE-007] Carga Reactiva de Asignaciones (`AssignTaskForm.tsx`)**: Eliminado `onBlur` en favor de `useEffect([userId])` reactivo con validación previa.
- **[FE-008] SPA Router vs Full Reload (`Login.tsx`, `Register.tsx`)**: Reemplazados elementos `<a href>` por `<Link to>` de React Router.
- **[FE-013] Refactor de Títulos Sugeridos (`RewriteTitles.tsx`)**: Eliminados `alert()` nativos y agregado `AbortController` + `acceptingId`.
- **[FE-014] Eliminación de `alert()` Nativos (`TaskList.tsx`, `TaskForm.tsx`)**: Feedback de errores inline y validación de fechas mediante campos `.is-invalid` de Bootstrap.
- **[FE-015] `<ErrorBoundary>` Global (`ErrorBoundary.tsx`)**: Captura de errores de renderizado en runtime para evitar pantalla en blanco.
- **[FE-017] Modal de Confirmación Estilizado (`ConfirmModal.tsx`)**: Sustitución total de `window.confirm()` por modales reactivos.

### 🔵 Arquitectura y Calidad de Código (Low / Maintenance)
- **[FE-010] Módulo de Tipos Compartidos (`src/types/task.ts`)**: Eliminación de tipos `any` injustificados en peticiones y mapeos de API.
- **[FE-016] Custom Hook `useAsync` (`src/hooks/useAsync.ts`)**: Abstracción reutilizable para llamadas asíncronas con gestión de `AbortController`.
