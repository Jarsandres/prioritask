from pathlib import Path

import pytest
from fastapi import HTTPException

from app.services.storage.local import LocalStorageAdapter
from app.services.storage.security import (
    sanitize_filename,
    validate_file_security,
)


def test_sanitize_filename_edge_cases():
    # Path traversal patterns
    assert sanitize_filename("../../../etc/passwd") == "passwd"
    assert sanitize_filename("..\\..\\windows\\system32\\cmd.exe") == "cmd.exe"

    # Spaces and special characters
    assert sanitize_filename("mi foto de vacaciones #1!?.png") == "mi_foto_de_vacaciones_1.png"

    # Empty or dots
    assert sanitize_filename("") == "archivo_adjunto"
    assert sanitize_filename("...") == "archivo_adjunto"

    # Very long filenames
    long_name = "a" * 200 + ".pdf"
    sanitized = sanitize_filename(long_name)
    assert len(sanitized) <= 150
    assert sanitized.endswith(".pdf")


def test_validate_file_security_valid_formats():
    # Valid JPEG
    jpeg_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00" + b"\x00" * 50
    mime = validate_file_security(jpeg_bytes, "photo.jpg")
    assert mime == "image/jpeg"

    # Valid PNG
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 50
    mime = validate_file_security(png_bytes, "chart.png")
    assert mime == "image/png"

    # Valid PDF
    pdf_bytes = b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n" + b"\x00" * 50
    mime = validate_file_security(pdf_bytes, "document.pdf")
    assert mime == "application/pdf"

    # Valid WebP
    webp_bytes = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 50
    mime = validate_file_security(webp_bytes, "image.webp")
    assert mime == "image/webp"


def test_validate_file_security_forbidden_formats():
    # Empty file
    with pytest.raises(HTTPException) as exc_info:
        validate_file_security(b"", "empty.txt")
    assert exc_info.value.status_code == 400

    # Oversized file (> 10 MB)
    large_sample = b"\xff\xd8\xff\xe0" + b"\x00" * 100
    with pytest.raises(HTTPException) as exc_info:
        validate_file_security(large_sample, "huge.jpg", max_size_bytes=50)
    assert exc_info.value.status_code == 413

    # SVG forbidden
    svg_sample = b"<?xml version='1.0'?><svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
    with pytest.raises(HTTPException) as exc_info:
        validate_file_security(svg_sample, "vector.svg")
    assert exc_info.value.status_code == 415

    # Windows PE Executable
    exe_sample = b"MZ\x90\x00\x03\x00\x00\x00" + b"\x00" * 50
    with pytest.raises(HTTPException) as exc_info:
        validate_file_security(exe_sample, "malware.exe")
    assert exc_info.value.status_code == 415

    # Linux ELF Executable
    elf_sample = b"\x7fELF\x02\x01\x01\x00" + b"\x00" * 50
    with pytest.raises(HTTPException) as exc_info:
        validate_file_security(elf_sample, "binary.bin")
    assert exc_info.value.status_code == 415

    # HTML disguised as image
    html_sample = b"<!DOCTYPE html><html><script>steal()</script></html>"
    with pytest.raises(HTTPException) as exc_info:
        validate_file_security(html_sample, "fake.png")
    assert exc_info.value.status_code == 415

    # Unsupported plain text or unknown format
    text_sample = b"Hello, this is just plain text content with no magic bytes."
    with pytest.raises(HTTPException) as exc_info:
        validate_file_security(text_sample, "notes.txt")
    assert exc_info.value.status_code == 415


@pytest.mark.asyncio
async def test_local_storage_adapter_lifecycle_and_traversal_prevention(tmp_path: Path):
    adapter = LocalStorageAdapter(base_dir=tmp_path)

    # 1. Save file
    file_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 20
    key, size = await adapter.save_file(file_bytes, "evidencia.png", "image/png")

    assert size == len(file_bytes)
    assert key.endswith(".png")
    assert "evidencia" not in key  # Desacoplamiento total con UUID

    # 2. Path resolution
    file_path = adapter.get_file_path(key)
    assert file_path.exists()
    assert file_path.read_bytes() == file_bytes

    # 3. Path Traversal Prevention
    with pytest.raises(ValueError, match="Path Traversal"):
        adapter.get_file_path("../evil.txt")

    with pytest.raises(ValueError, match="Path Traversal"):
        adapter.get_file_path("../../etc/passwd")

    with pytest.raises(ValueError, match="Path Traversal"):
        adapter.get_file_path("sub/../../traversal")

    # 4. Deletion
    assert await adapter.delete_file(key) is True
    assert not file_path.exists()
    assert await adapter.delete_file(key) is False  # Already deleted
    assert await adapter.delete_file("../evil.txt") is False  # Invalid key
