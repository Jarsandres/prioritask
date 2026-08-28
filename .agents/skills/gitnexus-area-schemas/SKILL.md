---
name: gitnexus-area-schemas
description: "Skill for the Schemas area of prioritask. 5 symbols across 2 files."
---

# Schemas

5 symbols | 2 files | Cohesion: 100%

## When to Use

- Working with code in `app/`
- Understanding how UsuarioBase, UsuarioCreate, UsuarioRead work
- Modifying schemas-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/schemas/user.py` | UsuarioBase, UsuarioCreate, UsuarioRead |
| `app/schemas/room.py` | RoomBase, RoomCreate |

## Entry Points

Start here when exploring this area:

- **`UsuarioBase`** (Class) — `app/schemas/user.py:5`
- **`UsuarioCreate`** (Class) — `app/schemas/user.py:10`
- **`UsuarioRead`** (Class) — `app/schemas/user.py:13`
- **`RoomBase`** (Class) — `app/schemas/room.py:5`
- **`RoomCreate`** (Class) — `app/schemas/room.py:15`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `UsuarioBase` | Class | `app/schemas/user.py` | 5 |
| `UsuarioCreate` | Class | `app/schemas/user.py` | 10 |
| `UsuarioRead` | Class | `app/schemas/user.py` | 13 |
| `RoomBase` | Class | `app/schemas/room.py` | 5 |
| `RoomCreate` | Class | `app/schemas/room.py` | 15 |

## How to Explore

1. `context({name: "UsuarioBase"})` — see callers and callees
2. `query({search_query: "schemas"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
