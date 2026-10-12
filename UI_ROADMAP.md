# 🎨 Acta del Comité UI/UX & Hoja de Ruta de Personalización — Prioritask

> **Comité Convocado:** `Orquestador` (Estrategia de Producto & Arquitectura) + `Frontend-Dev` (Ingeniería React 19 / TypeScript / Design Tokens) + `REA / UX Analysis` (Deconstrucción de Todoist GUI + Patrones 21st.dev)
> **Estado:** ✅ **Roadmap 100% Completado** — Fase Base (Todoist Core UI v1.4.0) + **Fases 1, 2, 3, 4 (v1.5.0) y Fase 5 (Split-Screen Auth 21st.dev v1.6.2) Implementadas**

---

## 1. Síntesis del Comité: Deconstrucción de Todoist (REA) + Pulido 21st.dev

El comité analizó los pilares ergonómicos que hacen de **Todoist** el estándar de referencia en gestión de tareas personales y los cruzó con la biblioteca de patrones modernos de **21st.dev** y el dominio colaborativo multi-hogar de **Prioritask**:

| Pilar de Todoist (REA) | Adaptación en Prioritask (v1.4.0) | Pulido de Componentes (21st.dev) |
| :--- | :--- | :--- |
| **Sidebar Cálido & Jerarquía de Proyectos** | Superficie cálida alabastro (`#faf8f7` en claro / `#0d1322` en oscuro), botón primario superior `+ Añadir tarea` con badge `C`, iconos con color semántico propio y árbol colapsable **"Mis Hogares"** con indicadores `#` coloreados y contadores por hogar. | Transiciones suaves `cubic-bezier(0.16, 1, 0.3, 1)`, píldoras activas con tinte translúcido y contadores tabulares (`font-variant-numeric: tabular-nums`). |
| **Quick-Add Inline Composer** | Nuevo componente [`QuickAddTaskBar.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/components/tasks/QuickAddTaskBar.tsx) integrado en `TaskList` y `RoomTasks` que se expande in-place sin cambiar de página. | Píldoras interactivas para Fecha (`Hoy`, `Mañana`, selector), Banderas de Prioridad (`P1–P5`), Categoría, Popover de Recurrencia DSL (`cada! 7 días`) y botón `IA` (`POST /tasks/ai/suggest`). |
| **Priority-Ring Checkboxes (P1–P4)** | Anillos de completado circulares codificados por urgencia (`priority-ring-p1` rojo crítico, `priority-ring-p2` ámbar, `priority-ring-p3` azul, `priority-ring-p4` pizarra) y acento lateral en tarjetas (`priority-card-p1..p4`). | Micro-escala al pasar el cursor (`scale(1.08)`), relleno cromático sutil y transición inmediata a verde esmeralda al completar. |
| **Fechas Semánticas & Vistas "Hoy / Próx. 7 días"** | Coloreado contextual de fechas (`due-overdue` rojo, `due-today` verde esmeralda, `due-upcoming` púrpura), chips rápidos `📅 Hoy` y `🗓️ Próx. 7 días` en [`FilterBar.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/components/tasks/FilterBar.tsx) y widget **"Enfoque de Hoy"** en [`Dashboard.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/pages/Dashboard.tsx). | Chips de filtro con estado activo de alto contraste y filas compactas de enfoque diario en el Panel de Control. |

---

## 2. Hoja de Ruta (Roadmap) para la Personalización y Evolución UI

A partir de esta base sólida estilo Todoist, el comité define un **Roadmap en 4 Fases** para dotar a Prioritask de una identidad visual propia, altamente personalizable y con componentes interactivos de nivel **21st.dev**:

### 🚀 Fase 1: Natural Language Input en Vivo & Token Highlighting (Estilo Todoist + 21st.dev)
**Objetivo:** Convertir la barra `QuickAddTaskBar` en un editor inteligente que detecta entidades mientras el usuario escribe el título.
1. **Parser NLP Inline en Tiempo Real**:
   - Detectar tokens directamente en el texto del título:
     - Fechas naturales: `hoy`, `mañana`, `lunes`, `15 oct` → se iluminan como un chip verde/morado inline y asignan `fecha_vencimiento`.
     - Prioridades: `p1`, `p2`, `p3`, `!!` → asignan automáticamente la bandera de prioridad.
     - Categorías / Etiquetas: `#limpieza`, `#compras`, `#urgente` → autocompletado flotante con menú desplegable instantáneo.
     - Recurrencia DSL: `cada! 7 días`, `cada mes` → activa automáticamente el motor `recurrenceEngine.ts`.
2. **Menú Flotante de Sugerencias (`Slash / Trigger Popover`)**:
   - Inspirado en los comboboxes animados de 21st.dev con navegación completa por teclado (`↑`, `↓`, `Enter`, `Tab`).

---

### 🎨 Fase 2: Motor de Personalización de Temas, Acentos por Hogar y Densidad Visual
**Objetivo:** Permitir que cada usuario y cada hogar personalice la estética de Prioritask más allá del modo claro/oscuro estándar.
1. **Paletas de Acento Curadas (Theme Studio)**:
   - **Todoist Crimson** (Rojo coral cálido `#dc2626` — ideal para foco y urgencia).
   - **Prioritask Cobalt** (Azul SaaS `#2563eb` — actual por defecto).
   - **Home Emerald** (Verde bosque `#059669` — ambiente doméstico relajado).
   - **Linear Violet** (Índigo/Violeta `#7c3aed` — estética moderna 21st.dev).
   - **Midnight OLED** (Modo oscuro de contraste puro `#000000` para pantallas móviles AMOLED).
2. **Selector de Densidad de Interfaz (`UI Density`)**:
   - **Compacta (Estilo Todoist Pro / Linear)**: Filas de `36px`, ideal para gestionar +50 tareas domésticas de un vistazo.
   - **Estándar**: Balance entre tarjetas y metadatos.
   - **Cómoda (Bento Cards)**: Tarjetas con previsualización de subtareas y adjuntos visibles.
3. **Identidad Visual por Hogar (`Room Branding`)**:
   - Selector de icono personalizado (`🏠`, `🏖️`, `🏢`, `🌱`) y color de acento propio para cada hogar en el árbol `"Mis Hogares"` del Sidebar.

---

### ✨ Fase 3: Componentes Avanzados 21st.dev (Peek Drawer, Bento Dashboard & Micro-Físicas)
**Objetivo:** Elevar la experiencia táctil y de escritorio con patrones de interfaz de última generación.
1. **Slide-Over Task Peek Drawer (Panel Lateral de Detalle)**:
   - Al hacer clic en una tarea (en vista Lista, Kanban o Calendario), en lugar de navegar a otra ruta (`/tasks/edit/:id`), abrir un **Drawer lateral derecho** suave (`backdrop-filter: blur(12px)`) al estilo Todoist/Linear donde conviven:
     - Título y descripción editables in-place.
     - Checklist interactivo de subtareas (`TaskChecklist`).
     - Hilo de actividad y comentarios (`TaskCommentsSection`).
     - Galería de evidencias fotográficas (`TaskAttachmentsSection`).
     - Selector de recurrencia con vista previa de los próximos 4 ciclos.
2. **Dashboard Bento Grid & Widget de Karma Doméstico**:
   - Rediseño modular del Dashboard en cuadrícula **Bento (21st.dev)** con:
     - **Anillo de Progreso Diario ("Mi Meta de Hoy")**: Inspirado en Todoist Karma, mostrando tareas completadas hoy vs. objetivo diario del hogar y racha activa (`🔥 X días`).
     - **Mapa de Calor Semanal**: Mini-gráfico de actividad de los convivientes.
     - **Balance de Carga del Hogar**: Visualización rápida de equidad de puntos entre miembros.
3. **Transiciones de Vista Nativas (`View Transitions API`)**:
   - Animación fluida de morfismo al cambiar entre las vistas **Tarjetas ↔ Lista ↔ Tablero Kanban ↔ Calendario** sin saltos bruscos de layout.

---

### 🤝 Fase 4: Colaboración Doméstica Interactiva & Modo Kiosco/Nevera Digital
**Objetivo:** Diferenciar a Prioritask de un gestor individual (como Todoist personal) potenciando la convivencia en tiempo real.
1. **Asignación Rápida Drag & Drop de Convivientes**:
   - Barra de avatares de miembros del hogar en la cabecera de `RoomTasks`; arrastrar el avatar de un conviviente sobre una tarea (o usar el modo clic accesible) la asigna instantáneamente con feedback optimista.
2. **Reacciones y Reconocimiento Rápido ("Kudos")**:
   - Cuando un conviviente completa una tarea, permitir a los demás miembros reaccionar con un clic (`👏`, `🔥`, `❤️`) en `TaskCard`, `TaskPeekDrawer` o `KitchenKioskModal` sumando micro-puntos de reconocimiento (con multiplicador x2 en tareas pesadas `P1`/`P2` o con evidencia fotográfica).
3. **Modo Kiosco / Tablet de Cocina (Always-On Display)**:
   - Vista dedicada a pantalla completa (`KitchenKioskModal.tsx`) con tipografía de alto contraste, Screen Wake Lock API, botones táctiles grandes (`min-height: 52px`), temporizador Pomodoro doméstico integrado (`15m`, `25m`, `45m`, `5m`) y actualización en vivo vía SSE (`useRoomEvents`).

---

### 🔐 Fase 5: Experiencia de Autenticación Split-Screen & Escaparate de Convivencia (21st.dev)
**Objetivo:** Transformar el punto de entrada (`Login` y `Register`) en una experiencia inmersiva de nivel **21st.dev** que comunique inmediatamente la propuesta de valor de convivencia doméstica de Prioritask.
1. **Primitiva Reutilizable `SignInPage` y `GlassInputWrapper` (`src/components/ui/SignInPage.tsx`)**:
   - Arquitectura split-screen responsiva (formulario a la izquierda + escaparate visual a la derecha en desktop) con soporte dual controlado/no controlado y composición vía `children`.
   - Campos de entrada envueltos en superficies translúcidas `.glass-input-wrapper` (`backdrop-filter: blur(12px)`) que reaccionan dinámicamente a las 5 paletas de acento del **Theme Studio** (`cobalt`, `crimson`, `emerald`, `violet`, `oled`).
2. **Escaparate de Convivencia en Tiempo Real (`Login.tsx` & `Register.tsx`)**:
   - Panel hero con tarjetas flotantes `TestimonialCard` y píldoras de gamificación reales de Prioritask: Piso Compartido (`🔥 Racha 14d · P1`), Vida en Pareja (`⚖️ Reparto 50/50`) y Hogar Familiar (`👏 +120 pts Kiosco`).
   - Animaciones escalonadas (`fadeSlideIn`, `slideRightIn`, `testimonialIn`) en `Auth.css` con soporte completo para `@media (prefers-reduced-motion: reduce)`.
   - Persistencia segura de `rememberMe` (`prioritask-remember-email` y `refreshToken`) y medidor de fortaleza de contraseña en vivo en el registro.

---

### 🔄 Fase 6: Motor de Sincronización Offline, Optimistic UI & Cola de Comandos Transaccionales (Inspirado en Todoist Desktop)
**Objetivo:** Desacoplar la interfaz de usuario de la latencia o disponibilidad de la red mediante un motor local-first inspirado en la arquitectura de `todoist-electron@9.31.0` analizada estáticamente con REA (`app.asar`).
1. **Esquema Transaccional de Comandos y Puente IPC (`src/sync/offlineQueue.ts`)**:
   - Contrato `SyncCommand` con `uuid` de idempotencia, `temp_id` (`temp_<uuid>`) para creaciones offline y ordenamiento causal FIFO (`timestamp`).
   - Soporte para sobres IPC estilo Electron (`DesktopBridgeEnvelope`: `completeItem`, `uncompleteItem`, `addTask`, `quickAddAddTask`, `sendRequestSync`, `handleWakeup`) y elección de ventana líder (`isMainLogicWindow` / `setMainLogicWindow`).
2. **Motor `OfflineSyncEngine`, Persistencia `IndexedDB` y Resolución de Conflictos (`src/sync/offlineQueue.ts`)**:
   - Actualización optimista inmediata en memoria (`dispatchMutation` + `applyMutationToMemory`) con snapshots previos (`OptimisticSnapshot`) para *rollback* selectivo ante errores definitivos (`4xx`).
   - Persistencia duradera mediante `IndexedDBQueueStorageAdapter` con fallback en memoria y reprocesamiento por lotes (`flushQueue`) con traducción automática `temp_id -> server_id` y resolución de conflictos (`field-merge`, `last-write-wins`, `client-wins`, `server-wins`).

---

### ⚡ Fase 7: Store Normalizado O(1) `useTasksState`, Primitiva `TaskItem` con Roving TabIndex & Settings Workspace (Inspirado en Todoist Renderer)
**Objetivo:** Consolidar la arquitectura del renderer de Todoist (`todoist-electron@9.31.0`) en las vistas de tareas (`TaskList.tsx` y `RoomTasks.tsx`) y en el centro de configuración (`Profile.tsx`).
1. **Store Normalizado O(1) y Mutaciones Optimistas con Rollback por Campo (`src/hooks/useTasksState.ts`)**:
   - Estado indexado `byId: Record<string, Task>` + `ids: string[]` desacoplado del estado efímero de UI (`focusedTaskId`, `selectedTaskIds`, `activeOverlay`, `lastError`).
   - Mutaciones optimistas instantáneas (`toggleCompleteOptimistic`, `updateTaskOptimistic`, `setPriorityOptimistic`, `deleteTaskOptimistic`) con contador de operaciones en vuelo (`inFlightRef`) y reversión atómica por campo ante fallos de red.
   - Conciliación en vivo O(1) (`reconcileLiveEvent`) para todos los eventos SSE y del puente IPC (`TASK_CREATED`, `TASK_UPDATED`, `TASK_DELETED`, `SUBTASK_TOGGLED`, `SUBTASK_CREATED`, `COMMENT_ADDED`, `COMMENT_DELETED`, `ATTACHMENT_ADDED`, `ATTACHMENT_DELETED`).
2. **Primitiva `TaskItem` WAI-ARIA, Prioridades P1–P4 y Roving TabIndex (`src/components/tasks/TaskItem.tsx`, `TaskListView.tsx`)**:
   - Semántica `role="listitem"` y `role="checkbox"` (`aria-checked`, `aria-busy`), anillos y banderas cromáticas P1–P4 (`#dc2626`, `#d97706`, `#2563eb`, `#64748b`).
   - Navegación espacial por teclado (*roving tabindex*: `↑`, `↓`, `Home`, `End`) y atajos rápidos (`Espacio`/`x` completar, `e`/`Enter` abrir Peek Drawer, `1`–`4` prioridad instantánea, `Shift+Espacio`/`s` selección múltiple, `Supr` eliminar) sin robar el foco de inputs activos.
3. **Centro de Ajustes Todoist (`src/context/SettingsContext.tsx`, `src/pages/Profile.tsx`)**:
   - Workspace de 7 secciones con buscador instantáneo de preferencias, personalización de módulos visibles en el Sidebar y sincronización con el backend.

---

## 3. Matriz de Priorización Recomendada por el Comité

| Orden | Entregable | Estado | Impacto UX | Complejidad | Archivos Principales Afectados |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **1º** | **Slide-Over Task Peek Drawer + View Transitions API** | ✅ **Completado (v1.5.0)** | 🔥 Muy Alto | Media | [`TaskPeekDrawer.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/components/tasks/TaskPeekDrawer.tsx), [`TaskList.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/components/TaskList.tsx), [`RoomTasks.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/pages/RoomTasks.tsx), [`Dashboard.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/pages/Dashboard.tsx) |
| **2º** | **Theme Studio, Densidad Visual & Room Branding** | ✅ **Completado (v1.5.0)** | ⭐ Alto | Baja | [`ThemeContext.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/context/ThemeContext.tsx), [`index.css`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/index.css), [`Profile.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/pages/Profile.tsx), [`Sidebar.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/components/Sidebar.tsx) |
| **3º** | **NLP Token Highlighting & Trigger Popover en `QuickAddTaskBar`** | ✅ **Completado (v1.5.0)** | 🔥 Muy Alto | Media-Alta | [`QuickAddTaskBar.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/components/tasks/QuickAddTaskBar.tsx), [`nlpTaskParser.ts`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/utils/nlpTaskParser.ts) |
| **4º** | **Dashboard Bento Grid + Anillo de Meta Diaria (Karma)** | ✅ **Completado (v1.5.0)** | ⭐ Alto | Media | [`Dashboard.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/pages/Dashboard.tsx), [`DailyGoalRing.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/components/dashboard/DailyGoalRing.tsx) |
| **5º** | **Colaboración Doméstica (Drag & Drop Avatares + Kudos) & Modo Kiosco/Nevera Digital** | ✅ **Completado (v1.5.0)** | 🔥 Muy Alto | Media | [`KitchenKioskModal.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/components/rooms/KitchenKioskModal.tsx), [`kudosStore.ts`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/utils/kudosStore.ts), [`RoomTasks.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/pages/RoomTasks.tsx), [`TaskCard.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/components/common/TaskCard.tsx) |
| **6º** | **Split-Screen Sign-In & Register (21st.dev + Glassmorphism + Escaparate de Convivencia)** | ✅ **Completado (v1.6.2)** | 🔥 Muy Alto | Media | [`SignInPage.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/components/ui/SignInPage.tsx), [`Login.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/auth/Login.tsx), [`Register.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/auth/Register.tsx), [`Auth.css`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/auth/Auth.css) |
| **7º** | **Motor de Sincronización Offline, Optimistic UI & Cola de Comandos (`OfflineSyncEngine`)** | ✅ **Completado (v1.7.0)** | 🔥 Muy Alto | Alta | [`offlineQueue.ts`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/sync/offlineQueue.ts), [`offlineQueue.test.ts`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/sync/__tests__/offlineQueue.test.ts) |
| **8º** | **Store Normalizado O(1) `useTasksState`, `TaskItem` Roving TabIndex & Settings Workspace** | ✅ **Completado (v1.9.0)** | 🔥 Muy Alto | Media-Alta | [`useTasksState.ts`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/hooks/useTasksState.ts), [`TaskItem.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/components/tasks/TaskItem.tsx), [`TaskListView.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/components/tasks/TaskListView.tsx), [`TaskList.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/components/TaskList.tsx), [`RoomTasks.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/pages/RoomTasks.tsx), [`Profile.tsx`](file:///c:/Users/jarsa/Documents/antigravity/prioritask/prioritask-frontend/src/pages/Profile.tsx) |
