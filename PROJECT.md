# Project: Prioritask RBAC and Contextual Authorization

## Architecture
Prioritask is a FastAPI-based task management application with SQLModel (SQLAlchemy async + Pydantic) on SQLite/PostgreSQL.
The Authorization Architecture incorporates two distinct layers:
1. **Global Role-Based Access Control (RBAC)**:
   - Roles: `ADMIN` vs `USER` (Standard User).
   - Embedded in `Usuario` model (`is_superuser: bool`, `@property role: UserRole`), `UsuarioRead` schema, and encoded in JWT tokens (`is_superuser`, `role`).
   - Guarded via `get_current_admin_user` dependency in FastAPI endpoints (e.g. `GET /api/v1/users`).
2. **Contextual Resource Authorization (Owner vs Collaborator vs Non-Member)**:
   - **Rooms**: Strictly owned by `Room.owner_id`. Room operations (`PUT`, `DELETE`, `GET .../tasks`, `POST .../rooms` parent_id) enforce ownership or return `404 Not Found` for tenant isolation.
   - **Tasks**: Owned by `Task.user_id` (Room/Task Owner), linked to `Room.id`. Collaborators are associated via `TaskAssignment(task_id, user_id, asignado_por)`.
   - **Task Operations Matrix**:
     - `GET /tasks/{task_id}`: Owner (200), Collaborator (200), Non-Member (403), Deleted (404).
     - `PUT /tasks/{task_id}` / `PATCH /tasks/{task_id}`: Owner (200), Collaborator (200), Non-Member (404), Deleted (404).
     - `PATCH /tasks/{task_id}/status`: Owner (200), Collaborator (200), Non-Member (404), Deleted (404).
     - `DELETE /tasks/{task_id}`: Owner (204), Collaborator (403), Non-Member (404), Deleted (404).
     - `POST /tasks/assign`: Owner (201), Collaborator (403), Non-Member (404/403).
     - `GET /tasks/assigned/{user_id}`: Self/Admin (200), Unrelated User (403).
     - `DELETE /tasks/{task_id}/assignees/{user_id}`: Owner/Self-Unassign (204), Unrelated User (403).
3. **Safe Exception Handling & Tenant Isolation**:
   - Return standard `HTTPException(status_code=403, detail="...")` and `HTTPException(status_code=404, detail="...")` without internal database traceback or information leakage.
   - Partial unique indexes (`unique_user_active_task_title` where `deleted_at IS NULL`) and unique constraints (`uq_room_nombre_owner`) preserved.
4. **Household Membership Layer (RoomMember)**:
   - Roles: `ADMIN` vs `MEMBER` (within a household/Room context).
   - Managed via `RoomMember` join table with composite PK `(user_id, room_id)` and `joined_at` timestamp.
   - Default role is `MEMBER` to prevent privilege escalation on membership creation.
   - Enables future endpoint authorization: `RoomMember.role == ADMIN` required for member management operations.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | `UserRole` Enum & Model Property | Define `UserRole(ADMIN, USER)` in `enums.py`, export in `models/__init__.py`, `@property role` on `Usuario` | M1 | Survey 1 |
