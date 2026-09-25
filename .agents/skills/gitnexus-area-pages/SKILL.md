---
name: gitnexus-area-pages
description: "Skill for the Pages area of prioritask. 23 symbols across 7 files."
---

# Pages

23 symbols | 7 files | Cohesion: 100%

## When to Use

- Working with code in `prioritask-frontend/`
- Understanding how Tags, fetchTags, handleCreate work
- Modifying pages-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `prioritask-frontend/src/pages/Tags.tsx` | Tags, fetchTags, handleCreate, handleUpdate, promptDeleteTag (+1) |
| `prioritask-frontend/src/pages/Dashboard.tsx` | Dashboard, fetchRooms, fetchTareas, loadData |
| `prioritask-frontend/src/pages/History.tsx` | History, fetchHistory, loadAuxData, sinceDate |
| `prioritask-frontend/src/pages/RewriteTitles.tsx` | RewriteTitles, acceptSuggestion, fetchSuggestions |
| `prioritask-frontend/src/pages/GroupedTasks.tsx` | GroupedTasks, fetchGroups |
| `prioritask-frontend/src/pages/Profile.tsx` | Profile, fetchUser |
| `prioritask-frontend/src/pages/RoomTasks.tsx` | RoomTasks, fetchTasks |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `Tags` | Function | `prioritask-frontend/src/pages/Tags.tsx` | 7 |
| `fetchTags` | Function | `prioritask-frontend/src/pages/Tags.tsx` | 20 |
| `handleCreate` | Function | `prioritask-frontend/src/pages/Tags.tsx` | 33 |
| `handleUpdate` | Function | `prioritask-frontend/src/pages/Tags.tsx` | 89 |
| `promptDeleteTag` | Function | `prioritask-frontend/src/pages/Tags.tsx` | 62 |
| `startEdit` | Function | `prioritask-frontend/src/pages/Tags.tsx` | 83 |
| `Dashboard` | Function | `prioritask-frontend/src/pages/Dashboard.tsx` | 11 |
| `fetchRooms` | Function | `prioritask-frontend/src/pages/Dashboard.tsx` | 38 |
| `fetchTareas` | Function | `prioritask-frontend/src/pages/Dashboard.tsx` | 24 |
| `loadData` | Function | `prioritask-frontend/src/pages/Dashboard.tsx` | 85 |
| `History` | Function | `prioritask-frontend/src/pages/History.tsx` | 7 |
| `fetchHistory` | Function | `prioritask-frontend/src/pages/History.tsx` | 79 |
| `loadAuxData` | Function | `prioritask-frontend/src/pages/History.tsx` | 20 |
| `sinceDate` | Function | `prioritask-frontend/src/pages/History.tsx` | 54 |
| `RewriteTitles` | Function | `prioritask-frontend/src/pages/RewriteTitles.tsx` | 11 |
| `acceptSuggestion` | Function | `prioritask-frontend/src/pages/RewriteTitles.tsx` | 48 |
| `fetchSuggestions` | Function | `prioritask-frontend/src/pages/RewriteTitles.tsx` | 21 |
| `GroupedTasks` | Function | `prioritask-frontend/src/pages/GroupedTasks.tsx` | 12 |
| `fetchGroups` | Function | `prioritask-frontend/src/pages/GroupedTasks.tsx` | 22 |
| `Profile` | Function | `prioritask-frontend/src/pages/Profile.tsx` | 9 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Dashboard → FetchRooms` | intra_community | 3 |
| `Dashboard → FetchTareas` | intra_community | 3 |
| `History → SinceDate` | intra_community | 3 |

## How to Explore

1. `context({name: "Tags"})` — see callers and callees
2. `query({search_query: "pages"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
