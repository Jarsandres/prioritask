from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.models.enums import RoomMemberRole
from tests.utils import create_user_and_token


@pytest.mark.asyncio
async def test_room_member_lifecycle_and_authorization(async_client: AsyncClient):
    # Setup users
    owner, owner_token = await create_user_and_token(async_client)
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    member_user, member_token = await create_user_and_token(async_client)
    member_headers = {"Authorization": f"Bearer {member_token}"}

    second_member, second_member_token = await create_user_and_token(async_client)
    second_member_headers = {"Authorization": f"Bearer {second_member_token}"}

    _stranger, stranger_token = await create_user_and_token(async_client)
    stranger_headers = {"Authorization": f"Bearer {stranger_token}"}

    # 1. Create a room
    room_resp = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": "Hogar Compartido"},
        headers=owner_headers,
    )
    assert room_resp.status_code == 201
    room_data = room_resp.json()
    room_id = room_data["id"]
    assert room_data["is_owner"] is True
    assert room_data["my_role"] == RoomMemberRole.ADMIN

    # 2. Stranger tries to add member to room -> 404 Not Found (Zero Trust IDOR)
    add_by_stranger = await async_client.post(
        f"/api/v1/rooms/{room_id}/members",
        json={"user_id": member_user["id"], "role": RoomMemberRole.MEMBER},
        headers=stranger_headers,
    )
    assert add_by_stranger.status_code == 404

    # 3. Add non-existent user -> 404 Not Found
    add_fake_user = await async_client.post(
        f"/api/v1/rooms/{room_id}/members",
        json={"user_id": str(uuid4()), "role": RoomMemberRole.MEMBER},
        headers=owner_headers,
    )
    assert add_fake_user.status_code == 404

    # 4. Attempt to add the owner as member -> 422 Unprocessable Entity
    add_owner = await async_client.post(
        f"/api/v1/rooms/{room_id}/members",
        json={"user_id": owner["id"], "role": RoomMemberRole.MEMBER},
        headers=owner_headers,
    )
    assert add_owner.status_code == 422

    # 5. Owner successfully adds member_user with role MEMBER -> 201 Created
    add_resp = await async_client.post(
        f"/api/v1/rooms/{room_id}/members",
        json={"user_id": member_user["id"], "role": RoomMemberRole.MEMBER},
        headers=owner_headers,
    )
    assert add_resp.status_code == 201
    added_data = add_resp.json()
    assert added_data["user_id"] == member_user["id"]
    assert added_data["room_id"] == room_id
    assert added_data["role"] == RoomMemberRole.MEMBER
    assert added_data["user_email"] == member_user["email"]

    # 6. Adding the same member again -> 422 Unprocessable Entity
    add_duplicate = await async_client.post(
        f"/api/v1/rooms/{room_id}/members",
        json={"user_id": member_user["id"], "role": RoomMemberRole.MEMBER},
        headers=owner_headers,
    )
    assert add_duplicate.status_code == 422

    # 7. MEMBER role tries to add second_member -> 403 Forbidden
    member_tries_add = await async_client.post(
        f"/api/v1/rooms/{room_id}/members",
        json={"user_id": second_member["id"], "role": RoomMemberRole.MEMBER},
        headers=member_headers,
    )
    assert member_tries_add.status_code == 403

    # 8. GET /rooms for member_user: must list the room with is_owner=False, my_role=MEMBER
    rooms_for_member = await async_client.get("/api/v1/rooms", headers=member_headers)
    assert rooms_for_member.status_code == 200
    member_rooms = rooms_for_member.json()
    assert len(member_rooms) == 1
    assert member_rooms[0]["id"] == room_id
    assert member_rooms[0]["is_owner"] is False
    assert member_rooms[0]["my_role"] == RoomMemberRole.MEMBER
    assert len(member_rooms[0]["members"]) == 1
    assert member_rooms[0]["members"][0]["user_id"] == member_user["id"]
    assert member_rooms[0]["members"][0]["user_email"] == member_user["email"]

    # 9. GET /rooms/{room_id}/members
    # Member can view list
    get_members_resp = await async_client.get(
        f"/api/v1/rooms/{room_id}/members",
        headers=member_headers,
    )
    assert get_members_resp.status_code == 200
    assert len(get_members_resp.json()) == 1

    # Stranger cannot view list -> 404 Not Found
    stranger_get_members = await async_client.get(
        f"/api/v1/rooms/{room_id}/members",
        headers=stranger_headers,
    )
    assert stranger_get_members.status_code == 404

    # 10. PATCH /rooms/{room_id}/members/{user_id}
    # MEMBER cannot update roles -> 403 Forbidden
    patch_by_member = await async_client.patch(
        f"/api/v1/rooms/{room_id}/members/{member_user['id']}",
        json={"role": RoomMemberRole.ADMIN},
        headers=member_headers,
    )
    assert patch_by_member.status_code == 403

    # Owner cannot alter their own role via member patch -> 422 Unprocessable Entity
    patch_owner = await async_client.patch(
        f"/api/v1/rooms/{room_id}/members/{owner['id']}",
        json={"role": RoomMemberRole.MEMBER},
        headers=owner_headers,
    )
    assert patch_owner.status_code == 422

    # Patch non-existent member -> 404 Not Found
    patch_fake = await async_client.patch(
        f"/api/v1/rooms/{room_id}/members/{uuid4()}",
        json={"role": RoomMemberRole.ADMIN},
        headers=owner_headers,
    )
    assert patch_fake.status_code == 404

    # Owner promotes member_user to ADMIN -> 200 OK
    promote_resp = await async_client.patch(
        f"/api/v1/rooms/{room_id}/members/{member_user['id']}",
        json={"role": RoomMemberRole.ADMIN},
        headers=owner_headers,
    )
    assert promote_resp.status_code == 200
    assert promote_resp.json()["role"] == RoomMemberRole.ADMIN

    # Now promoted member_user (ADMIN) adds second_member -> 201 Created
    add_second = await async_client.post(
        f"/api/v1/rooms/{room_id}/members",
        json={"user_id": second_member["id"], "role": RoomMemberRole.MEMBER},
        headers=member_headers,
    )
    assert add_second.status_code == 201

    # 11. DELETE /rooms/{room_id}/members/{user_id}
    # Attempting to delete owner -> 422 Unprocessable Entity
    del_owner = await async_client.delete(
        f"/api/v1/rooms/{room_id}/members/{owner['id']}",
        headers=owner_headers,
    )
    assert del_owner.status_code == 422

    # Second member (MEMBER) attempts to expel member_user (ADMIN) -> 403 Forbidden
    del_forbidden = await async_client.delete(
        f"/api/v1/rooms/{room_id}/members/{member_user['id']}",
        headers=second_member_headers,
    )
    assert del_forbidden.status_code == 403

    # member_user is the ONLY ADMIN in RoomMember -> attempting auto-elimination -> 422
    del_last_admin = await async_client.delete(
        f"/api/v1/rooms/{room_id}/members/{member_user['id']}",
        headers=member_headers,
    )
    assert del_last_admin.status_code == 422
    assert "administrador" in del_last_admin.json()["detail"].lower()

    # Second member auto-eliminates (leaves room) -> 204 No Content
    second_leave = await async_client.delete(
        f"/api/v1/rooms/{room_id}/members/{second_member['id']}",
        headers=second_member_headers,
    )
    assert second_leave.status_code == 204

    # Owner expels member_user -> 204 No Content (expulsion by owner is allowed even for last admin member)
    owner_expel = await async_client.delete(
        f"/api/v1/rooms/{room_id}/members/{member_user['id']}",
        headers=owner_headers,
    )
    assert owner_expel.status_code == 204

    # Verify no members remain
    final_members = await async_client.get(
        f"/api/v1/rooms/{room_id}/members",
        headers=owner_headers,
    )
    assert final_members.status_code == 200
    assert len(final_members.json()) == 0


@pytest.mark.asyncio
async def test_room_parent_id_filter_with_members(async_client: AsyncClient):
    _owner, token = await create_user_and_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Root room
    root = await async_client.post("/api/v1/rooms", json={"nombre": "Hogar Raiz"}, headers=headers)
    assert root.status_code == 201
    root_id = root.json()["id"]

    # Child room
    child = await async_client.post(
        "/api/v1/rooms",
        json={"nombre": "Habitacion Hija", "parent_id": root_id},
        headers=headers,
    )
    assert child.status_code == 201
    child_id = child.json()["id"]

    # Filter by parent_id
    filtered = await async_client.get(f"/api/v1/rooms?parent_id={root_id}", headers=headers)
    assert filtered.status_code == 200
    res = filtered.json()
    assert len(res) == 1
    assert res[0]["id"] == child_id
    assert res[0]["parent_id"] == root_id
