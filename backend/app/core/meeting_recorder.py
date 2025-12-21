from datetime import datetime
from pathlib import Path
from typing import Deque, Dict, List
import asyncio
import copy
import logging
import uuid

from app.core.asr.models import AsrSentence
from app.core.asr.qwen_realtime import QwenRealtimeASR
from app.config import settings
from app.types import MeetingLanguageType

logger = logging.getLogger(__name__)


# NOTE participant不包括host
# NOTE total_asr 不包括 current_asr
# NOTE total_pcm 不包括 current_pcm
class MeetingRecorder:
    def __init__(
        self,
        meeting_id: str,
        meeting_language: MeetingLanguageType,
        create_time: datetime,
        meeting_root_path: Path,
    ):
        self.meeting_id = meeting_id
        self.meeting_language: MeetingLanguageType = meeting_language
        self.create_time = create_time
        self.trigger_event = asyncio.Event()
        self.pcm_root_path = meeting_root_path / "pcm"

        self.current_asr: List[AsrSentence] = []  # 待发送给前端的asr
        self.current_asr_lock = asyncio.Lock()

        self.total_asr: List[AsrSentence] = []
        self.total_asr_lock = asyncio.Lock()

        # Manage ASR tasks and queues per speaker
        self.asr_queues: Dict[str, asyncio.Queue] = {}
        self.asr_tasks: Dict[str, asyncio.Task] = {}
        self.asr_clients: Dict[
            str, QwenRealtimeASR
        ] = {}  # Keep track to close if needed

        # 如果 client 还没建立好连接，但数据已经来了，就先buffer住
        # With new architecture, we put into queue immediately.
        self.buffer_dict: Dict[str, Deque[bytes]] = {}
        self.lock_dict: Dict[str, asyncio.Lock] = {}

    async def get_total_asr(self) -> List[AsrSentence]:
        async with self.total_asr_lock:
            total_asr = copy.deepcopy(self.total_asr)
        return total_asr

    async def get_current(self) -> List[AsrSentence]:
        async with self.current_asr_lock:
            current_asr = copy.deepcopy(self.current_asr)
        return current_asr

    async def step(self):
        # 将current_asr中已完成的句子加入total_asr
        async with self.total_asr_lock:
            async with self.current_asr_lock:
                # Filter finished sentences to move to total
                # Keep unfinished sentences in current
                finished_sentences = [s for s in self.current_asr if s.is_final]
                active_sentences = [s for s in self.current_asr if not s.is_final]

                if finished_sentences:
                    self.total_asr.extend(finished_sentences)
                    self.current_asr = active_sentences
                    # 按照起始时间排序
                    self.total_asr.sort(key=lambda x: x.time_range[0])
                    # Ensure current_asr is also sorted just in case
                    self.current_asr.sort(key=lambda x: x.time_range[0])

    async def send_audio_chunk(self, speaker_id: str, chunk: bytes):
        # Ensure queue exists
        # If not explicitly toggled on, we might auto-create if robust,
        # but better stick to toggle_mic logic.
        if speaker_id in self.asr_queues:
            # logger.info(f"Queuing audio chunk for speaker {speaker_id}, size={len(chunk)}")
            await self.asr_queues[speaker_id].put(chunk)
        else:
            pass
            # logger.debug(f"Dropped audio chunk for speaker {speaker_id} (not active)")

    async def close_asr_tasks(self):
        for spk_id, q in self.asr_queues.items():
            await q.put(None)  # Signal end

        # Wait for tasks to cancel/finish
        for task in self.asr_tasks.values():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        self.asr_queues.clear()
        self.asr_tasks.clear()
        # Close clients explicitly
        for client in self.asr_clients.values():
            await client.close()
        self.asr_clients.clear()

    async def _process_asr_stream(self, speaker_id: str, queue: asyncio.Queue):
        async def audio_generator():
            while True:
                chunk = await queue.get()
                if chunk is None:
                    break
                yield chunk

        # Use config for Qwen
        api_key = settings.dashscope_api_key
        # Check if URL is in settings or use default
        ws_url = (
            settings.qwen_asr_ws_url
            or "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime"
        )

        client = QwenRealtimeASR(
            api_key=api_key,
            url=ws_url,
            sample_rate=settings.asr_sample_rate,
            enable_vad=settings.asr_enable_vad,
        )
        self.asr_clients[speaker_id] = client

        try:
            logger.info(f"Starting ASR stream processing for speaker {speaker_id}")
            async for result in client.transcribe_stream(audio_generator()):
                text = result.get("text", "")
                is_final = result.get("is_final", False)
                # Timestamp handling could be improved if Qwen provides it

                logger.info(
                    f"ASR result for {speaker_id}: text='{text}', is_final={is_final}"
                )

                if not text:
                    continue

                current_time_ms = int(
                    (datetime.now() - self.create_time).total_seconds() * 1000
                )

                async with self.current_asr_lock:
                    # Find active sentence for this speaker
                    active_idx = -1
                    for i in range(len(self.current_asr) - 1, -1, -1):
                        if (
                            self.current_asr[i].speaker_id == speaker_id
                            and not self.current_asr[i].is_final
                        ):
                            active_idx = i
                            break

                    if active_idx != -1:
                        # Update existing active sentence
                        self.current_asr[active_idx].content = text
                        # Update end time to now
                        self.current_asr[active_idx].time_range[1] = current_time_ms
                        if is_final:
                            self.current_asr[active_idx].is_final = True
                    else:
                        # Create new sentence
                        new_sentence = AsrSentence(
                            id=str(uuid.uuid4()),
                            content=text,
                            time_range=[
                                current_time_ms,
                                current_time_ms,
                            ],  # Estimated start
                            speaker_id=speaker_id,
                            is_final=is_final,
                        )
                        self.current_asr.append(new_sentence)
                        self.current_asr.sort(key=lambda x: x.time_range[0])

                self.trigger_event.set()

        except Exception as e:
            logger.error(f"Error in ASR stream for speaker {speaker_id}: {e}")
        finally:
            if speaker_id in self.asr_clients:
                # Clean up client
                pass  # managed by wrapper or close_asr_tasks

    async def toggle_mic(self, speaker_id: str, enable: bool, receive_time: datetime):
        self.lock_dict.setdefault(speaker_id, asyncio.Lock())
        logger.info(f"Toggle mic for speaker {speaker_id}: {enable}")

        async with self.lock_dict[speaker_id]:
            if enable:
                if speaker_id not in self.asr_tasks:
                    queue = asyncio.Queue()
                    self.asr_queues[speaker_id] = queue
                    self.asr_tasks[speaker_id] = asyncio.create_task(
                        self._process_asr_stream(speaker_id, queue)
                    )
            else:
                # Disable mic
                if speaker_id in self.asr_queues:
                    q = self.asr_queues[speaker_id]
                    await q.put(None)
                    del self.asr_queues[speaker_id]

                if speaker_id in self.asr_tasks:
                    task = self.asr_tasks[speaker_id]
                    # Don't await here to avoid blocking
                    # Let it finish in background
                    del self.asr_tasks[speaker_id]

                if speaker_id in self.asr_clients:
                    del self.asr_clients[speaker_id]

    def write_pcm(self, data: bytes, user_id: str, receive_time: datetime):
        # 计算服务端接收时间相对于会议开始时间的偏移量
        start_offset = int((receive_time - self.create_time).total_seconds() * 1000)
        pcm_path = self.pcm_root_path / f"{user_id}_{start_offset}.pcm"
        pcm_path.parent.mkdir(parents=True, exist_ok=True)
        pcm_path.write_bytes(data)
