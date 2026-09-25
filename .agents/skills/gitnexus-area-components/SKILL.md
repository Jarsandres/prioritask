---
name: gitnexus-area-components
description: "Skill for the Components area of prioritask. 17 symbols across 4 files."
---

# Components

17 symbols | 4 files | Cohesion: 88%

## When to Use

- Working with code in `prioritask-frontend/`
- Understanding how getCurrentRoomId work
- Modifying components-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `prioritask-frontend/src/components/TaskForm.tsx` | formatearFecha, handleSubmit, handleSuggest, prioridadAPeso, TaskForm (+2) |
| `prioritask-frontend/src/components/AssignTaskForm.tsx` | load, AssignTaskForm, fetchAssignments, handleAssign, removeAssignment |
| `prioritask-frontend/src/components/TaskList.tsx` | TaskList, fetchTareas, marcarComoCompletada, promptDelete |
| `prioritask-frontend/src/utils/room.ts` | getCurrentRoomId |

## Entry Points

Start here when exploring this area:

- **`getCurrentRoomId`** (Function) — `prioritask-frontend/src/utils/room.ts:0`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getCurrentRoomId` | Function | `prioritask-frontend/src/utils/room.ts` | 0 |
| `load` | Function | `prioritask-frontend/src/components/AssignTaskForm.tsx` | 22 |
| `TaskList` | Function | `prioritask-frontend/src/components/TaskList.tsx` | 10 |
| `fetchTareas` | Function | `prioritask-frontend/src/components/TaskList.tsx` | 31 |
| `marcarComoCompletada` | Function | `prioritask-frontend/src/components/TaskList.tsx` | 108 |
| `promptDelete` | Function | `prioritask-frontend/src/components/TaskList.tsx` | 83 |
| `AssignTaskForm` | Function | `prioritask-frontend/src/components/AssignTaskForm.tsx` | 8 |
| `fetchAssignments` | Function | `prioritask-frontend/src/components/AssignTaskForm.tsx` | 49 |
| `handleAssign` | Function | `prioritask-frontend/src/components/AssignTaskForm.tsx` | 81 |
| `removeAssignment` | Function | `prioritask-frontend/src/components/AssignTaskForm.tsx` | 118 |
| `formatearFecha` | Function | `prioritask-frontend/src/components/TaskForm.tsx` | 59 |
| `handleSubmit` | Function | `prioritask-frontend/src/components/TaskForm.tsx` | 132 |
| `handleSuggest` | Function | `prioritask-frontend/src/components/TaskForm.tsx` | 112 |
| `prioridadAPeso` | Function | `prioritask-frontend/src/components/TaskForm.tsx` | 105 |
| `TaskForm` | Function | `prioritask-frontend/src/components/TaskForm.tsx` | 15 |
| `fetchTags` | Function | `prioritask-frontend/src/components/TaskForm.tsx` | 48 |
| `fetchTask` | Function | `prioritask-frontend/src/components/TaskForm.tsx` | 70 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `AssignTaskForm → GetCurrentRoomId` | cross_community | 3 |
| `AssignTaskForm → FetchAssignments` | intra_community | 3 |
| `TaskList → GetCurrentRoomId` | intra_community | 3 |

## How to Explore

1. `context({name: "getCurrentRoomId"})` — see callers and callees
2. `query({search_query: "components"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
