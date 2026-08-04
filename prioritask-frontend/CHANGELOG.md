# Changelog

All notable frontend changes are documented in this file.

## [1.1.0-rc] - 2026-08-04

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
