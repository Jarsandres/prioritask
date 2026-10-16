from app.api.v1.endpoints.sync import (
    _REFERENCE_FIELDS,
    resolve_references,
)


class TestResolveReferencesRegistry:
    def test_registry_covers_task_scoped_mutation_commands(self):
        for cmd_type in (
            "task_update",
            "task_delete",
            "task_complete",
            "task_uncomplete",
            "task_schedule_reminder",
        ):
            assert cmd_type in _REFERENCE_FIELDS
            assert "id" in _REFERENCE_FIELDS[cmd_type]
            assert "task_id" in _REFERENCE_FIELDS[cmd_type]


class TestResolveReferences:
    def test_rewrites_scalar_reference(self):
        mapping = {"temp_parent": "11111111-1111-1111-1111-111111111111"}
        out = resolve_references({"id": "temp_parent", "peso": 3.0}, ("id", "task_id"), mapping)
        assert out == {
            "id": "11111111-1111-1111-1111-111111111111",
            "peso": 3.0,
        }

    def test_rewrites_nested_dict_and_list_references(self):
        mapping = {"temp_parent": "p-uuid", "temp_tag": "t-uuid"}
        args = {
            "task_id": "temp_parent",
            "etiquetas": [{"tag_id": "temp_tag"}, {"tag_id": "real-tag"}],
        }
        out = resolve_references(args, ("task_id", "tag_id"), mapping)
        assert out["task_id"] == "p-uuid"
        assert out["etiquetas"] == [{"tag_id": "t-uuid"}, {"tag_id": "real-tag"}]

    def test_rewrites_list_of_string_ids_under_reference_key(self):
        mapping = {"temp_a": "real-a", "temp_b": "real-b"}
        out = resolve_references({"tag_ids": ["temp_a", "temp_b", "real-c"]}, ("tag_ids",), mapping)
        assert out == {"tag_ids": ["real-a", "real-b", "real-c"]}

    def test_leaves_unknown_and_non_reference_keys_untouched(self):
        args = {"id": "temp_unmapped", "titulo": "temp_unmapped"}
        out = resolve_references(args, ("id",), {})
        assert out == {"id": "temp_unmapped", "titulo": "temp_unmapped"}

    def test_does_not_mutate_input(self):
        args = {"id": "temp_parent", "nested": {"task_id": "temp_parent"}}
        resolve_references(args, ("id", "task_id"), {"temp_parent": "p-uuid"})
        assert args == {"id": "temp_parent", "nested": {"task_id": "temp_parent"}}
