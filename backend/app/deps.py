from pydantic_socketio.fastapi_socketio import get_sio
from typing_extensions import Annotated
from fastapi import Body, Depends, HTTPException, status, Cookie
from fastapi.security import OAuth2PasswordBearer
from typing import Optional
from sqlmodel import Session

from app.core.db import engine
from app.core.user_manager import UserManager
from app.core.meeting_manager import MeetingManager
from app.core.attendee_manager import AttendeeManager
from app.models import Meeting, User
from app.core.sio.sio_server import SioServer
from app.utils.log import get_logger


# oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")  # No longer needed

_user_manager = UserManager(engine)
_meeting_manager = MeetingManager(engine)
_attendee_manager = AttendeeManager(engine)


def get_user_manager():
    return _user_manager


def get_meeting_manager():
    return _meeting_manager


def get_attendee_manager():
    return _attendee_manager


async def aget_user_manager():
    return _user_manager


async def aget_meeting_manager():
    return _meeting_manager


async def aget_attendee_manager():
    return _attendee_manager


UserManagerDep = Annotated[UserManager, Depends(aget_user_manager)]
MeetingManagerDep = Annotated[MeetingManager, Depends(aget_meeting_manager)]
AttendeeManagerDep = Annotated[AttendeeManager, Depends(aget_attendee_manager)]


async def get_meeting_post(
    meeting_manager: MeetingManagerDep,
    meeting_id: Annotated[Optional[str], Body(embed=True)] = None,
    meeting_hash_id: Annotated[Optional[str], Body(embed=True)] = None,
):
    if meeting_id:
        meeting = meeting_manager.getMeetingById(meeting_id)
    elif meeting_hash_id:
        meeting = meeting_manager.getMeetingByHashId(meeting_hash_id)
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="meeting_id or meeting_hash_id is required",
        )
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found"
        )
    return meeting


MeetingDepPost = Annotated[Meeting, Depends(get_meeting_post)]


async def get_meeting_agent(
    meeting: MeetingDepPost,
    meeting_manager: MeetingManagerDep,
):
    meeting_agent = meeting_manager.meeting_agents.get(str(meeting.meeting_id))
    if not meeting_agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Meeting agent not found"
        )
    return meeting_agent


MeetingAgentDep = Annotated[object, Depends(get_meeting_agent)]


# Create a default anonymous user for the system
# This allows the app to work without authentication
_anonymous_user: Optional[User] = None


async def get_anonymous_user(user_manager: UserManagerDep) -> User:
    """Get or create an anonymous user for unauthenticated access"""
    global _anonymous_user
    if _anonymous_user is None:
        try:
            # Try to get or create a default anonymous user
            anonymous_user = user_manager.getUserByUsername("anonymous")
            if anonymous_user is None:
                # Create anonymous user if it doesn't exist
                try:
                    with Session(engine) as session:
                        anonymous_user = User(username="anonymous", password="")
                        session.add(anonymous_user)
                        session.commit()
                        session.refresh(anonymous_user)
                        logger = get_logger()
                        logger.info(f"Created anonymous user with id: {anonymous_user.user_id}")
                except Exception as e:
                    # If creation fails, try to get again (might have been created by another request)
                    anonymous_user = user_manager.getUserByUsername("anonymous")
                    if anonymous_user is None:
                        logger = get_logger()
                        logger.error(f"Failed to create anonymous user: {e}")
                        raise Exception(f"Failed to create anonymous user: {e}")
            _anonymous_user = anonymous_user
        except Exception as e:
            # Log error and raise HTTP exception
            logger = get_logger()
            logger.error(f"Error getting anonymous user: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to initialize anonymous user: {str(e)}"
            )
    return _anonymous_user


DependsUser = Depends(get_anonymous_user)
UserDep = Annotated[User, DependsUser]
# UserDep = Depends(get_user_from_cookie)
# UserDep = Depends(get_current_user)


# async def verify_meeting_owner(user: UserDep, mid: int = Body(embed=True)):
#     if not meeting_manager.isMeetingOwner(mid, user.user_id):
#         raise HTTPException(status_code=401, detail="You are not the owner of this meeting")

# meetingOwnerDeps = Depends(verify_meeting_owner)

SioDep = Annotated[SioServer, Depends(get_sio)]
