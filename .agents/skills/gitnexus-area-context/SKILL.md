---
name: gitnexus-area-context
description: "Skill for the Context area of prioritask. 4 symbols across 3 files."
---

# Context

4 symbols | 3 files | Cohesion: 100%

## When to Use

- Working with code in `prioritask-frontend/`
- Understanding how RoomProvider, TaskUpdateProvider work
- Modifying context-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `prioritask-frontend/src/App.tsx` | App, AppContent |
| `prioritask-frontend/src/context/RoomContext.tsx` | RoomProvider |
| `prioritask-frontend/src/context/TaskUpdateContext.tsx` | TaskUpdateProvider |

## Entry Points

Start here when exploring this area:

- **`RoomProvider`** (Function) — `prioritask-frontend/src/context/RoomContext.tsx:13`
- **`TaskUpdateProvider`** (Function) — `prioritask-frontend/src/context/TaskUpdateContext.tsx:13`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `RoomProvider` | Function | `prioritask-frontend/src/context/RoomContext.tsx` | 13 |
| `TaskUpdateProvider` | Function | `prioritask-frontend/src/context/TaskUpdateContext.tsx` | 13 |
| `App` | Function | `prioritask-frontend/src/App.tsx` | 72 |
| `AppContent` | Function | `prioritask-frontend/src/App.tsx` | 21 |

## How to Explore

1. `context({name: "RoomProvider"})` — see callers and callees
2. `query({search_query: "context"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
