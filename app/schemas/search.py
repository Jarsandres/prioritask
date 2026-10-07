from pydantic import BaseModel, Field

from app.schemas.task import TaskRead


class SearchResultItem(BaseModel):
    task: TaskRead
    relevance_score: float = Field(..., description="Puntuación ponderada de relevancia")
    matched_fields: list[str] = Field(default_factory=list, description="Campos donde coincidió la búsqueda")


class TaskSearchResponse(BaseModel):
    total_matches: int = Field(..., description="Total de tareas que coinciden con la búsqueda")
    results: list[SearchResultItem] = Field(default_factory=list, description="Lista de resultados paginados")
