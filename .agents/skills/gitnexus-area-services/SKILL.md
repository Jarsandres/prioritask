---
name: gitnexus-area-services
description: "Skill for the Services area of prioritask. 18 symbols across 5 files."
---

# Services

18 symbols | 5 files | Cohesion: 91%

## When to Use

- Working with code in `app/`
- Understanding how login, refresh_token, register work
- Modifying services-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/services/auth.py` | create_access_token, create_refresh_token, create_user, decode_token, hash_password (+1) |
| `app/services/intelligence.py` | detect_group, group_tasks_mock, prioritize_tasks_mock, simple_priority_logic, rewrite_task_title (+1) |
| `app/api/v1/endpoints/auth.py` | login, refresh_token, register |
| `tests/unit/test_auth_service.py` | test_create_access_token_contains_sub_and_exp, test_hash_and_verify_password |
| `tests/conftest.py` | auth_headers |

## Entry Points

Start here when exploring this area:

- **`login`** (Function) — `app/api/v1/endpoints/auth.py:40`
- **`refresh_token`** (Function) — `app/api/v1/endpoints/auth.py:61`
- **`register`** (Function) — `app/api/v1/endpoints/auth.py:28`
- **`create_access_token`** (Function) — `app/services/auth.py:31`
- **`create_refresh_token`** (Function) — `app/services/auth.py:41`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `login` | Function | `app/api/v1/endpoints/auth.py` | 40 |
| `refresh_token` | Function | `app/api/v1/endpoints/auth.py` | 61 |
| `register` | Function | `app/api/v1/endpoints/auth.py` | 28 |
| `create_access_token` | Function | `app/services/auth.py` | 31 |
| `create_refresh_token` | Function | `app/services/auth.py` | 41 |
| `create_user` | Function | `app/services/auth.py` | 59 |
| `decode_token` | Function | `app/services/auth.py` | 51 |
| `hash_password` | Function | `app/services/auth.py` | 25 |
| `verify_password` | Function | `app/services/auth.py` | 28 |
| `auth_headers` | Function | `tests/conftest.py` | 76 |
| `test_create_access_token_contains_sub_and_exp` | Function | `tests/unit/test_auth_service.py` | 15 |
| `test_hash_and_verify_password` | Function | `tests/unit/test_auth_service.py` | 8 |
| `detect_group` | Function | `app/services/intelligence.py` | 22 |
| `group_tasks_mock` | Function | `app/services/intelligence.py` | 30 |
| `prioritize_tasks_mock` | Function | `app/services/intelligence.py` | 5 |
| `simple_priority_logic` | Function | `app/services/intelligence.py` | 6 |
| `rewrite_task_title` | Function | `app/services/intelligence.py` | 40 |
| `rewrite_tasks_mock` | Function | `app/services/intelligence.py` | 43 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Get_me → Decode_token` | cross_community | 3 |
| `Register → Hash_password` | intra_community | 3 |
| `Create_room → Decode_token` | cross_community | 3 |
| `Get_rooms → Decode_token` | cross_community | 3 |
| `Update_room → Decode_token` | cross_community | 3 |
| `Assign_tags_to_task → Decode_token` | cross_community | 3 |
| `Create_tag → Decode_token` | cross_community | 3 |
| `Delete_tag → Decode_token` | cross_community | 3 |
| `Get_my_tags → Decode_token` | cross_community | 3 |
| `Remove_tag_from_task → Decode_token` | cross_community | 3 |

## How to Explore

1. `context({name: "login"})` — see callers and callees
2. `query({search_query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
