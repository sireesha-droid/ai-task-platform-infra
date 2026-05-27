"""
AI Task Worker
Consumes task IDs from the Redis queue and processes them in MongoDB.

Status lifecycle: pending → running → success | failed
"""

import os
import time
import signal
import logging
from datetime import datetime, timezone

import redis
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv()

# ─── Logging Setup ────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO")),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("worker")

# ─── Configuration ────────────────────────────────────────────────────────────
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)
REDIS_QUEUE_KEY = "tasks:queue"
REDIS_BLOCK_TIMEOUT = 5  # seconds to wait in BLPOP

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/ai-task-platform")

# ─── Graceful Shutdown ────────────────────────────────────────────────────────
_shutdown_requested = False


def handle_shutdown(signum, frame):
    global _shutdown_requested
    logger.info("Shutdown signal received. Finishing current task before exit...")
    _shutdown_requested = True


signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)


# ─── Operations ───────────────────────────────────────────────────────────────

def process_operation(operation: str, text: str):
    """
    Execute the requested string operation and return (result, log_message).
    Raises ValueError for unknown operations.
    """
    if operation == "uppercase":
        result = text.upper()
        return result, f"Converted {len(text)} characters to uppercase"

    elif operation == "lowercase":
        result = text.lower()
        return result, f"Converted {len(text)} characters to lowercase"

    elif operation == "reverse":
        result = text[::-1]
        return result, f"Reversed string of {len(text)} characters"

    elif operation == "word_count":
        words = text.split()
        result = len(words)
        return result, f"Counted {result} words in the input text"

    else:
        raise ValueError(f"Unknown operation: {operation}")


# ─── DB Helpers ───────────────────────────────────────────────────────────────

def append_log(db, task_id: str, message: str, level: str = "info"):
    """Append a timestamped log entry to the task's logs array."""
    db.tasks.update_one(
        {"_id": ObjectId(task_id)},
        {
            "$push": {
                "logs": {
                    "timestamp": datetime.now(timezone.utc),
                    "message": message,
                    "level": level,
                }
            }
        },
    )


def mark_running(db, task_id: str):
    """Transition task status from pending → running."""
    db.tasks.update_one(
        {"_id": ObjectId(task_id)},
        {
            "$set": {
                "status": "running",
                "startedAt": datetime.now(timezone.utc),
            },
            "$push": {
                "logs": {
                    "timestamp": datetime.now(timezone.utc),
                    "message": "Worker picked up task, processing started",
                    "level": "info",
                }
            },
        },
    )


def mark_success(db, task_id: str, result, log_message: str):
    """Transition task status to success and store result."""
    now = datetime.now(timezone.utc)
    db.tasks.update_one(
        {"_id": ObjectId(task_id)},
        {
            "$set": {
                "status": "success",
                "result": result,
                "completedAt": now,
            },
            "$push": {
                "logs": {
                    "timestamp": now,
                    "message": f"Task completed successfully. {log_message}",
                    "level": "info",
                }
            },
        },
    )


def mark_failed(db, task_id: str, error_message: str):
    """Transition task status to failed and store error."""
    now = datetime.now(timezone.utc)
    db.tasks.update_one(
        {"_id": ObjectId(task_id)},
        {
            "$set": {
                "status": "failed",
                "errorMessage": error_message,
                "completedAt": now,
            },
            "$push": {
                "logs": {
                    "timestamp": now,
                    "message": f"Task failed: {error_message}",
                    "level": "error",
                }
            },
        },
    )


# ─── Task Processor ───────────────────────────────────────────────────────────

def process_task(db, task_id: str):
    """Fetch task from DB and run the requested operation."""
    logger.info(f"Processing task: {task_id}")

    # Fetch task from MongoDB
    task = db.tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        logger.warning(f"Task {task_id} not found in DB, skipping")
        return

    # Guard: skip if already processed (idempotency)
    if task.get("status") in ("success", "failed"):
        logger.info(f"Task {task_id} already in terminal state '{task['status']}', skipping")
        return

    # Mark as running
    mark_running(db, task_id)

    try:
        result, log_message = process_operation(
            operation=task["operation"],
            text=task["inputText"],
        )
        mark_success(db, task_id, result, log_message)
        logger.info(f"Task {task_id} succeeded: {log_message}")

    except ValueError as ve:
        mark_failed(db, task_id, str(ve))
        logger.error(f"Task {task_id} failed with invalid operation: {ve}")

    except Exception as exc:
        error_msg = f"Unexpected error: {str(exc)}"
        mark_failed(db, task_id, error_msg)
        logger.error(f"Task {task_id} failed unexpectedly: {exc}", exc_info=True)


# ─── Connection Helpers ───────────────────────────────────────────────────────

def connect_redis(retries: int = 10, delay: float = 3.0) -> redis.Redis:
    """Connect to Redis with retry logic."""
    for attempt in range(1, retries + 1):
        try:
            client = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                password=REDIS_PASSWORD,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=10,
            )
            client.ping()
            logger.info(f"Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
            return client
        except redis.ConnectionError as e:
            logger.warning(f"Redis connection attempt {attempt}/{retries} failed: {e}")
            if attempt < retries:
                time.sleep(delay)
    raise ConnectionError("Could not connect to Redis after multiple attempts")


def connect_mongo(retries: int = 10, delay: float = 3.0):
    """Connect to MongoDB with retry logic."""
    for attempt in range(1, retries + 1):
        try:
            client = MongoClient(
                MONGODB_URI,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
            )
            # Force connection
            client.server_info()
            db_name = MONGODB_URI.split("/")[-1].split("?")[0]
            logger.info(f"Connected to MongoDB: {db_name}")
            return client[db_name]
        except Exception as e:
            logger.warning(f"MongoDB connection attempt {attempt}/{retries} failed: {e}")
            if attempt < retries:
                time.sleep(delay)
    raise ConnectionError("Could not connect to MongoDB after multiple attempts")


# ─── Main Loop ────────────────────────────────────────────────────────────────

def main():
    logger.info("Worker starting up...")

    redis_client = connect_redis()
    db = connect_mongo()

    logger.info(f"Listening on Redis queue: {REDIS_QUEUE_KEY}")

    while not _shutdown_requested:
        try:
            # BLPOP blocks until a task appears or timeout expires
            # This is efficient: no CPU-burning polling
            result = redis_client.blpop(REDIS_QUEUE_KEY, timeout=REDIS_BLOCK_TIMEOUT)

            if result is None:
                # Timeout expired, loop and check shutdown flag
                continue

            _, task_id = result
            task_id = task_id.strip()

            try:
                process_task(db, task_id)
            except PyMongoError as me:
                logger.error(f"MongoDB error processing task {task_id}: {me}", exc_info=True)
            except Exception as e:
                logger.error(f"Unhandled error for task {task_id}: {e}", exc_info=True)

        except redis.ConnectionError as re:
            logger.error(f"Redis connection lost: {re}. Reconnecting...")
            time.sleep(5)
            try:
                redis_client = connect_redis()
            except Exception:
                logger.error("Failed to reconnect to Redis, shutting down")
                break

        except Exception as e:
            logger.error(f"Unexpected error in main loop: {e}", exc_info=True)
            time.sleep(1)

    logger.info("Worker shut down cleanly")


if __name__ == "__main__":
    main()
