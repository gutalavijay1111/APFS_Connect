import requests
from typing import Dict

from settings import BASE_URL, HEADERS
from utils.logger import LogManager
from .base import BaseChannel

log_manager = LogManager()
logger = log_manager.get_logger("channel.whatsapp")


class WhatsAppChannel(BaseChannel):
    def send(self, payload: Dict) -> None:
        response = requests.post(BASE_URL, headers=HEADERS, json=payload)
        response.raise_for_status()
        logger.info(f"WhatsApp message sent to {payload.get('to')}")
