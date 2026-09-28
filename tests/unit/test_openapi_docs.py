from app.main import app, tags_metadata


def test_openapi_tags_metadata_configured():
    tag_names = [tag["name"] for tag in tags_metadata]
    assert "Autenticación y Sesiones" in tag_names
    assert "Hogar" in tag_names
    assert "Gestión de tareas" in tag_names
    assert "Tareas con IA" in tag_names
    assert "Etiquetas" in tag_names
    assert "Usuarios (Admin)" in tag_names

    # All tags should have rich descriptions
    for tag in tags_metadata:
        assert "description" in tag and len(tag["description"]) > 10


def test_openapi_security_schemes_and_authorize_button():
    # Force schema generation
    app.openapi_schema = None
    schema = app.openapi()

    assert "components" in schema
    assert "securitySchemes" in schema["components"]
    security_schemes = schema["components"]["securitySchemes"]

    assert "HTTPBearer" in security_schemes or "bearerAuth" in security_schemes

    bearer = security_schemes.get("HTTPBearer") or security_schemes.get("bearerAuth")
    assert bearer["type"] == "http"
    assert bearer["scheme"] == "bearer"

    assert "security" in schema
    assert any("bearerAuth" in req or "HTTPBearer" in req for req in schema["security"])
