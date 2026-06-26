import sys
import json
import redis
from typing import Dict, Optional, Any

sys.path.append("../")
from utils.logger import LogManager

log_manager = LogManager()
logger = log_manager.get_logger("temp_registry")

REDIS_DB  = 10
STATE_TTL = 86400  # 24 hours — stale sessions auto-expire


class TempRegistry:
    def __init__(self, redis_url: str = f"redis://localhost:6379/{REDIS_DB}") -> None:
        self.redis_client = redis.StrictRedis.from_url(redis_url, decode_responses=True)

    # ── Key helpers ───────────────────────────────────────────────────────────

    def _user_key(self, user_id: str) -> str:
        return f"user:{user_id}"

    def _data_key(self, user_id: str, key: str) -> str:
        return f"user_data:{user_id}:{key}"

    def _set(self, key: str, value: dict) -> None:
        """Persist a dict to Redis with a rolling TTL."""
        self.redis_client.setex(key, STATE_TTL, json.dumps(value))

    # ── User state ────────────────────────────────────────────────────────────

    def user_in_temp_registry(self, user_id: str) -> bool:
        return self.redis_client.exists(self._user_key(user_id)) > 0

    def get_user_state(self, user_id: str) -> Dict[str, Any]:
        raw = self.redis_client.get(self._user_key(user_id))
        return json.loads(raw) if raw else {}

    def update_user_state(self, user_id: str, new_state: dict) -> None:
        existing = self.get_user_state(user_id)
        self._set(self._user_key(user_id), {**existing, **new_state})

    def clear_user_state(self, user_id: str) -> None:
        self.redis_client.delete(self._user_key(user_id))
        logger.info(f"User state cleared for '{user_id}'.")

    # ── Flow / step tracking ──────────────────────────────────────────────────

    def get_user_current_flow(self, user_id: str) -> str:
        return self.get_user_state(user_id).get("current_flow", "")

    def get_user_current_step(self, user_id: str) -> dict:
        return self.get_user_state(user_id).get("current_step", {})

    def update_user_step(self, user_id: str, step: dict) -> None:
        state = self.get_user_state(user_id)
        state["current_step"] = step
        self._set(self._user_key(user_id), state)
        logger.info(f"Step updated for '{user_id}': step_id='{step.get('id')}'")

    def load_new_flow_for_user(self, user_id: str, flow_id: str) -> None:
        state = self.get_user_state(user_id)
        state["current_flow"] = flow_id
        state["current_step"] = ""
        self._set(self._user_key(user_id), state)
        logger.info(f"New flow '{flow_id}' loaded for '{user_id}'.")

    def handle_user_flow_completion(self, user_id: str, next_flow_id: Optional[str]) -> None:
        if next_flow_id:
            logger.info(f"Chaining to flow '{next_flow_id}' for '{user_id}'.")
            self.load_new_flow_for_user(user_id, next_flow_id)
        else:
            self.clear_user_state(user_id)

    # ── Visited steps (cycle detection) ──────────────────────────────────────

    def update_visited_steps_for_user(self, user_id: str, step_id: str) -> None:
        state = self.get_user_state(user_id)
        visited = state.get("steps_visited", [])
        visited.append(step_id)
        state["steps_visited"] = visited
        self._set(self._user_key(user_id), state)

    def get_user_visited_steps(self, user_id: str) -> list:
        return self.get_user_state(user_id).get("steps_visited", [])

    # ── Pending step (wait state) ─────────────────────────────────────────────

    def update_user_step_as_pending(
        self, user_id: str, flow_id: str, step: Dict, processor_index: int = 0
    ) -> None:
        # Flip wait=False on the stored copy so resume runs the processor instead of re-waiting
        step["processor"][processor_index]["wait"] = False
        state = self.get_user_state(user_id)
        state.update({
            "flow_id":        flow_id,
            "current_flow":   flow_id,
            "current_step":   step,
            "processor_index": processor_index,
            "pending_step":   True,
        })
        self._set(self._user_key(user_id), state)

    def user_has_pending_step(self, user_id: str) -> bool:
        return self.get_user_state(user_id).get("pending_step", False)

    def clear_user_pending_step(self, user_id: str) -> None:
        state = self.get_user_state(user_id)
        for key in ("current_step", "processor_index", "pending_step"):
            state.pop(key, None)
        self._set(self._user_key(user_id), state)

    # ── Per-user session data (replaces in-memory data_store) ────────────────
    # Used by processors to pass data across steps without shared memory.

    def set_user_data(self, user_id: str, key: str, value: Any) -> None:
        self.redis_client.setex(self._data_key(user_id, key), STATE_TTL, json.dumps(value))

    def get_user_data(self, user_id: str, key: str) -> Any:
        raw = self.redis_client.get(self._data_key(user_id, key))
        return json.loads(raw) if raw else None

    def delete_user_data(self, user_id: str, key: str) -> None:
        self.redis_client.delete(self._data_key(user_id, key))
