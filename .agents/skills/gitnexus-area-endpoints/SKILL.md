---
name: gitnexus-area-endpoints
description: "Skill for the Endpoints area of prioritask. 33 symbols across 9 files."
---

# Endpoints

33 symbols | 9 files | Cohesion: 50%

## When to Use

- Working with code in `app/`
- Understanding how create_room, update_room, create_tag work
- Modifying endpoints-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/api/v1/endpoints/tasks.py` | assign_task, delete_task, get_assigned_tasks, get_task_history, patch_task (+9) |
| `app/api/v1/endpoints/tags.py` | create_tag, get_my_tags, update_tag, assign_tags_to_task, delete_tag (+1) |
| `app/api/v1/endpoints/tasks_ai.py` | clasificar_prioridad_batch, contiene_palabra_clave, prioritize, suggest_priority |
| `app/api/v1/endpoints/rooms.py` | create_room, update_room, get_rooms |
| `app/services/task_assignment.py` | assign_task, get_assigned_tasks |
| `app/api/v1/endpoints/users.py` | list_users |
| `app/db/session.py` | get_session |
| `app/api/v1/endpoints/auth.py` | get_me |
| `app/services/auth.py` | get_current_user |

## Entry Points

Start here when exploring this area:

- **`create_room`** (Function) — `app/api/v1/endpoints/rooms.py:27`
- **`update_room`** (Function) — `app/api/v1/endpoints/rooms.py:102`
- **`create_tag`** (Function) — `app/api/v1/endpoints/tags.py:17`
- **`get_my_tags`** (Function) — `app/api/v1/endpoints/tags.py:39`
- **`update_tag`** (Function) — `app/api/v1/endpoints/tags.py:170`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `create_room` | Function | `app/api/v1/endpoints/rooms.py` | 27 |
| `update_room` | Function | `app/api/v1/endpoints/rooms.py` | 102 |
| `create_tag` | Function | `app/api/v1/endpoints/tags.py` | 17 |
| `get_my_tags` | Function | `app/api/v1/endpoints/tags.py` | 39 |
| `update_tag` | Function | `app/api/v1/endpoints/tags.py` | 170 |
| `assign_task` | Function | `app/api/v1/endpoints/tasks.py` | 230 |
| `delete_task` | Function | `app/api/v1/endpoints/tasks.py` | 415 |
| `get_assigned_tasks` | Function | `app/api/v1/endpoints/tasks.py` | 248 |
| `get_task_history` | Function | `app/api/v1/endpoints/tasks.py` | 313 |
| `patch_task` | Function | `app/api/v1/endpoints/tasks.py` | 446 |
| `remove_task_assignment` | Function | `app/api/v1/endpoints/tasks.py` | 533 |
| `list_users` | Function | `app/api/v1/endpoints/users.py` | 12 |
| `get_session` | Function | `app/db/session.py` | 10 |
| `get_me` | Function | `app/api/v1/endpoints/auth.py` | 23 |
| `get_rooms` | Function | `app/api/v1/endpoints/rooms.py` | 68 |
| `assign_tags_to_task` | Function | `app/api/v1/endpoints/tags.py` | 53 |
| `delete_tag` | Function | `app/api/v1/endpoints/tags.py` | 94 |
| `remove_tag_from_task` | Function | `app/api/v1/endpoints/tags.py` | 116 |
| `create_task` | Function | `app/api/v1/endpoints/tasks.py` | 174 |
| `get_task` | Function | `app/api/v1/endpoints/tasks.py` | 344 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Prioritize → Generate_json` | cross_community | 4 |
| `Prioritize → _fallback_prioridad` | cross_community | 4 |
| `Get_me → Get_session` | cross_community | 3 |
| `Get_me → Decode_token` | cross_community | 3 |
| `Prioritize → Contiene_palabra_clave` | intra_community | 3 |
| `Suggest_priority → _fallback_prioridad` | cross_community | 3 |
| `Create_room → Get_session` | cross_community | 3 |
| `Create_room → Decode_token` | cross_community | 3 |
| `Get_rooms → Get_session` | cross_community | 3 |
| `Get_rooms → Decode_token` | cross_community | 3 |

## How to Explore

1. `context({name: "create_room"})` — see callers and callees
2. `query({search_query: "endpoints"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
