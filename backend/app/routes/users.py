from fastapi import APIRouter
from app.models import UserResponse
from app.deps import UserDep


api_router = APIRouter()


# Keep checkLogin endpoint for compatibility, but it always returns success with anonymous user
@api_router.post("/api/checkLogin")
async def check_login(user: UserDep) -> UserResponse:
    return UserResponse(username=user.username)
