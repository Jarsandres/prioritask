import re
from pathlib import Path
from typing import ClassVar
from uuid import uuid4

from app.core.config import settings
from app.services.storage.base import StoragePort


class LocalStorageAdapter(StoragePort):
    """
    Adaptador de almacenamiento local para archivos adjuntos.
    Garantiza aislamiento de nombres, UUID keys físicas y protección contra path traversal.
    """

    ALLOWED_EXTENSIONS: ClassVar[set[str]] = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}

    def __init__(self, base_dir: str | Path | None = None) -> None:
        self.base_dir = Path(base_dir or settings.UPLOAD_DIR).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _sanitize_extension(self, filename: str, content_type: str) -> str:
        """Extrae y sanitiza la extensión, fallback al MIME type si es inválida."""
        ext = Path(filename).suffix.lower()
        if ext in self.ALLOWED_EXTENSIONS:
            return ext

        mime_to_ext = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "application/pdf": ".pdf",
        }
        return mime_to_ext.get(content_type, "")

    def _resolve_and_verify_path(self, storage_key: str) -> Path:
        """
        Resuelve canónicamente la ruta del archivo y verifica que no escape de base_dir
        para prevenir vulnerabilidades de Path Traversal (CWE-22).
        """
        # Si storage_key contiene separadores o intentos de navegación directa
        if not storage_key or re.search(r"[/\\.]\.", storage_key):
            raise ValueError("Clave de almacenamiento inválida o intento de Path Traversal.")

        target_path = (self.base_dir / storage_key).resolve()

        if not target_path.is_relative_to(self.base_dir):
            raise ValueError("Intento de Path Traversal detectado fuera del directorio base.")

        return target_path

    def save_file(self, file_bytes: bytes, filename: str, content_type: str) -> tuple[str, int]:
        """
        Escribe los bytes en el sistema de archivos local bajo un nombre UUID opaco.
        Retorna (storage_key, file_size_bytes).
        """
        ext = self._sanitize_extension(filename, content_type)
        storage_key = f"{uuid4()}{ext}"
        target_path = self._resolve_and_verify_path(storage_key)

        target_path.write_bytes(file_bytes)
        return storage_key, len(file_bytes)

    def get_file_path(self, storage_key: str) -> Path:
        """
        Obtiene y verifica la ruta física canónica del archivo.
        """
        return self._resolve_and_verify_path(storage_key)

    def delete_file(self, storage_key: str) -> bool:
        """
        Elimina el archivo físico de forma segura.
        """
        try:
            target_path = self._resolve_and_verify_path(storage_key)
            if target_path.exists() and target_path.is_file():
                target_path.unlink()
                return True
        except (ValueError, OSError):
            return False
        return False
