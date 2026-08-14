import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.active_routine import router as active_routine_router
from app.api.auth import router as auth_router
from app.api.body_progress_photos import router as body_progress_photos_router
from app.api.body_weight import router as body_weight_router
from app.api.exercise_configuration import router as exercise_config_router
from app.api.exercises import router as exercises_router
from app.api.fitness_profile import router as fitness_profile_router
from app.api.health import router as health_router
from app.api.progress import router as progress_router
from app.api.routines import router as routines_router
from app.api.schedule import router as schedule_router
from app.api.training_days import router as training_days_router
from app.api.workouts import router as workouts_router
from app.config import get_config
from app.db import SessionLocal
from app.services import photo_service
from app.storage import get_object_store
from app.storage.base import StorageUnavailableError

logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)

config = get_config()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    _retry_pending_photo_deletions()
    yield


def _retry_pending_photo_deletions() -> None:
    config = get_config()
    if not (config.s3_bucket and config.s3_region):
        return
    try:
        with SessionLocal() as session:
            photo_service.retry_pending_deletions(session, get_object_store())
    except StorageUnavailableError:
        logger.info("Object storage not configured; skipping pending photo deletion retry")
    except Exception:
        logger.exception("Failed to retry pending photo deletions")


app = FastAPI(title="FormCadence", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(active_routine_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(fitness_profile_router, prefix="/api")
app.include_router(exercises_router, prefix="/api")
app.include_router(routines_router, prefix="/api")
app.include_router(training_days_router, prefix="/api")
app.include_router(exercise_config_router, prefix="/api")
app.include_router(schedule_router, prefix="/api")
app.include_router(progress_router, prefix="/api")
app.include_router(workouts_router)
app.include_router(body_weight_router, prefix="/api")
app.include_router(body_progress_photos_router, prefix="/api")
