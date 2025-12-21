from typing import Dict, List
import uuid
from pydantic import BaseModel, Field

from app.core.agent.models import Issue
from app.types import AiType, RoleType


class AsrSentence(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    content: str
    time_range: List[int]
    speaker_id: str
    is_final: bool = True


class SendAsrData(BaseModel):
    speaker: Dict[str, str]
    sentences: List[AsrSentence]


class TotalData(SendAsrData):
    meeting_id: str
    meeting_hash_id: str
    topic: str
    role: RoleType
    ai_type: AiType
    issue_map: List[Issue]


class AudioData(BaseModel):
    spk_id: str
    cnt: int
    meeting_id: str
    real_begin_ms: int
    real_end_ms: int
    duration_ms: int
    webm_base64: str
    pcm_path: str
    audio_data_path: str
