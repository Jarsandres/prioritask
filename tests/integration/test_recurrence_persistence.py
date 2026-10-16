from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlmodel import select

from app.models import RecurrenceFrequency, RecurrenceRule


async def _get_rule(session, task_id: str) -> RecurrenceRule:
    rules = (
        await session.exec(
            select(RecurrenceRule).where(RecurrenceRule.task_id == UUID(task_id))
        )
    ).all()
    assert len(rules) == 1
    return rules[0]


@pytest.mark.asyncio
async def test_create_task_persists_weekly_by_weekdays(
    async_client: AsyncClient, user_a_headers: dict[str, str], room_owner_a, session
):
    res = await async_client.post(
        "/api/v1/tasks",
        headers=user_a_headers,
        json={
            "titulo": f"Regar plantas {uuid4().hex[:6]}",
            "categoria": "OTRO",
            "peso": 2.0,
            "room_id": str(room_owner_a.id),
            "recurrence_rule": {"frequency": "WEEKLY", "interval": 1, "by_weekdays": [4, 1]},
        },
    )
    assert res.status_code == 201, res.text
    rule = await _get_rule(session, res.json()["id"])
    assert rule.frequency == RecurrenceFrequency.WEEKLY
    assert rule.by_weekdays == [1, 4]  # normalizado (ordenado)
    assert rule.next_due is not None


@pytest.mark.asyncio
async def test_create_task_persists_last_day_of_month(
    async_client: AsyncClient, user_a_headers: dict[str, str], room_owner_a, session
):
    res = await async_client.post(
        "/api/v1/tasks",
        headers=user_a_headers,
        json={
            "titulo": f"Cierre de mes {uuid4().hex[:6]}",
            "categoria": "OTRO",
            "peso": 3.0,
            "room_id": str(room_owner_a.id),
            "recurrence_rule": {"frequency": "MONTHLY", "is_last_day_of_month": True},
        },
    )
    assert res.status_code == 201, res.text
    rule = await _get_rule(session, res.json()["id"])
    assert rule.frequency == RecurrenceFrequency.MONTHLY
    assert rule.is_last_day_of_month is True


@pytest.mark.asyncio
async def test_create_task_persists_new_frequencies_workdays_and_yearly(
    async_client: AsyncClient, user_a_headers: dict[str, str], room_owner_a, session
):
    res_wd = await async_client.post(
        "/api/v1/tasks",
        headers=user_a_headers,
        json={
            "titulo": f"Dias laborables {uuid4().hex[:6]}",
            "categoria": "OTRO",
            "peso": 2.0,
            "room_id": str(room_owner_a.id),
            "recurrence_rule": {"frequency": "WORKDAYS"},
        },
    )
    assert res_wd.status_code == 201, res_wd.text
    rule_wd = await _get_rule(session, res_wd.json()["id"])
    assert rule_wd.frequency == RecurrenceFrequency.WORKDAYS

    res_y = await async_client.post(
        "/api/v1/tasks",
        headers=user_a_headers,
        json={
            "titulo": f"Anual {uuid4().hex[:6]}",
            "categoria": "OTRO",
            "peso": 2.0,
            "room_id": str(room_owner_a.id),
            "recurrence_rule": {"frequency": "YEARLY"},
        },
    )
    assert res_y.status_code == 201, res_y.text
    rule_y = await _get_rule(session, res_y.json()["id"])
    assert rule_y.frequency == RecurrenceFrequency.YEARLY


@pytest.mark.asyncio
async def test_by_weekdays_out_of_range_is_rejected(
    async_client: AsyncClient, user_a_headers: dict[str, str], room_owner_a
):
    res = await async_client.post(
        "/api/v1/tasks",
        headers=user_a_headers,
        json={
            "titulo": f"Bad weekday {uuid4().hex[:6]}",
            "categoria": "OTRO",
            "peso": 2.0,
            "room_id": str(room_owner_a.id),
            "recurrence_rule": {"frequency": "WEEKLY", "by_weekdays": [9]},
        },
    )
    assert res.status_code == 422, res.text
