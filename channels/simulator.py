import os
import json
import random
import redis

from uuid import uuid4
from datetime import datetime
from typing import Dict, List, Optional

from utils.logger import LogManager
from .base import BaseChannel

log_manager = LogManager()
logger = log_manager.get_logger("channel.simulator")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/10")
AVATAR_COLORS = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
    "#FECA57", "#FF9FF3", "#54A0FF", "#5F27CD",
]


class SimulatorChannel(BaseChannel):
    def __init__(self):
        self.redis = redis.StrictRedis.from_url(REDIS_URL, decode_responses=True)

    # ── Outbound (bot → user) ────────────────────────────────────────────────

    def send(self, payload: Dict) -> None:
        phone = payload.get("to", "")
        msg_type = payload.get("type", "text")

        if msg_type == "text":
            content = {"body": payload.get("text", {}).get("body", "")}
        elif msg_type == "interactive":
            content = payload.get("interactive", {})
        elif msg_type in ("image", "video", "audio", "document", "sticker"):
            media = payload.get(msg_type, {})
            content = {
                "link": media.get("link", media.get("id", "")),
                "caption": media.get("caption", ""),
                "filename": media.get("filename", ""),
            }
        elif msg_type == "template":
            tpl = payload.get("template", {})
            content = {
                "name": tpl.get("name", ""),
                "language": tpl.get("language", {}).get("code", "en"),
                "components": tpl.get("components", []),
            }
        else:
            content = payload

        self.store_message(phone, "outbound", msg_type, content, status="delivered")

    # ── Message storage ──────────────────────────────────────────────────────

    def store_message(
        self,
        phone: str,
        direction: str,
        msg_type: str,
        content: dict,
        status: str = "sent",
    ) -> dict:
        msg = {
            "id": str(uuid4()),
            "direction": direction,
            "type": msg_type,
            "content": content,
            "timestamp": datetime.now().isoformat(),
            "status": status,
        }
        self.redis.rpush(f"sim:messages:{phone}", json.dumps(msg))
        self._update_contact_preview(phone, content, direction)
        return msg

    def get_messages(self, phone: str, since_index: int = 0) -> List[dict]:
        raw = self.redis.lrange(f"sim:messages:{phone}", since_index, -1)
        return [json.loads(m) for m in raw]

    def message_count(self, phone: str) -> int:
        return self.redis.llen(f"sim:messages:{phone}")

    def clear_messages(self, phone: str) -> None:
        self.redis.delete(f"sim:messages:{phone}")

    # ── Contacts ─────────────────────────────────────────────────────────────

    def add_contact(self, phone: str, name: str, avatar_color: Optional[str] = None) -> dict:
        contact = {
            "phone": phone,
            "name": name,
            "avatar_color": avatar_color or random.choice(AVATAR_COLORS),
            "last_message": "",
            "last_time": "",
            "unread": 0,
        }
        self.redis.hset("sim:contacts", phone, json.dumps(contact))
        return contact

    def get_contacts(self) -> List[dict]:
        raw = self.redis.hgetall("sim:contacts")
        contacts = [json.loads(v) for v in raw.values()]
        return sorted(contacts, key=lambda c: c.get("last_time", ""), reverse=True)

    def delete_contact(self, phone: str) -> None:
        self.redis.hdel("sim:contacts", phone)
        self.clear_messages(phone)

    # ── Internal ─────────────────────────────────────────────────────────────

    def _update_contact_preview(self, phone: str, content: dict, direction: str) -> None:
        raw = self.redis.hget("sim:contacts", phone)
        if not raw:
            return
        contact = json.loads(raw)
        if isinstance(content, dict):
            caption = content.get("caption", "")
            name = content.get("name", "")
            preview = (
                content.get("body")
                or content.get("text", {}).get("body", "")
                or (caption and f"📷 {caption}")
                or (content.get("link") and "📎 Media")
                or (name and f"📋 Template: {name}")
                or "📎 Media"
            )
        else:
            preview = str(content)[:60]
        contact["last_message"] = str(preview)[:60]
        contact["last_time"] = datetime.now().strftime("%H:%M")
        self.redis.hset("sim:contacts", phone, json.dumps(contact))


# Module-level singleton — shared across all gunicorn workers via Redis
simulator_channel = SimulatorChannel()
