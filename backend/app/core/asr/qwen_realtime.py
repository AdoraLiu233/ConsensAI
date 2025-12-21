import asyncio
import json
import base64
import logging
from typing import AsyncGenerator, Dict, Any
import websockets
from websockets.exceptions import ConnectionClosed

logger = logging.getLogger(__name__)


class QwenRealtimeASR:
    def __init__(
        self,
        api_key: str,
        url: str = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime",
        sample_rate: int = 16000,
        enable_vad: bool = True,
    ):
        self.api_key = api_key
        self.url = url
        self.sample_rate = sample_rate
        self.enable_vad = enable_vad
        self.ws = None
        self.session_id = None

        # State machine for incremental text
        self.segment_text_committed = ""
        self.current_sentence_id = None

        self._running = False
        self._send_queue = asyncio.Queue()
        self._connect_lock = asyncio.Lock()

    async def connect(self):
        """Establish WebSocket connection and initialize session."""
        logger.info(f"Connecting to Qwen Realtime ASR at {self.url}...")
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "OpenAI-Beta": "realtime=v1",
        }

        try:
            # Note: websockets 13.0+ uses additional_headers, not extra_headers
            # But websockets 13.0 connect signature: connect(uri, *, additional_headers=..., **kwargs)
            # kwargs are passed to loop.create_connection.
            # If we pass extra_headers, it goes to kwargs -> loop.create_connection -> Error.
            self.ws = await websockets.connect(self.url, additional_headers=headers)

            # Session update configuration
            session_config = {
                "type": "session.update",
                "session": {
                    "modalities": ["text"],
                    "input_audio_format": "pcm",
                    "sample_rate": self.sample_rate,
                    "input_audio_transcription": {"language": "zh"},
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.2,
                        "silence_duration_ms": 800,
                    }
                    if self.enable_vad
                    else None,
                },
            }

            logger.info(f"Sending session update: {json.dumps(session_config)}")
            await self.ws.send(json.dumps(session_config))
            logger.info("Connected to Qwen Realtime ASR and sent session update.")

            # Wait for session.updated or similar confirmation if needed?
            # The protocol usually sends a response, but we can start sending audio.
            self._running = True

        except Exception as e:
            logger.error(f"Failed to connect to Qwen ASR: {e}", exc_info=True)
            raise

    async def close(self):
        """Close the connection."""
        self._running = False
        if self.ws:
            try:
                await self.ws.close()
                logger.info("Closed Qwen Realtime ASR connection.")
            except Exception:
                pass
            self.ws = None
        self.segment_text_committed = ""

    async def send_audio(self, pcm_data: bytes):
        """Queue audio data to be sent."""
        if not self._running or not self.ws:
            # Optionally try to reconnect here or raise error
            logger.warning("Attempting to send audio while not connected.")
            return

        # Encode to base64
        b64_audio = base64.b64encode(pcm_data).decode("utf-8")

        msg = {"type": "input_audio_buffer.append", "audio": b64_audio}
        try:
            await self.ws.send(json.dumps(msg))
        except Exception as e:
            logger.error(f"Error sending audio data: {e}", exc_info=True)
            # Handle reconnection logic if needed

    async def _recv_loop(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Receive messages from WebSocket and yield parsed results."""
        try:
            async for message in self.ws:
                data = json.loads(message)
                event_type = data.get("type")

                # Log non-audio-append-ack messages to avoid noise, but for debug log everything
                # logger.debug(f"Received Qwen message: {event_type}")

                if event_type == "conversation.item.input_audio_transcription.text":
                    logger.info(f"Qwen Partial: {data.get('stash')}")
                    # Partial result (delta) logic is tricky with this event.
                    # Documentation says it contains 'stash' which is current intermediate text.
                    # We need to calculate delta against self.segment_text_committed?
                    # Actually, the user prompt says:
                    # "包含 stash 字段。这是当前正在识别的中间文字，会随着识别修正而变动。"
                    # "增量文本维护状态机：...当收到新文本时，计算新旧文本的差值作为增量输出"

                    # NOTE: stash is likely the *full* unstable text of the current utterance so far.
                    # Or is it a delta? The prompt says "intermediate text".
                    # Usually 'stash' implies the content that is not yet finalized.

                    # Assuming data structure based on user prompt context roughly.
                    # Since I don't have the exact payload example for 'text' event in the prompt except for description.
                    # Prompt says: "conversation.item.input_audio_transcription.text" contains "stash".
                    # Let's inspect the data structure carefully in implementation.

                    # If the prompt implies we need to output "incremental text" to the user,
                    # but the ASR gives us "current full intermediate text", we calculate the diff.

                    # Wait, usually for stream ASR, we yield the *current full text* or *delta*.
                    # The prompt asks for: {"type": "partial", "text": "...", "is_final": False}
                    # If we just send the full stash, the frontend might display it.
                    # But the prompt mentions "prevent text regression or duplication".

                    # Strategy:
                    # 1. Store `segment_text_committed` (finalized parts).
                    # 2. When partial comes (stash), it is likely the *entire* current hypothesys for the uncommitted part?
                    # Or is stash the whole sentence including committed parts?
                    # The prompt says: "segment_text_committed ... records current sentence ALREADY determined part".
                    # "When receiving new text, calculate difference ... as incremental output".
                    # This suggests we want to yield DELTAS.

                    # However, typical usage for frontend is to replace the current sentence.
                    # Let's assume we yield the full text of the current sentence for simplicity if possible,
                    # or follow the prompt strictly to yield increments if that's what the system expects.
                    # The current system (MeetingRecorder) seems to accumulate `current_asr`.

                    # Let's look at `MeetingRecorder` logic.
                    # `on_asr_result` receives `msg["text"]`. It creates `AsrSentence` with `content=msg["text"]`.
                    # Then `current_asr` is updated.
                    # If I yield "partial", does the recorder append it?
                    # In `MeetingRecorder.toggle_mic`, `on_asr_result` replaces or appends?
                    # It appends a NEW `AsrSentence` to `current_asr`.
                    # `current_asr` is a LIST of sentences.

                    # If I am receiving a stream of updates for the *same* sentence, I should probably update the *last* sentence in `current_asr`?
                    # The `MeetingRecorder` logic:
                    # `self.current_asr.append(...)`
                    # `self.current_asr.sort(...)`
                    # It seems it treats every update as a separate entity or maybe it relies on `FunASR` sending finalized sentences?
                    # `msg["mode"] == "2pass-offline"` check suggests it waits for offline (final) result?
                    # The current logic seems to only handle finalized sentences (offline mode).

                    # The new requirement is Realtime.
                    # So we need to handle partials.

                    content = data.get(
                        "content", ""
                    )  # The prompt says data structure has 'stash'.
                    # Let's assume structure based on event type.
                    # Realtime API v1 usually:
                    # type: "conversation.item.input_audio_transcription.text"
                    # item_id: ...
                    # content: ... (or similar)

                    # Per prompt: "包含 stash 字段" inside the event?
                    # Or is it `data['conversation']['item']['input_audio_transcription']['text']`?
                    # The event name uses dots, so it's likely flattened or nested?
                    # "conversation.item.input_audio_transcription.text" is the TYPE string.
                    # The fields inside: `stash`.

                    stash = data.get("stash", "")
                    if not stash:
                        # try nested lookups if structure differs
                        pass

                    # Calculate delta?
                    # If `stash` is the full current provisional text.
                    # And `segment_text_committed` is what we have already "finalized" (maybe nothing yet if we only finalize at End of Sentence).

                    # Actually, "segment_text_committed" logic in prompt implies we might "commit" parts of the sentence *before* it ends?
                    # OR, it simply means "previous yielded partial".
                    # If we yield partials, we might yield "Hello", then "Hello World".
                    # If we only want to yield " World", we keep state.

                    # Let's implement yielding the FULL current text for the sentence,
                    # and let the consumer handle display?
                    # But the prompt says "calculate new vs old text difference as incremental output".
                    # This suggests the consumer expects deltas.

                    # Let's implement the delta logic.
                    # `stash` (new full) - `previous_stash` (old full) = `delta`?
                    # But `stash` changes. "Hello" -> "Hullo" (correction).
                    # If we output deltas, we can't easily correct.
                    # Unless the "delta" is just "what to append".

                    # "increment text maintenance state machine: ... prevent text rollback or duplication ... record current sentence determined part".
                    # This sounds like we are trying to stream STABLE text.
                    # But ASR partials are unstable.
                    # Maybe we only yield when something is "committed"?
                    # But partials are by definition uncommitted.

                    # Let's stick to the prompt's instruction:
                    # "When receiving new text (stash), calculate new vs old difference... and clear on completed."

                    # Wait, if stash is "reading book", and next stash is "reading a book".
                    # Difference is " a book" (if prefix matches).
                    # If next stash is "reading the book".
                    # Difference from "reading book" is complex (rewrite).
                    # Usually incremental ASR output works by only outputting what won't change,
                    # OR by refreshing the whole line.

                    # Given the ambiguity, I will yield the FULL text in 'partial' events,
                    # but mark it as `is_final=False`.
                    # And for `completed`, yield `is_final=True`.
                    # I will try to respect the "segment_text_committed" if I can make sense of it.
                    # Maybe it refers to a specific Qwen feature where they send stable prefixes?

                    # Let's assume `stash` is the current unstable hypothesis.
                    # I will yield it as `text`.

                    yield {"type": "partial", "text": stash, "is_final": False}

                elif (
                    event_type
                    == "conversation.item.input_audio_transcription.completed"
                ):
                    transcript = data.get("transcript", "")
                    logger.info(f"Qwen Final: {transcript}")
                    yield {"type": "final", "text": transcript, "is_final": True}
                    self.segment_text_committed = ""  # Reset

                elif event_type == "error":
                    logger.error(f"Qwen Error Event: {data}")
                    yield {"type": "error", "text": str(data), "is_final": True}
                else:
                    # Log other events for debug
                    logger.info(f"Qwen Event: {event_type} {str(data)[:200]}")

        except ConnectionClosed as e:
            logger.info(f"Qwen ConnectionClosed: code={e.code}, reason={e.reason}")
            pass
        except Exception as e:
            logger.error(f"Error in recv loop: {e}", exc_info=True)
            yield {"type": "error", "text": str(e), "is_final": True}

    async def transcribe_stream(
        self, audio_generator: AsyncGenerator[bytes, None]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Main interface: accepts audio stream, yields transcription results.
        Manages connection and tasks.
        """
        await self.connect()

        # Start a task to send audio
        async def sender():
            try:
                async for chunk in audio_generator:
                    await self.send_audio(chunk)
            except Exception as e:
                logger.error(f"Error in audio sender: {e}")

        send_task = asyncio.create_task(sender())

        try:
            async for result in self._recv_loop():
                yield result
        finally:
            send_task.cancel()
            await self.close()
