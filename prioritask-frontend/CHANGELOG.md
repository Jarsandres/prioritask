# Changelog

All notable frontend changes are documented in this file.

## ✨ Versión 1.6.2 (Rediseño Split-Screen de Autenticación 21st.dev, Glassmorphism Inputs & Escaparate de Convivencia — UI/UX Polish) — [2026-10-11]

### Added
- **[FE-AUTH-010] Primitiva UI `SignInPage` y Subcomponentes Glassmorphic (`src/components/ui/SignInPage.tsx`, `src/components/ui/index.ts`)**: Componente reutilizable `SignInPage` junto con `GlassInputWrapper`, `TestimonialCard` y `GoogleIcon`, soporte dual controlado/no controlado, composición vía `children` y preservación de selectores E2E (`e2e/smoke.spec.ts`).
- **[FE-AUTH-020] Arquitectura CSS Split-Screen, Animaciones Escalonadas y Soporte Theme Studio (`src/auth/Auth.css`)**: Animaciones `@keyframes fadeSlideIn`, `slideRightIn`, `testimonialIn`, respeto a `@media (prefers-reduced-motion: reduce)` y superficies `.glass-input-wrapper` reactivas a las 5 paletas del Theme Studio en modo claro y oscuro.
- **[FE-AUTH-030] Escaparate de Convivencia con Esencia Prioritask y Armonización de Login/Registro (`src/auth/Login.tsx`, `src/auth/Register.tsx`)**: `PRIORITASK_TESTIMONIALS` (Piso Compartido `🔥 Racha 14d · P1`, Vida en Pareja `⚖️ Reparto 50/50`, Hogar Familiar `👏 +120 pts Kiosco`), persistencia segura de `rememberMe` (`prioritask-remember-email` y `refreshToken`) y feedback UX mediante `useToast()`.
- **[QA-AUTH-010] Suite Unitaria e Integración (`src/__tests__/SignInPage.test.tsx`)**: 5 suites/tests en Vitest + React Testing Library validando renderizado, accesibilidad, toggle de contraseña, persistencia de `rememberMe` y flujos de Login y Register.

---

## 🚀 Versión 1.5.0 (Hoja de Ruta de Personalización UI/UX Completa: Task Peek Drawer, Theme Studio, NLP en Vivo, Bento Karma, Kudos & Modo Kiosco) — [2026-10-11]

### Added
- **[FE-UI-ROADMAP-001] Slide-Over Task Peek Drawer & View Transitions (`src/components/tasks/TaskPeekDrawer.tsx`, `TaskList.tsx`, `RoomTasks.tsx`, `Dashboard.tsx`)**: Panel lateral deslizante (`backdrop-filter: blur(12px)`) que permite inspeccionar y editar tareas in-place sin cambiar de página, integrando edición rápida de título/descripción/prioridad/estado/fecha, vista previa de 4 ciclos de recurrencia, checklist de subtareas (`TaskChecklist`), hilo de comentarios (`TaskCommentsSection`) y galería de evidencias fotográficas (`TaskAttachmentsSection`), junto con soporte nativo para `document.startViewTransition` al alternar vistas.
- **[FE-UI-ROADMAP-002] Theme Studio, Densidad Visual & Identidad por Hogar (`src/context/ThemeContext.tsx`, `src/pages/Profile.tsx`, `src/components/Sidebar.tsx`, `src/index.css`)**: Motor de personalización con 5 paletas de acento curadas (`Prioritask Cobalt`, `Todoist Crimson`, `Home Emerald`, `Linear Violet`, `Midnight OLED`), 3 modos de densidad de interfaz (`Compacta`, `Estándar`, `Cómoda / Bento`) y branding personalizado por hogar (icono + color de acento) reflejado en el árbol `"Mis Hogares"` del Sidebar y en el Dashboard.
- **[FE-UI-ROADMAP-003] Parser NLP en Tiempo Real y Menú de Sugerencias en `QuickAddTaskBar` (`src/utils/nlpTaskParser.ts`, `src/components/tasks/QuickAddTaskBar.tsx`)**: Detección en vivo de tokens en el título (`hoy`, `mañana`, `pasado mañana`, días de la semana, `15 oct`, prioridades `p1..p5`/`!!`, categorías `#limpieza`/`#compras`/`#mantenimiento` y recurrencia DSL `cada! 7 días`), cinta de chips semánticos detectados con extracción automática del título limpio y popover flotante de autocompletado (`#`, `!`, `/`) navegable por teclado.
- **[FE-UI-ROADMAP-004] Dashboard Bento Grid & Anillo de Meta Diaria / Karma Doméstico (`src/components/dashboard/DailyGoalRing.tsx`, `src/pages/Dashboard.tsx`)**: Widget Bento con anillo circular SVG de progreso diario, selector de objetivo diario (`3`, `5`, `8`, `10` tareas), cálculo de puntos Karma ponderados por prioridad con insignia de rango (`Aprendiz` → `Leyenda Todoist`) y tarjeta de balance de carga doméstica por categoría.
- **[FE-UI-ROADMAP-005] Colaboración Doméstica Interactiva: Avatares Drag & Drop, Reacciones Kudos y Modo Kiosco/Nevera Digital (`src/components/rooms/KitchenKioskModal.tsx`, `src/utils/kudosStore.ts`, `src/pages/RoomTasks.tsx`, `src/components/common/TaskCard.tsx`, `src/components/tasks/TaskPeekDrawer.tsx`)**: Barra de asignación rápida de convivientes mediante Drag & Drop y modo clic accesible en `RoomTasks`, reacciones de reconocimiento (`👏`, `🔥`, `❤️`) con bonificación de puntos en tareas completadas, y Modo Kiosco de Cocina a pantalla completa de alto contraste con Screen Wake Lock API, botones táctiles (`min-height: 52px`) y temporizador Pomodoro doméstico integrado.
- **[FE-UI-ROADMAP-006] Suite de Pruebas Unitarias Vitest (`nlpTaskParser.test.ts`, `TaskPeekDrawer.test.tsx`, `DailyGoalRing.test.tsx`, `ThemeContext.test.tsx`, `QuickAddTaskBar.test.tsx`, `KitchenKioskModal.test.tsx`, `kudosStore.test.ts`)**: Cobertura de pruebas unitarias para las 4 fases del roadmap UI/UX.

