---
name: gitnexus-area-integration
description: "Skill for the Integration area of prioritask. 41 symbols across 9 files."
---

# Integration

41 symbols | 9 files | Cohesion: 61%

## When to Use

- Working with code in `tests/`
- Understanding how test_suggest_priority, test_login_invalid_password, test_get_rooms_and_update work
- Modifying integration-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `tests/integration/test_tasks.py` | test_get_task_history_returns_list, test_patch_task_status, test_task_not_found, test_create_and_get_task, test_delete_task_soft_delete (+3) |
| `tests/integration/test_sdet_security.py` | test_expired_token_returns_401, test_delete_other_user_task_returns_404, test_update_other_user_task_returns_404, test_get_soft_deleted_task_returns_404, test_update_soft_deleted_task_returns_404 (+3) |
| `tests/integration/test_task_filters.py` | test_get_tasks_pagination, test_get_tasks_filter_by_room, test_get_tasks_filter_by_search, test_history_date_range, test_history_filter_by_room (+1) |
| `tests/integration/test_rooms.py` | test_get_rooms_and_update, test_room_create_ok, test_room_create_with_parent_id, test_room_parent_filtering, test_room_unique_constraint |
| `tests/integration/test_ai_endpoints.py` | test_suggest_priority, test_group_tasks_real, test_prioritize_tasks_real, test_rewrite_tasks_real |
| `tests/integration/test_tags.py` | test_assign_and_remove_tags_for_task, test_create_tag, test_delete_tag, test_get_my_tags |
| `tests/integration/test_task_assignment.py` | test_assign_task, test_get_assigned_tasks, test_remove_task_assignment |
| `tests/utils.py` | create_user_and_token, create_task |
| `tests/integration/test_auth_endpoints.py` | test_login_invalid_password |

## Entry Points

Start here when exploring this area:

- **`test_suggest_priority`** (Function) — `tests/integration/test_ai_endpoints.py:74`
- **`test_login_invalid_password`** (Function) — `tests/integration/test_auth_endpoints.py:85`
- **`test_get_rooms_and_update`** (Function) — `tests/integration/test_rooms.py:73`
- **`test_room_create_ok`** (Function) — `tests/integration/test_rooms.py:11`
- **`test_room_create_with_parent_id`** (Function) — `tests/integration/test_rooms.py:27`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `test_suggest_priority` | Function | `tests/integration/test_ai_endpoints.py` | 74 |
| `test_login_invalid_password` | Function | `tests/integration/test_auth_endpoints.py` | 85 |
| `test_get_rooms_and_update` | Function | `tests/integration/test_rooms.py` | 73 |
| `test_room_create_ok` | Function | `tests/integration/test_rooms.py` | 11 |
| `test_room_create_with_parent_id` | Function | `tests/integration/test_rooms.py` | 27 |
| `test_room_parent_filtering` | Function | `tests/integration/test_rooms.py` | 97 |
| `test_room_unique_constraint` | Function | `tests/integration/test_rooms.py` | 54 |
| `test_assign_and_remove_tags_for_task` | Function | `tests/integration/test_tags.py` | 46 |
| `test_create_tag` | Function | `tests/integration/test_tags.py` | 9 |
| `test_delete_tag` | Function | `tests/integration/test_tags.py` | 34 |
| `test_get_my_tags` | Function | `tests/integration/test_tags.py` | 21 |
| `test_get_tasks_pagination` | Function | `tests/integration/test_task_filters.py` | 11 |
| `test_get_task_history_returns_list` | Function | `tests/integration/test_tasks.py` | 105 |
| `test_patch_task_status` | Function | `tests/integration/test_tasks.py` | 74 |
| `test_task_not_found` | Function | `tests/integration/test_tasks.py` | 119 |
| `create_user_and_token` | Function | `tests/utils.py` | 5 |
| `test_group_tasks_real` | Function | `tests/integration/test_ai_endpoints.py` | 35 |
| `test_prioritize_tasks_real` | Function | `tests/integration/test_ai_endpoints.py` | 8 |
| `test_rewrite_tasks_real` | Function | `tests/integration/test_ai_endpoints.py` | 55 |
| `test_assign_task` | Function | `tests/integration/test_task_assignment.py` | 8 |

## How to Explore

1. `context({name: "test_suggest_priority"})` — see callers and callees
2. `query({search_query: "integration"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
