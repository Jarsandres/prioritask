# 📋 CHANGELOG & QA AUDIT RELEASE NOTES — Prioritask Frontend

## 🚀 Versión 1.1.0-rc — [2026-08-04]
**Enfoque:** Parches de estabilidad, estado y experiencia de usuario (UX).

---

## 🔴 Correcciones Críticas (Critical & High)

| ID | Área / Archivo | Cambio | Resultado |
|---|---|---|---|
| **FE-001** | `TaskList.tsx` | Se corrigió el `useEffect` de búsqueda para recargar al limpiar input y se agruparon dependencias de filtros con `useMemo`. | Búsqueda y filtros consistentes, sin estados stale. |
| **FE-002** | `TaskList.tsx` | Eliminación de tareas migrada a setter funcional `setTareas(prev => ...)` y uso de `deletingId` / `completingId`. | Evita closures stale y dobles submits. |
| **FE-003** | `api.ts` | Validación explícita de `newToken` antes de persistir en `localStorage`; propagación correcta con `Promise.reject(refreshError)`. | Refresh token más seguro y trazable ante fallo. |
| **FE-004** | `Dashboard.tsx` | Patrón `isMounted` + `AbortController` para peticiones concurrentes. | Prevención de memory leaks por `setState` en componente desmontado. |
| **FE-012** | `Sidebar.tsx` | Eliminación del enlace duplicado "Historial". | Navegación limpia y sin redundancias. |

---

## 🟡 Mejoras de Robustez y UX (Medium)

| ID | Área / Archivo | Cambio | Resultado |
|---|---|---|---|
| **FE-005** | `TaskForm.tsx`, `AssignTaskForm.tsx`, `Login.tsx`, `Register.tsx` | Estado `isSubmitting` para bloquear inputs y botones durante requests en vuelo. | Menos errores por interacción múltiple del usuario. |
| **FE-006** | `TaskForm.tsx` | Ajuste en edición para permitir reemplazo total de etiquetas enviando array vacío. | Edición de etiquetas completa y predecible. |
| **FE-007** | `AssignTaskForm.tsx` | Se reemplaza `onBlur` por `useEffect([userId])` reactivo con validación previa. | Carga de asignaciones más confiable y automática. |
| **FE-008** | `Login.tsx`, `Register.tsx` | Reemplazo de `<a href>` por `<Link to>` de React Router. | Navegación SPA sin recarga completa de página. |
| **FE-013** | `RewriteTitles.tsx` | Eliminación de `alert()` y agregado de `AbortController` + `acceptingId`. | UX más moderna y control fino de estados async. |
| **FE-014** | `TaskList.tsx`, `TaskForm.tsx` | Eliminación de `alert()` nativos; errores inline y validación de fechas con `.is-invalid` (Bootstrap). | Feedback más claro y consistente para el usuario. |
| **FE-015** | `ErrorBoundary.tsx` | Implementación de `<ErrorBoundary>` global. | Evita pantallas en blanco ante errores de render runtime. |
| **FE-017** | `ConfirmModal.tsx` | Sustitución de `window.confirm()` por modal reactivo estilizado. | Confirmaciones visuales coherentes con la UI de la app. |

---

## 🔵 Arquitectura y Calidad de Código (Low / Maintenance)

| ID | Área / Archivo | Cambio | Resultado |
|---|---|---|---|
| **FE-010** | `src/types/task.ts` | Creación de módulo de tipos compartidos; reducción de `any` en requests y mapeos. | Tipado más fuerte y mantenimiento más seguro. |
| **FE-016** | `src/hooks/useAsync.ts` | Introducción de hook reutilizable para flujos async con `AbortController`. | Menos duplicación y mejor manejo de cancelación. |

---

## ✅ Resumen de impacto

| Categoría | Total |
|---|---:|
| 🔴 Critical & High | **5** |
| 🟡 Medium | **8** |
| 🔵 Low / Maintenance | **2** |
| **Total de cambios** | **15** |
