import os

from .whatsapp import WhatsAppChannel
from .simulator import SimulatorChannel, simulator_channel

_whatsapp_channel = WhatsAppChannel()

def get_channel():
    """Return the active messaging channel based on CHANNEL env var."""
    if os.getenv("CHANNEL", "simulator") == "whatsapp":
        return _whatsapp_channel
    return simulator_channel
