from abc import ABC, abstractmethod
from pathlib import Path


class StoragePort(ABC):
    """
    Puerto hexagonal para el almacenamiento de archivos (evidencias / adjuntos).
    Permite desacoplar el almacenamiento físico (local, S3, etc.) de la lógica de dominio.
    """

    @abstractmethod
    def save_file(self, file_bytes: bytes, filename: str, content_type: str) -> tuple[str, int]:
        """
        Guarda el contenido binario del archivo.
        Retorna (storage_key, size_bytes).
        """

    @abstractmethod
    def get_file_path(self, storage_key: str) -> Path:
        """
        Retorna la ruta física canónica del archivo correspondiente a storage_key.
        Debe prevenir cualquier intento de path traversal.
        """

    @abstractmethod
    def delete_file(self, storage_key: str) -> bool:
        """
        Elimina físicamente el archivo si existe. Retorna True si fue eliminado o False si no existía.
        """

