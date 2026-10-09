import re
from pathlib import Path
from typing import Final

import filetype
from fastapi import HTTPException, status

ALLOWED_MIME_TYPES: Final[set[str]] = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
}

FORBIDDEN_SIGNATURES: Final[list[bytes]] = [
    b"MZ",  # Windows PE / EXE / DLL
    b"\x7fELF",  # Linux ELF
    b"<!doctype html",  # HTML
    b"<html",  # HTML
    b"<?xml",  # XML / SVG
    b"<svg",  # SVG
    b"#!/",  # Shell script shebang
]


def sanitize_filename(filename: str) -> str:
    """
    Sanitiza el nombre de archivo del cliente eliminando rutas, caracteres de control
    y caracteres especiales peligrosos para prevenir injection y path traversal.
    """
    if not filename:
        return "archivo_adjunto"

    # Extraer solo el nombre base sin directorios (Unix y Windows)
    normalized_filename = filename.replace("\\", "/")
    base_name = Path(normalized_filename).name

    # Eliminar caracteres no alfanuméricos seguros excepto guiones, guion bajo y punto
    sanitized = re.sub(r"[^\w\s\.-]", "", base_name).strip()

    # Reemplazar múltiples espacios o puntos consecutivos
    sanitized = re.sub(r"\s+", "_", sanitized)
    sanitized = re.sub(r"\.+", ".", sanitized)

    if not sanitized or sanitized == ".":
        sanitized = "archivo_adjunto"

    # Truncar a máximo 150 caracteres preservando la extensión
    if len(sanitized) > 150:
        ext = Path(sanitized).suffix
        sanitized = sanitized[: 150 - len(ext)] + ext

    return sanitized


def validate_file_security(
    file_bytes: bytes,
    filename: str,
    max_size_bytes: int = 10 * 1024 * 1024,
) -> str:
    """
    Inspección binaria Zero Trust (Magic Bytes) de los primeros 2048 bytes.
    Retorna el MIME type verificado de la whitelist.
    Lanza HTTPException con código apropiado (400, 413, 415) ante anomalías.
    """
    # 1. Validar que no esté vacío
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo proporcionado está vacío.",
        )

    # 2. Validar tamaño máximo individual
    if len(file_bytes) > max_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"El tamaño del archivo excede el límite máximo permitido ({max_size_bytes // (1024 * 1024)} MB).",
        )

    # 3. Comprobación expresa contra ejecutables y SVG / HTML
    sample_lower = file_bytes[:2048].lower()
    for sig in FORBIDDEN_SIGNATURES:
        if sig in sample_lower or file_bytes.startswith(sig):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Formato de archivo no permitido por políticas de seguridad (SVG o ejecutables prohibidos).",
            )

    # 4. Inspección de Magic Bytes con filetype
    kind = filetype.guess(file_bytes[:2048])
    detected_mime = kind.mime if kind else None

    # Fallback canónico para PDF estándar si filetype no lo detectó pero inicia con %PDF-
    if not detected_mime and file_bytes.startswith(b"%PDF-"):
        detected_mime = "application/pdf"

    # Fallback canónico para PNG estándar si inicia con la firma oficial PNG
    if not detected_mime and file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        detected_mime = "image/png"

    # Fallback canónico para JPEG si inicia con FFD8FF
    if not detected_mime and file_bytes.startswith(b"\xff\xd8\xff"):
        detected_mime = "image/jpeg"

    # Fallback canónico para WEBP (RIFF....WEBP)
    if (
        not detected_mime
        and len(file_bytes) >= 12
        and file_bytes[:4] == b"RIFF"
        and file_bytes[8:12] == b"WEBP"
    ):
        detected_mime = "image/webp"

    if not detected_mime or detected_mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                "Formato de archivo no admitido. Solo se admiten archivos de tipo: "
                "JPEG, PNG, WebP o PDF verificados binariamente."
            ),
        )

    return detected_mime
