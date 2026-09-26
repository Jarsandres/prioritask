import pytest
from sqlalchemy.orm import selectinload
from sqlmodel import select

from app.models import (
    CategoriaTarea,
    EstadoTarea,
    Room,
    RoomMember,
    RoomMemberRole,
    Task,
    TaskAssignment,
    Usuario,
)


@pytest.mark.asyncio
async def test_room_member_multiple_membership(session):
    """Verifica la persistencia de membresías múltiples en un Room (RoomMember)

    y la navegación bidireccional de relaciones entre Room y Usuario.
    """
    # 1. Crear un Usuario propietario y un Room vinculado a ese propietario
    owner = Usuario(
        email="owner@example.com",
        nombre="Owner User",
        hashed_password="hashed_password_owner",
    )
    session.add(owner)
    await session.commit()
    await session.refresh(owner)

    room = Room(nombre="Sala de Proyectos", owner_id=owner.id)
    session.add(room)
    await session.commit()
    await session.refresh(room)

    # 2. Crear dos instancias de Usuario adicionales (miembros)
    member_admin = Usuario(
        email="admin_member@example.com",
        nombre="Admin Member",
        hashed_password="hashed_password_admin",
    )
    member_regular = Usuario(
        email="regular_member@example.com",
        nombre="Regular Member",
        hashed_password="hashed_password_regular",
    )
    session.add_all([member_admin, member_regular])
    await session.commit()
    await session.refresh(member_admin)
    await session.refresh(member_regular)

    # 3. Crear dos registros de RoomMember vinculando a ambos usuarios con el Room
    room_member_admin = RoomMember(
        room_id=room.id,
        user_id=member_admin.id,
        role=RoomMemberRole.ADMIN,
    )
    room_member_regular = RoomMember(
        room_id=room.id,
        user_id=member_regular.id,
        role=RoomMemberRole.MEMBER,
    )
    session.add_all([room_member_admin, room_member_regular])
    await session.commit()

    # 4. Cargar el Room con su relación de miembros
    stmt_room = (
        select(Room)
        .where(Room.id == room.id)
        .options(selectinload(Room.members))
    )
    result_room = await session.exec(stmt_room)
    loaded_room = result_room.one()

    # 5. Verificar que room.members contiene a los 2 miembros creados
    assert len(loaded_room.members) == 2
    members_by_user_id = {m.user_id: m.role for m in loaded_room.members}
    assert member_admin.id in members_by_user_id
    assert members_by_user_id[member_admin.id] == RoomMemberRole.ADMIN
    assert member_regular.id in members_by_user_id
    assert members_by_user_id[member_regular.id] == RoomMemberRole.MEMBER

    # 6. Desde cada Usuario, verificar que su relación rooms_member refleja la pertenencia al Room
    stmt_admin = (
        select(Usuario)
        .where(Usuario.id == member_admin.id)
        .options(selectinload(Usuario.rooms_member))
    )
    result_admin = await session.exec(stmt_admin)
    loaded_admin = result_admin.one()
    assert len(loaded_admin.rooms_member) == 1
    assert loaded_admin.rooms_member[0].room_id == room.id
    assert loaded_admin.rooms_member[0].role == RoomMemberRole.ADMIN

    stmt_regular = (
        select(Usuario)
        .where(Usuario.id == member_regular.id)
        .options(selectinload(Usuario.rooms_member))
    )
    result_regular = await session.exec(stmt_regular)
    loaded_regular = result_regular.one()
    assert len(loaded_regular.rooms_member) == 1
    assert loaded_regular.rooms_member[0].room_id == room.id
    assert loaded_regular.rooms_member[0].role == RoomMemberRole.MEMBER


@pytest.mark.asyncio
async def test_task_room_link_assignment_and_done_status(session):
    """Verifica la persistencia de Task vinculada a Room, asignación mediante

    TaskAssignment y actualización de estado a DONE.
    """
    # 1. Crear un Usuario y un Room
    user = Usuario(
        email="task_user@example.com",
        nombre="Task User",
        hashed_password="hashed_password_task",
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    room = Room(nombre="Sala de Tareas", owner_id=user.id)
    session.add(room)
    await session.commit()
    await session.refresh(room)

    # 2. Crear una Task vinculada a ese Room (room_id=room.id, user_id=user.id, estado=EstadoTarea.TODO)
    task = Task(
        titulo="Tarea de prueba de persistencia",
        descripcion="Descripción de prueba para verificar persistencia en Room",
        categoria=CategoriaTarea.LIMPIEZA,
        estado=EstadoTarea.TODO,
        user_id=user.id,
        room_id=room.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    # 3. Asignar la tarea al usuario (mediante TaskAssignment vinculando task_id y user_id)
    assignment = TaskAssignment(
        task_id=task.id,
        user_id=user.id,
        asignado_por=user.id,
    )
    session.add(assignment)
    await session.commit()

    # 4. Modificar el estado de la tarea a EstadoTarea.DONE y guardar cambios
    task.estado = EstadoTarea.DONE
    session.add(task)
    await session.commit()

    # 5. Consultar la tarea y el Room desde la base de datos
    stmt_task = (
        select(Task)
        .where(Task.id == task.id)
        .options(selectinload(Task.colaboradores))
    )
    result_task = await session.exec(stmt_task)
    loaded_task = result_task.one()

    stmt_room = (
        select(Room)
        .where(Room.id == room.id)
        .options(selectinload(Room.tasks))
    )
    result_room = await session.exec(stmt_room)
    loaded_room = result_room.one()

    # 6. Verificar:
    # - task.estado == EstadoTarea.DONE
    assert loaded_task.estado == EstadoTarea.DONE

    # - room.tasks contiene la tarea creada
    assert any(t.id == task.id for t in loaded_room.tasks)
    matched_task = next(t for t in loaded_room.tasks if t.id == task.id)
    assert matched_task.estado == EstadoTarea.DONE

    # - La relación TaskAssignment está debidamente persistida y asociada
    assert len(loaded_task.colaboradores) == 1
    assert loaded_task.colaboradores[0].task_id == task.id
    assert loaded_task.colaboradores[0].user_id == user.id
    assert loaded_task.colaboradores[0].asignado_por == user.id

    # Verificación adicional directa desde el modelo TaskAssignment
    stmt_assignment = (
        select(TaskAssignment)
        .where(TaskAssignment.task_id == task.id, TaskAssignment.user_id == user.id)
    )
    result_assignment = await session.exec(stmt_assignment)
    loaded_assignment = result_assignment.one()
    assert loaded_assignment.task_id == task.id
    assert loaded_assignment.user_id == user.id
    assert loaded_assignment.asignado_por == user.id
