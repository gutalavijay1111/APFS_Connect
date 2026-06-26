import os
import json
import traceback

from falcon import HTTP_200, HTTP_400, status_codes

from utils.logger import LogManager

log_manager = LogManager()
logger = log_manager.get_logger("server")
MODE = os.getenv("MODE")

def send_success(resp, message:str = "", data=None, status: status_codes=HTTP_200):
    response_body = {"status": "success"}
    if message:
        response_body["message"] = message

    if data is not None:
        response_body["data"] = data

    resp.media = response_body
    resp.status = status
    logger.info(f"{json.dumps(response_body)}")  


def send_error(resp, error_message="An error occurred", error_code: status_codes=HTTP_400, excp=None):
    response_body = {
        "status": "error",
        "message": error_message,
    }

    if excp:
        response_body["exception"] = {
            "type": type(excp).__name__, 
            "message": str(excp),
            "traceback": traceback.format_exc()
        }
        if MODE != "DEBUG":
            response_body["exception"].pop("traceback", None)

    resp.media = response_body
    resp.status = error_code
    logger.error(f"{json.dumps(response_body)}")