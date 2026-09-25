# Changelog

All notable frontend changes are documented in this file.

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

### Added
- **FE-015** (`ErrorBoundary.tsx`): Implemented a global `<ErrorBoundary>` to prevent blank screens on runtime render errors.
- **FE-016** (`src/hooks/useAsync.ts`): Introduced a reusable async hook with `AbortController` support.

### Changed
- **FE-005** (`TaskForm.tsx`, `AssignTaskForm.tsx`, `Login.tsx`, `Register.tsx`): Added `isSubmitting` state to block form interaction during in-flight requests.
- **FE-006** (`TaskForm.tsx`): Updated edit behavior to support full tag replacement by allowing empty tag arrays.
- **FE-007** (`AssignTaskForm.tsx`): Replaced `onBlur` with reactive `useEffect([userId])` plus validation.
- **FE-008** (`Login.tsx`, `Register.tsx`): Replaced `<a href>` with React Router `<Link to>` for SPA-safe navigation.
- **FE-010** (`src/types/task.ts`): Created shared task types module and reduced `any` usage across requests and mappings.
- **FE-012** (`Sidebar.tsx`): Removed duplicated "Historial" navigation link.
- **FE-013** (`RewriteTitles.tsx`): Replaced `alert()` with improved async UX using `AbortController` and `acceptingId`.
- **FE-014** (`TaskList.tsx`, `TaskForm.tsx`): Removed native `alert()` usage and added inline error/date validation with Bootstrap `.is-invalid`.
- **FE-017** (`ConfirmModal.tsx`): Replaced `window.confirm()` with a styled reactive confirmation modal.

### Fixed
- **FE-001** (`TaskList.tsx`): Fixed search `useEffect` reload behavior when clearing input and grouped filter dependencies with `useMemo`.
- **FE-002** (`TaskList.tsx`): Migrated task deletion to functional state updates (`setTareas(prev => ...)`) and improved submit-state control with `deletingId`/`completingId`.
- **FE-003** (`api.ts`): Added explicit `newToken` validation before persisting to `localStorage` and propagated refresh errors correctly with `Promise.reject(refreshError)`.
- **FE-004** (`Dashboard.tsx`): Added `isMounted` + `AbortController` pattern to avoid memory leaks from `setState` on unmounted components.

## QA Audit Notes

### Severity Summary
- **Critical & High**: FE-001, FE-002, FE-003, FE-004, FE-012
- **Medium**: FE-005, FE-006, FE-007, FE-008, FE-013, FE-014, FE-015, FE-017
- **Low / Maintenance**: FE-010, FE-016
