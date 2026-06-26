import os
import pytz

from uuid import uuid4
from celery import Celery
from datetime import datetime, timedelta

from database import get_db
from utils.logger import LogManager
from database.models import CampaignJob
from batch_processor.batch_processor import BatchProcessor

log_manager = LogManager()
logger = log_manager.get_logger("scheduler")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/10")

celery_app = Celery(
    'scheduler',
    broker=REDIS_URL,
    backend=REDIS_URL,
)
celery_app.conf.update(
    result_expires=3600,
    timezone="Asia/Kolkata",
    enable_utc=False,
)

def ensure_timezone(schedule_time):
    return schedule_time.astimezone(pytz.timezone("Asia/Kolkata"))

class CampaignScheduler:
    def __init__(self):
        self.batch_processor = BatchProcessor()

    def schedule_campaign(self, campaign_data, user_id):
        campaign_id = campaign_data.get("id", "")
        repeat_count = campaign_data.get("repeat_count")
        repeat_interval_value = campaign_data.get("repeat_interval_value")
        schedule_time = campaign_data.get("schedule_at")

        if isinstance(schedule_time, str):
            schedule_time = datetime.strptime(schedule_time, "%Y-%m-%d %H:%M:%S")
        schedule_time = ensure_timezone(schedule_time)

        job_id = str(uuid4())
        campaign_data["job_id"] = job_id
        campaign_data["current_attempt"] = 1
        job = celery_app.send_task(
            'execute_campaign',
            args=[campaign_data, user_id],
            eta=schedule_time,
        )

        self.create_campaign_job(job_id, campaign_id, schedule_time, repeat_count, repeat_interval_value)
        logger.info(f"Campaign {campaign_id} scheduled with job ID {job_id} for execution at {schedule_time}")


    @staticmethod
    def create_campaign_job(job_id, campaign_id, schedule_time, retry_attempts, retry_interval):
        with get_db() as db:
            new_job = CampaignJob(
                id=job_id,
                campaign_id=campaign_id,
                schedule_time=schedule_time,
                retry_interval=retry_interval,
                retry_attempts=retry_attempts,
                status="Scheduled",
                created_at=ensure_timezone(datetime.now()),
            )
            db.add(new_job)
            db.commit()


@celery_app.task(name="execute_campaign", bind=True, max_retries=3)
def execute_campaign(self, campaign_data: dict, user_id: str):
    campaign_id = campaign_data.get("id", "")
    excel_file = campaign_data.get("excel_file")
    activity_type = campaign_data.get("activity_type")
    repeat_count = campaign_data.get("repeat_count")
    current_attempt = campaign_data.get("current_attempt")
    excel_file = campaign_data.get("excel_file")

    try:
        update_job_status(campaign_id, "InProcess")
        campaign_scheduler.batch_processor.process_batch(campaign_data)
        logger.info(f"Processed {activity_type} for Campaign {campaign_id} with file {excel_file}")
    except Exception as e:
        logger.error(f"Error executing campaign {campaign_id}: {e}")
        update_job_status(campaign_id, "Failed")
        return

    if current_attempt < repeat_count:
        schedule_next_attempt(campaign_data, user_id)
    else:
        logger.warning(f"Max retry attempts reached for Campaign {campaign_id}")
        update_job_status(campaign_id, "Completed")


def update_job_status(campaign_id: str, status: str):
    with get_db() as db:
        job = db.query(CampaignJob).filter_by(campaign_id=campaign_id).first()
        if job:
            job.status = status
            job.updated_at = ensure_timezone(datetime.now())
            db.commit()


def schedule_next_attempt(campaign_data: dict, user_id: str):
    campaign_id = campaign_data.get("id", "")
    repeat_interval_value = campaign_data.get("repeat_interval_value")
    repeat_interval_unit = campaign_data.get("repeat_interval_unit", "minutes").lower()
    current_attempt = campaign_data.get("current_attempt", 0)

    interval_map = {
        "minutes": {"minutes": repeat_interval_value},
        "hours": {"hours": repeat_interval_value},
        "days": {"days": repeat_interval_value},
    }

    next_attempt_time = datetime.now() + timedelta(**interval_map[repeat_interval_unit])
    next_attempt_time = ensure_timezone(next_attempt_time)

    campaign_data["current_attempt"] = current_attempt + 1

    execute_campaign.apply_async(
        args=[campaign_data, user_id],
        eta=next_attempt_time,
    )

    logger.info(f"Retry scheduled for Campaign {campaign_id} at {next_attempt_time}")


campaign_scheduler = CampaignScheduler()
