import sys
import os
import json
import falcon
from typing import Dict, List
from core.messaging import execute_flow, run_processor, send_text_message, log_conversation

sys.path.append("../APFS_Connect/")
from utils.logger import LogManager
from setup import temp_registry, global_registry

log_manager = LogManager()
logger = log_manager.get_logger("webhook")

class WhatsAppWebhook:
    def on_get(self, req, resp):
        VERIFY_TOKEN = os.getenv("VERIFY_TOKEN", "")
        verify_token = req.get_param("hub.verify_token", default=None)
        challenge = req.get_param("hub.challenge", default=None)

        if verify_token == VERIFY_TOKEN:
            logger.info("Verified webhook")
            resp.status = falcon.HTTP_200
            resp.text = challenge
        else:
            logger.error("Webhook Verification failed")
            resp.status = falcon.HTTP_400
            resp.text = "Invalid verification token"


    def on_post(self, req: falcon.Request, resp: falcon.Response) -> None:
        try:
            payload = self.parse_request(req)
            self.process_payload(payload, resp)
        # except PayloadValidationError as e:
        #     logger.warning(f"Validation error: {e}")
        #     resp.status = falcon.HTTP_400
        #     resp.media = {"error": str(e)}
        except Exception as e:
            logger.error(f"Error processing webhook: {e}")
            resp.status = falcon.HTTP_500
            resp.media = {"error": "Internal server error."}

    def parse_request(self, req: falcon.Request) -> Dict:
        try:
            raw_json = req.bounded_stream.read()
            return json.loads(raw_json)
        except json.JSONDecodeError as e:
            logger.error(f"Request is not json decodable: {e}")
            # raise PayloadValidationError(f"Invalid JSON format: {e}")

    def process_payload(self, payload: Dict, resp: falcon.Response) -> None:
        messages = self.extract_messages(payload)
        if not messages:
            logger.info("No messages found in the payload.")
            resp.media = {"message": "No actionable messages found."}
            return

        message = messages[0]
        user_id = message.get("from", "")
        message_type = message.get("type", "")
        
        log_conversation(user_id, message)
        logger.info(f"Incoming message from user: {user_id}, type: {message_type} message >> {message.get(message_type, '')}")
        self.handle_message(user_id, message, resp)

    def extract_messages(self, payload: Dict) -> List:
        try:
            return (
                payload.get("entry", [])[0]
                .get("changes", [])[0]
                .get("value", {})
                .get("messages", [])
            )
        except Exception as e:
            logger.error(f"Failed to extract messages: {e}")
            return []

    def handle_message(self, user_id: str, message: Dict, resp: falcon.Response) -> None:
        message_type = message.get("type", "")

        if message_type == "text":
            self.handle_text_message(user_id, message, resp)
        elif message_type == "interactive":
            self.handle_interactive_message(user_id, message, resp)
        else:
            logger.warning(f"Unsupported message type: {message_type} from user: {user_id}")
            send_text_message(user_id, "Sorry, I didn't understand that. Please try again.")
            resp.media = {"message": "Unsupported message type."}

    def handle_text_message(self, user_id: str, message: Dict, resp: falcon.Response) -> None:

        text = message.get("text", {}).get("body", "").lower().strip()
        fresh_flow = global_registry.get_flow_by_trigger(text)
        resume_from_step = temp_registry.get_user_current_step(user_id)
        flow_id = temp_registry.get_user_current_flow(user_id)

        if fresh_flow:
            # User explicitly triggered a new flow — abandon any current session
            if flow_id:
                logger.info(f"User '{user_id}' abandoned flow '{flow_id}' to start '{fresh_flow['id']}'.")
            temp_registry.clear_user_state(user_id)
            resume_from_step = {}
            flow_id = fresh_flow["id"]
            logger.info(f"Triggering flow '{flow_id}' for user '{user_id}'.")

        elif temp_registry.user_has_pending_step(user_id):
            # User has a pending interactive step — text input is not a valid response here.
            # Only allow it through if the pending step's content is text-based (not interactive).
            pending_step = temp_registry.get_user_current_step(user_id)
            pending_content_type = (pending_step.get("content") or {}).get("type", "text")
            if pending_content_type == "interactive":
                send_text_message(
                    user_id,
                    "👆 Please use the options above to continue.\n\n"
                    "Or type a command (e.g. /help) to start a new conversation."
                )
                resp.status = falcon.HTTP_200
                resp.media = {"message": "Pending interactive step — text ignored."}
                return
            # Text-collection step: fall through and resume normally

        if not flow_id:
            logger.warning(f"No flow found for trigger: '{text}', user: '{user_id}'.")
            send_text_message(user_id, "I didn't understand that. Type /help to see available commands.")
            resp.status = falcon.HTTP_200
            resp.media = {"message": "No matching flow found."}
            return

        execute_flow(user_id, flow_id, resume_from_step, {"user_response": text})
        resp.status = falcon.HTTP_200
        resp.media = {"message": f"Flow '{flow_id}' triggered."}


    def handle_interactive_message(self, user_id: str, message: Dict, resp: falcon.Response) -> None:
        interactive = message.get("interactive", {})
        interactive_type = interactive.get("type", "")

        if interactive_type == "nfm_reply":
            resp.status = falcon.HTTP_200
            return

        if interactive_type not in ["list_reply", "button_reply"]:
            logger.warning(f"Unsupported interactive type '{interactive_type}' from '{user_id}'.")
            send_text_message(user_id, "Unsupported response type. Please try again.")
            resp.status = falcon.HTTP_200
            resp.media = {"message": "Unsupported interactive type."}
            return

        reply_id    = interactive.get(interactive_type, {}).get("id", "").lower()
        reply_title = interactive.get(interactive_type, {}).get("title", "")

        fresh_flow        = global_registry.get_flow_by_trigger(reply_id)
        resume_from_step  = temp_registry.get_user_current_step(user_id)
        flow_id           = temp_registry.get_user_current_flow(user_id)
        has_pending       = temp_registry.user_has_pending_step(user_id)

        if fresh_flow:
            if flow_id:
                logger.info(f"User '{user_id}' triggered new flow '{fresh_flow['id']}' via reply.")
            temp_registry.clear_user_state(user_id)
            resume_from_step = {}
            flow_id = fresh_flow["id"]

        elif not has_pending:
            # Stale button click — no active session waiting for this reply
            logger.warning(f"Stale interactive reply '{reply_id}' from '{user_id}' — no pending step.")
            send_text_message(
                user_id,
                "This option is no longer active. Type /help to start a new conversation."
            )
            resp.status = falcon.HTTP_200
            resp.media = {"message": "Stale interactive reply ignored."}
            return

        if not flow_id:
            logger.warning(f"No flow context for interactive reply '{reply_id}' from '{user_id}'.")
            send_text_message(user_id, "I couldn't find your session. Type /help to start fresh.")
            resp.status = falcon.HTTP_200
            resp.media = {"message": "No flow context."}
            return

        execute_flow(user_id, flow_id, resume_from_step, {"id": reply_id, "value": reply_title})
        resp.status = falcon.HTTP_200
        resp.media = {"message": f"Flow '{flow_id}' resumed."}