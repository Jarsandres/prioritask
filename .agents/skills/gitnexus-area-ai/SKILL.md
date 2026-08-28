---
name: gitnexus-area-ai
description: "Skill for the AI area of prioritask. 9 symbols across 4 files."
---

# AI

9 symbols | 4 files | Cohesion: 70%

## When to Use

- Working with code in `app/`
- Understanding how group_tasks, agrupar_por_categoria, agrupar_tareas_por_similitud work
- Modifying ai-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `tests/unit/test_ai_services.py` | test_task_organizer_by_category, test_task_organizer_with_mocked_ollama, test_priority_classifier_fallback, test_priority_classifier_with_mocked_ollama |
| `app/services/AI/task_organizer.py` | agrupar_por_categoria, agrupar_tareas_por_similitud |
| `app/services/AI/priority_classifier.py` | _fallback_prioridad, clasificar_prioridad |
| `app/api/v1/endpoints/tasks_ai.py` | group_tasks |

## Entry Points

Start here when exploring this area:

- **`group_tasks`** (Function) — `app/api/v1/endpoints/tasks_ai.py:77`
- **`agrupar_por_categoria`** (Function) — `app/services/AI/task_organizer.py:6`
- **`agrupar_tareas_por_similitud`** (Function) — `app/services/AI/task_organizer.py:15`
- **`test_task_organizer_by_category`** (Function) — `tests/unit/test_ai_services.py:59`
- **`test_task_organizer_with_mocked_ollama`** (Function) — `tests/unit/test_ai_services.py:70`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `group_tasks` | Function | `app/api/v1/endpoints/tasks_ai.py` | 77 |
| `agrupar_por_categoria` | Function | `app/services/AI/task_organizer.py` | 6 |
| `agrupar_tareas_por_similitud` | Function | `app/services/AI/task_organizer.py` | 15 |
| `test_task_organizer_by_category` | Function | `tests/unit/test_ai_services.py` | 59 |
| `test_task_organizer_with_mocked_ollama` | Function | `tests/unit/test_ai_services.py` | 70 |
| `clasificar_prioridad` | Function | `app/services/AI/priority_classifier.py` | 14 |
| `test_priority_classifier_fallback` | Function | `tests/unit/test_ai_services.py` | 30 |
| `test_priority_classifier_with_mocked_ollama` | Function | `tests/unit/test_ai_services.py` | 22 |
| `_fallback_prioridad` | Function | `app/services/AI/priority_classifier.py` | 7 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Prioritize → Generate_json` | cross_community | 4 |
| `Prioritize → _fallback_prioridad` | cross_community | 4 |
| `Group_tasks → Agrupar_por_categoria` | intra_community | 3 |
| `Group_tasks → Generate_json` | cross_community | 3 |
| `Suggest_priority → _fallback_prioridad` | cross_community | 3 |
| `Suggest_priority → Generate_json` | cross_community | 3 |
| `Group_tasks → Get_session` | cross_community | 3 |
| `Group_tasks → Decode_token` | cross_community | 3 |

## How to Explore

1. `context({name: "group_tasks"})` — see callers and callees
2. `query({search_query: "ai"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
