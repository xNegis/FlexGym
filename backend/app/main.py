import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.exercise_configuration import router as exercise_config_router
from app.api.exercises import router as exercises_router
from app.api.fitness_profile import router as fitness_profile_router
from app.api.health import router as health_router
from app.api.routines import router as routines_router
from app.api.schedule import router as schedule_router
from app.api.training_days import router as training_days_router
from app.config import get_config

logging.basicConfig(level=logging.INFO)

config = get_config()

app = FastAPI(title="FlexGym", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(fitness_profile_router, prefix="/api")
app.include_router(exercises_router, prefix="/api")
app.include_router(routines_router, prefix="/api")
app.include_router(training_days_router, prefix="/api")
app.include_router(exercise_config_router, prefix="/api")
app.include_router(schedule_router, prefix="/api")
