---
name: gitnexus-area-unit
description: "Skill for the Unit area of prioritask. 6 symbols across 4 files."
---

# Unit

6 symbols | 4 files | Cohesion: 71%

## When to Use

- Working with code in `tests/`
- Understanding how rewrite_tasks, generate_json, reformular_titulo_con_traduccion work
- Modifying unit-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `tests/unit/test_ai_services.py` | test_ollama_client_fallback_on_connection_error, test_reformulator_fallback, test_reformulator_with_mocked_ollama |
| `app/api/v1/endpoints/tasks_ai.py` | rewrite_tasks |
| `app/services/AI/ollama_client.py` | generate_json |
| `app/services/AI/reformulator.py` | reformular_titulo_con_traduccion |

## Entry Points

Start here when exploring this area:

- **`rewrite_tasks`** (Function) — `app/api/v1/endpoints/tasks_ai.py:106`
- **`generate_json`** (Function) — `app/services/AI/ollama_client.py:16`
- **`reformular_titulo_con_traduccion`** (Function) — `app/services/AI/reformulator.py:3`
- **`test_ollama_client_fallback_on_connection_error`** (Function) — `tests/unit/test_ai_services.py:15`
- **`test_reformulator_fallback`** (Function) — `tests/unit/test_ai_services.py:50`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `rewrite_tasks` | Function | `app/api/v1/endpoints/tasks_ai.py` | 106 |
| `generate_json` | Function | `app/services/AI/ollama_client.py` | 16 |
| `reformular_titulo_con_traduccion` | Function | `app/services/AI/reformulator.py` | 3 |
| `test_ollama_client_fallback_on_connection_error` | Function | `tests/unit/test_ai_services.py` | 15 |
| `test_reformulator_fallback` | Function | `tests/unit/test_ai_services.py` | 50 |
| `test_reformulator_with_mocked_ollama` | Function | `tests/unit/test_ai_services.py` | 41 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Prioritize → Generate_json` | cross_community | 4 |
| `Group_tasks → Generate_json` | cross_community | 3 |
| `Rewrite_tasks → Generate_json` | intra_community | 3 |
| `Suggest_priority → Generate_json` | cross_community | 3 |
| `Rewrite_tasks → Get_session` | cross_community | 3 |
| `Rewrite_tasks → Decode_token` | cross_community | 3 |

## How to Explore

1. `context({name: "rewrite_tasks"})` — see callers and callees
2. `query({search_query: "unit"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
