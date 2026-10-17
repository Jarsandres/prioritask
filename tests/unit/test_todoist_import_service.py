"""Tests unitarios de los helpers puros del servicio de importación de Todoist."""

from datetime import UTC, datetime

import pytest

from app.services.todoist_import import (
    MAX_ENTITIES,
    MAX_NESTING_DEPTH,
    MAX_PAYLOAD_BYTES,
    normalize_title,
    parse_due_date,
    priority_to_peso,
    truncate,
    unique_name,
)


@pytest.mark.parametrize(
    ("priority", "expected"),
    [(1, 2.0), (2, 3.0), (3, 4.0), (4, 5.0), (0, 2.0), (-5, 2.0), (5, 5.0), (99, 5.0)],
)
def test_priority_to_peso_maps_to_canonical_scale(priority, expected):
    """Escala canónica 1..5 con P1=5: Todoist 4→5, 3→4, 2→3, 1→2."""
    assert priority_to_peso(priority) == expected


def test_priority_to_peso_is_monotonic_and_collision_free():
    values = [priority_to_peso(p) for p in (1, 2, 3, 4)]
    assert values == [2.0, 3.0, 4.0, 5.0]
    assert values == sorted(values)
    assert len(set(values)) == len(values)


def test_priority_to_peso_sends_todoist_p1_to_top_peso():
    """Una tarea urgente de Todoist (4) debe caer en el tope canónico (P1 = peso 5)."""
    assert priority_to_peso(4) == 5.0


@pytest.mark.parametrize("bad", [None, "abc", object()])
def test_priority_to_peso_invalid_defaults_to_lowest(bad):
    assert priority_to_peso(bad) == 2.0


def test_normalize_title_strips_and_rejects_short():
    assert normalize_title("  Comprar pan  ") == "Comprar pan"
    assert normalize_title("ab") is None
    assert normalize_title("") is None
    assert normalize_title(None) is None


def test_normalize_title_preserves_long_value_for_caller_truncation():
    long_title = "x" * 150
    assert len(normalize_title(long_title)) == 150


def test_truncate_keeps_within_limit():
    assert truncate("abcdef", 3) == "abc"
    assert truncate("abc", 10) == "abc"


def test_unique_name_returns_suffixed_variants():
    value, renamed = unique_name("Tarea", set(), 100)
    assert (value, renamed) == ("Tarea", False)

    value, renamed = unique_name("Tarea", {"Tarea"}, 100)
    assert (value, renamed) == ("Tarea (2)", True)

    value, renamed = unique_name("Tarea", {"Tarea", "Tarea (2)"}, 100)
    assert (value, renamed) == ("Tarea (3)", True)


def test_unique_name_respects_max_length():
    base = "y" * 100
    value, renamed = unique_name(base, {base}, 100)
    assert renamed is True
    assert len(value) <= 100
    assert value.endswith(" (2)")


def test_parse_due_date_handles_all_variants():
    assert parse_due_date("2026-01-02") == datetime(2026, 1, 2, tzinfo=UTC)
    assert parse_due_date("2026-01-02T10:30:00") == datetime(2026, 1, 2, 10, 30, tzinfo=UTC)
    assert parse_due_date("2026-01-02T10:30:00Z") == datetime(2026, 1, 2, 10, 30, tzinfo=UTC)
    assert parse_due_date("2026-01-02T11:30:00+01:00") == datetime(2026, 1, 2, 10, 30, tzinfo=UTC)


@pytest.mark.parametrize("bad", [None, "", "not-a-date", "2026-13-45"])
def test_parse_due_date_invalid_returns_none(bad):
    assert parse_due_date(bad) is None


def test_limits_are_positive_constants():
    assert MAX_PAYLOAD_BYTES > 0
    assert MAX_ENTITIES > 0
    assert MAX_NESTING_DEPTH > 0
