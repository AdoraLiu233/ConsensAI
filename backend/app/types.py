from typing_extensions import Literal


MeetingLanguageType = Literal["Chinese", "English"]
AiType = Literal["graph", "document"]
RoleType = Literal["host", "participant"]
StatusType = Literal["processing", "finished"]


GuidanceKind = Literal["outline", "clarify", "intervention", "question_bank"]