---

## 🚀 Versión 1.4.0 (Comité UI/UX: Interfaz Estilo Todoist, Compositor Rápido Inline & Pulido 21st.dev) — [2026-10-10]

### Added
- **[FE-UI-TODOIST-001] Compositor Rápido Inline (`src/components/tasks/QuickAddTaskBar.tsx`)**: Barra de creación rápida de tareas sin abandonar el listado (`TaskList.tsx` y `RoomTasks.tsx`), con píldoras de fecha rápida (`Hoy`, `Mañana`, selector de calendario), selector visual de prioridad con banderas (`P1–P5`), selector de categoría, popover de recurrencia con soporte para expresiones DSL (`cada! 7 días`, `cada semana`) y botón de sugerencia de prioridad con IA (`POST /tasks/ai/suggest`).
- **[FE-UI-TODOIST-002] Sidebar Estilo Todoist + Árbol Colapsable "Mis Hogares" (`src/components/Sidebar.tsx`, `Sidebar.css`)**: Superficie cálida alabastro (`#faf8f7` en claro / `#0d1322` en oscuro), botón rápido superior `+ Añadir tarea` con badge de atajo `C`, iconos de navegación con colores semánticos y sección colapsable `"Mis Hogares"` con indicadores `#` coloreados y contadores de tareas.
- **[FE-UI-TODOIST-003] Checkboxes con Anillo de Prioridad y Fechas Semánticas (`src/components/common/TaskCard.tsx`, `src/components/tasks/TaskListView.tsx`, `tasks.css`)**: Anillos circulares codificados por nivel de urgencia (`priority-ring-p1` rojo, `priority-ring-p2` ámbar, `priority-ring-p3` azul, `priority-ring-p4` pizarra), acento lateral en tarjetas (`priority-card-p1..p4`) y coloreado semántico de fechas de vencimiento (`due-overdue`, `due-today`, `due-upcoming`).
- **[FE-UI-TODOIST-004] Filtros Rápidos Temporales y Widget "Enfoque de Hoy" (`src/components/tasks/FilterBar.tsx`, `src/pages/Dashboard.tsx`)**: Chips de filtro rápido `📅 Hoy` y `🗓️ Próx. 7 días` en `FilterBar.tsx`, y sección `"Enfoque de Hoy"` en `Dashboard.tsx` destacando las tareas pendientes más urgentes o con vencimiento en el día.
- **[FE-UI-TODOIST-005] Hoja de Ruta de Personalización UI (`UI_ROADMAP.md`) y Tests Unitarios (`QuickAddTaskBar.test.tsx`, `TaskCard.test.tsx`)**: Síntesis arquitectónica del Comité Orquestador + Frontend-Dev combinando REA/Todoist con patrones de micro-interacción 21st.dev.

---

## 🚀 Versión 1.3.0 (Motor de Recurrencia DSL, Vista Previa en Vivo & Avance Rápido de Tareas) — [2026-10-10]

### Added
- **[FE-REC-001] Motor de Recurrencia TypeScript (`src/utils/recurrenceEngine.ts`)**: Soporte para modos `FIXED` y `FLOATING` (`every!`), parseador DSL multiidioma (español/inglés) y cálculo determinista anti-deriva.
- **[FE-REC-002] Panel de Configuración de Recurrencia en `TaskForm.tsx`**: Selector de modo, campo DSL con chips interactivos, configuración de intervalo/frecuencia, checkbox de reseteo de subtareas y chips de previsualización en tiempo real de los siguientes 4 ciclos.
- **[FE-REC-003] Acción de Avance Rápido en `TaskList.tsx`**: Integración del handler `onAdvance` en tarjetas de tareas recurrentes para disparar el avance de ciclo con un clic.
- **[FE-REC-004] Suite de Pruebas Unitarias Vitest (`recurrenceEngine.test.ts`, `TaskForm.test.tsx`)**: Cobertura exhaustiva del motor matemático de recurrencia y de la interacción UI del formulario.

---

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
