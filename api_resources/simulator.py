import time
import falcon

from utils.api import send_success, send_error
from channels.simulator import simulator_channel


class _MockResp:
    """Minimal falcon-compatible response object for internal webhook calls."""
    media = {}
    status = falcon.HTTP_200


class SimulatorContactResource:
    """GET /simulator/contacts  |  POST /simulator/contacts"""

    def on_get(self, req, resp):
        contacts = simulator_channel.get_contacts()
        return send_success(resp, data=contacts)

    def on_post(self, req, resp):
        data = req.media
        phone = data.get("phone", "").strip()
        name = data.get("name", phone).strip()
        if not phone:
            return send_error(resp, "phone is required")
        contact = simulator_channel.add_contact(phone, name)
        return send_success(resp, data=contact)


class SimulatorContactDetailResource:
    """DELETE /simulator/contacts/{phone}"""

    def on_delete(self, req, resp, phone):
        simulator_channel.delete_contact(phone)
        return send_success(resp, f"Contact {phone} removed")


class SimulatorMessageResource:
    """GET /simulator/messages/{phone}  |  DELETE /simulator/messages/{phone}"""

    def on_get(self, req, resp, phone):
        since = int(req.get_param("since") or 0)
        messages = simulator_channel.get_messages(phone, since_index=since)
        total = simulator_channel.message_count(phone)
        return send_success(resp, data={"messages": messages, "total": total})

    def on_delete(self, req, resp, phone):
        simulator_channel.clear_messages(phone)
        return send_success(resp, "Conversation cleared")


class SimulatorSendResource:
    """POST /simulator/send — user sends a message into the flow engine."""

    def on_post(self, req, resp):
        from core.webhook import WhatsAppWebhook

        data = req.media
        phone = data.get("phone", "").strip()
        msg_type = data.get("type", "text")

        if not phone:
            return send_error(resp, "phone is required")

        # Build the WhatsApp-format payload exactly as Meta sends it
        if msg_type == "text":
            text = data.get("message", "").strip()
            if not text:
                return send_error(resp, "message is required")
            simulator_channel.store_message(
                phone, "inbound", "text", {"body": text}, status="read"
            )
            wa_payload = {
                "entry": [{"changes": [{"value": {"messages": [{
                    "from": phone,
                    "type": "text",
                    "text": {"body": text},
                    "timestamp": str(int(time.time())),
                }]}}]}]
            }

        elif msg_type == "button_reply":
            button_id = data.get("button_id", "")
            button_title = data.get("button_title", "")
            simulator_channel.store_message(
                phone, "inbound", "button_reply",
                {"body": button_title, "id": button_id}, status="read"
            )
            wa_payload = {
                "entry": [{"changes": [{"value": {"messages": [{
                    "from": phone,
                    "type": "interactive",
                    "interactive": {
                        "type": "button_reply",
                        "button_reply": {"id": button_id, "title": button_title},
                    },
                    "timestamp": str(int(time.time())),
                }]}}]}]
            }

        elif msg_type == "list_reply":
            reply_id = data.get("reply_id", "")
            reply_title = data.get("reply_title", "")
            simulator_channel.store_message(
                phone, "inbound", "list_reply",
                {"body": reply_title, "id": reply_id}, status="read"
            )
            wa_payload = {
                "entry": [{"changes": [{"value": {"messages": [{
                    "from": phone,
                    "type": "interactive",
                    "interactive": {
                        "type": "list_reply",
                        "list_reply": {"id": reply_id, "title": reply_title},
                    },
                    "timestamp": str(int(time.time())),
                }]}}]}]
            }

        elif msg_type == "image":
            url = data.get("url", "").strip()
            caption = data.get("caption", "").strip()
            if not url:
                return send_error(resp, "url is required for image")
            simulator_channel.store_message(
                phone, "inbound", "image",
                {"link": url, "caption": caption}, status="read"
            )
            wa_payload = {
                "entry": [{"changes": [{"value": {"messages": [{
                    "from": phone,
                    "type": "image",
                    "image": {"link": url, "caption": caption},
                    "timestamp": str(int(time.time())),
                }]}}]}]
            }

        else:
            return send_error(resp, f"Unsupported message type: {msg_type}")

        # Route through the exact same webhook handler — zero code duplication
        WhatsAppWebhook().process_payload(wa_payload, _MockResp())
        return send_success(resp, "ok")
