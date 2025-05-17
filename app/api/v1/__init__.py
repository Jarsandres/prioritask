from fastapi import APIRouter
from .endpoints import auth, rooms

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(rooms.router)