| F2 | User Schemas Role Exposure | Update `UsuarioRead` to include `is_superuser: bool` and `role: UserRole`, preserve `UsuarioCreate` security | M1 | Survey 1 |
| F3 | JWT Token Role Claims | Update `create_access_token` to encode `is_superuser` and `role` claims, pass claims in `login` and `refresh_token` | M1 | Survey 1 |
| F4 | Admin Authorization Dependency | Implement `get_current_admin_user` and `require_role` in `app/services/auth.py` raising HTTP 403 for non-admins | M1 | Survey 1 |
| F5 | Admin User Listing Protection | Protect `GET /api/v1/users` with `Depends(get_current_admin_user)` returning 200 to Admin, 403 to Standard User, 401 to Anonymous | M1 | Survey 1 |
| F6 | Room Ownership & Tenant Isolation | Add `DELETE /api/v1/rooms/{id}`, validate `parent_id` ownership on `POST /rooms`, return 404 for unowned rooms | M2 | Survey 2 |
| F7 | Task Creation Room Ownership Check | Verify `payload.room_id` belongs to `current_user.id` on `POST /tasks`, return 404 if unowned | M2 | Survey 2 |
| F8 | Contextual Task Access Helper | Implement `_get_task_with_access` resolving Owner vs Collaborator vs Non-Member vs Deleted | M2 | Survey 2 |
| F9 | Task Read & Update for Collaborators | Allow assigned collaborators to read (`GET /tasks/{id}`) and update (`PUT`, `PATCH`, `PATCH .../status`), block non-members | M2 | Survey 2 |
| F10 | Task Deletion & Assignment Security | Restrict soft deletion to Owner (403 for Collaborator, 404 for Non-Member), secure `POST /tasks/assign` and `DELETE .../assignees/{user_id}` | M2 | Survey 2 |
| F11 | Assigned Tasks IDOR Protection | Guard `GET /api/v1/tasks/assigned/{user_id}` against cross-user unauthorized queries | M2 | Survey 2 |
| F12 | Security Test Fixtures | Add `admin_user`, `admin_headers`, `user_a`, `user_a_headers`, `user_b`, `user_b_headers`, `user_c`, `user_c_headers`, `room_owner_a`, `task_assigned_b` in `tests/conftest.py` | M-TEST | Survey 3 |
| F13 | Automated Security Test Suite | Implement `tests/integration/test_security_rbac.py` with 4 test classes covering full RBAC matrix | M-TEST | Survey 3 |
| F14 | End-to-End Regression Verification | Run full test suite (all 58 existing tests + new security tests) with zero failures and zero regressions | M3 | All |
| F15 | RoomMember Model & RoomMemberRole Enum | many-to-many join table between Usuario and Room with role-based membership control | M4-DB | Sprint DB |
| F16 | Task.is_recurring Field | Boolean field for recurring task support, AI-engine ready | M4-DB | Sprint DB |
| F17 | Bidirectional ORM Relationships | `Usuario.rooms_member`, `Room.tasks`, `Room.members`, `Task.room` with TYPE_CHECKING guards | M4-DB | Sprint DB |
| F18 | Alembic Migration: RoomMember + is_recurring | Non-destructive autogenerated migration with SQLite batch_alter compatibility | M4-DB | Sprint DB |
| F19 | Persistence Tests: RoomMember & Task | Async pytest tests validating membership and task lifecycle | M4-DB | Sprint DB |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Global RBAC & Admin Endpoints | F1, F2, F3, F4, F5 | none | DONE |
| M2 | Contextual Room/Task Permissions & Isolation | F6, F7, F8, F9, F10, F11 | M1 | DONE |
| M-TEST | E2E Security Test Suite Track | F12, F13 | none | DONE |
| M3 | Final Integration & Adversarial Verification | F14, Full Test Suite, Forensic Audit | M1, M2, M-TEST | DONE |
| M4-DB | Collaborative Household Core DB | F15, F16, F17, F18, F19 | M1, M2, M-TEST | DONE |

---

## Interface Contracts

### 1. `app.models.enums` ↔ `app.models.user` ↔ `app.schemas.user`
```python
class UserRole(str, Enum):
    ADMIN = "ADMIN"
    USER = "USER"

# On Usuario model:
@property
def role(self) -> UserRole:
    return UserRole.ADMIN if self.is_superuser else UserRole.USER

# On UsuarioRead schema:
is_superuser: bool = Field(default=False)
role: UserRole = Field(default=UserRole.USER)
```

### 2. `app.services.auth` ↔ `app.api.v1.endpoints.*`
```python
def create_access_token(
    sub: UUID | str,
    secret: str,
    *,
    expires_minutes: int = 60,
    is_superuser: bool = False,
    role: str = "USER",
) -> str: ...

async def get_current_admin_user(
    current_user: Usuario = Depends(get_current_user),
) -> Usuario: ...
```

### 3. Contextual Task Access Contract (`app.api.v1.endpoints.tasks`)
```python
async def _get_task_with_access(
    session: AsyncSession,
    task_id: UUID,
    current_user: Usuario,
    allow_collaborator: bool = True,
) -> tuple[Task, bool]:
    # Returns (task, is_owner)
    # Raises HTTPException(404) if not found or soft-deleted
    # Raises HTTPException(403) if unauthorized
```

---

## Code Layout
- `app/models/enums.py`: `UserRole` enum definition
- `app/models/__init__.py`: Export `UserRole`
- `app/models/user.py`: `Usuario.role` property
- `app/schemas/user.py`: `UsuarioRead` schema updates
- `app/services/auth.py`: `create_access_token` claims, `get_current_admin_user`, `require_role`
- `app/api/v1/endpoints/auth.py`: `login`, `refresh` token generation with role claims
- `app/api/v1/endpoints/users.py`: `GET /api/v1/users` protected with `get_current_admin_user`
- `app/api/v1/endpoints/rooms.py`: `DELETE /rooms/{id}`, `parent_id` validation
- `app/api/v1/endpoints/tasks.py`: Contextual access on task CRUD, status patch, assignment management
- `app/services/task_assignment.py`: Owner-only assignment enforcement
- `tests/conftest.py`: Security test fixtures (admin, user_a, user_b, user_c, room, task assignment)
- `tests/integration/test_security_rbac.py`: Automated Security Test Suite
- `app/models/room_member.py`: `RoomMember` join table model
- `app/models/enums.py`: `RoomMemberRole` enum (ADMIN/MEMBER)
- `app/db/migrations/versions/75cee56d2723_add_roommember_and_task_models.py`: Alembic migration
- `tests/unit/test_room_member_persistence.py`: Async persistence tests for RoomMember and Task lifecycle
