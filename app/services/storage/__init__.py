from functools import lru_cache

from .base import StoragePort
from .local import LocalStorageAdapter
from .security import ALLOWED_MIME_TYPES, sanitize_filename, validate_file_security


@lru_cache(maxsize=1)
def get_storage_adapter() -> StoragePort:
    """Retorna la instancia singleton del adaptador de almacenamiento configurado."""
    return LocalStorageAdapter()


__all__ = [
    "ALLOWED_MIME_TYPES",
    "LocalStorageAdapter",
    "StoragePort",
    "get_storage_adapter",
    "sanitize_filename",
    "validate_file_security",
]
