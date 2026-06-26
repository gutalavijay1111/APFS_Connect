#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Activate virtualenv
source venv/bin/activate

# Load env
set -a
source .env
set +a

mkdir -p logs

echo "[start.sh] Running DB migrations..."
alembic upgrade head

echo "[start.sh] Starting Celery worker..."
celery -A utils.scheduler worker \
  --loglevel=info \
  --logfile=logs/celery.log \
  --pidfile=logs/celery.pid \
  --detach

echo "[start.sh] Starting Gunicorn on port 9999..."
exec gunicorn app:app \
  --workers 4 \
  --bind 0.0.0.0:9999 \
  --timeout 120 \
  --access-logfile logs/access.log \
  --error-logfile logs/error.log
