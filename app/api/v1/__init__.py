from fastapi import APIRouter

from .endpoints import (
    attachments,
    auth,
    comments,
    gamification,
    rooms,
    subtasks,
    sync,
    tags,
    tasks,
    tasks_ai,
    todoist_import,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(rooms.router)
api_router.include_router(gamification.router)
api_router.include_router(tasks.router)
api_router.include_router(tasks.room_tasks_router)
api_router.include_router(sync.router)
api_router.include_router(subtasks.router)
api_router.include_router(comments.router)
api_router.include_router(attachments.router)
api_router.include_router(tags.router)
api_router.include_router(tasks_ai.router)
api_router.include_router(users.router)
api_router.include_router(todoist_import.router)


