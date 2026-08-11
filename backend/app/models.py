import datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.datetime.utcnow
    )


class FitnessProfile(Base):
    __tablename__ = "fitness_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    user: Mapped["User"] = relationship("User")
    date_of_birth: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    biological_sex: Mapped[str] = mapped_column(String, nullable=False)
    height_cm: Mapped[float] = mapped_column(Numeric(4, 1), nullable=False)
    weight_kg: Mapped[float] = mapped_column(Numeric(5, 1), nullable=False)
    body_fat_percentage: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    training_experience: Mapped[str] = mapped_column(String, nullable=False)
    primary_goal: Mapped[str] = mapped_column(String, nullable=False)
    training_days_per_week: Mapped[int] = mapped_column(Integer, nullable=False)
    preferred_workout_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    training_environment: Mapped[str] = mapped_column(String, nullable=False)
    physical_limitations: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.datetime.utcnow
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
    )


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    primary_muscle: Mapped[str] = mapped_column(String, nullable=False)
    secondary_muscles: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    equipment: Mapped[str] = mapped_column(String, nullable=False)
    movement_pattern: Mapped[str] = mapped_column(String, nullable=False)
    execution_type: Mapped[str] = mapped_column(String, nullable=False)
    instructions: Mapped[str] = mapped_column(String(500), nullable=False)


class Routine(Base):
    __tablename__ = "routines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    user: Mapped["User"] = relationship("User")
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(120), nullable=False)
    objective: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.datetime.utcnow
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
    )
    training_days: Mapped[list["TrainingDay"]] = relationship(
        "TrainingDay",
        back_populates="routine",
        cascade="all, delete-orphan",
    )
    schedule_assignments: Mapped[list["RoutineScheduleAssignment"]] = relationship(
        "RoutineScheduleAssignment",
        back_populates="routine",
        cascade="all, delete-orphan",
        foreign_keys="RoutineScheduleAssignment.routine_id",
    )
    active_routine: Mapped["ActiveRoutine | None"] = relationship(
        "ActiveRoutine",
        back_populates="routine",
        uselist=False,
        cascade="all, delete-orphan",
        foreign_keys="ActiveRoutine.routine_id",
    )

    __table_args__ = (
        UniqueConstraint("user_id", "normalized_name", name="uq_routine_user_normalized_name"),
        UniqueConstraint("id", "user_id", name="uq_routine_id_user_id"),
    )


class ActiveRoutine(Base):
    __tablename__ = "active_routines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    user: Mapped["User"] = relationship("User")
    routine_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("routines.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    routine: Mapped["Routine"] = relationship(
        "Routine", back_populates="active_routine", foreign_keys=[routine_id]
    )
    activated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.datetime.utcnow
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["routine_id", "user_id"],
            ["routines.id", "routines.user_id"],
            name="fk_active_routine_routine_user",
        ),
    )


class TrainingDay(Base):
    __tablename__ = "training_days"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    routine_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("routines.id", ondelete="CASCADE"), nullable=False
    )
    routine: Mapped["Routine"] = relationship("Routine", back_populates="training_days")
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.datetime.utcnow
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
    )

    exercise_configurations: Mapped[list["ExerciseConfiguration"]] = relationship(
        "ExerciseConfiguration",
        back_populates="training_day",
        cascade="all, delete-orphan",
        order_by="ExerciseConfiguration.position",
    )
    schedule_assignment: Mapped["RoutineScheduleAssignment | None"] = relationship(
        "RoutineScheduleAssignment",
        back_populates="training_day",
        uselist=False,
        cascade="all, delete-orphan",
        foreign_keys="RoutineScheduleAssignment.training_day_id",
    )

    __table_args__ = (UniqueConstraint("id", "routine_id", name="uq_training_day_id_routine"),)


class RoutineScheduleAssignment(Base):
    __tablename__ = "routine_schedule_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    routine_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("routines.id", ondelete="CASCADE"), nullable=False
    )
    routine: Mapped["Routine"] = relationship("Routine", back_populates="schedule_assignments")
    training_day_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("training_days.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    training_day: Mapped["TrainingDay"] = relationship(
        "TrainingDay",
        back_populates="schedule_assignment",
        foreign_keys=[training_day_id],
    )
    week_position: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        ForeignKeyConstraint(
            ["training_day_id", "routine_id"],
            ["training_days.id", "training_days.routine_id"],
            name="fk_schedule_assignment_day_routine",
            ondelete="CASCADE",
        ),
        UniqueConstraint("routine_id", "week_position", name="uq_schedule_assignment_routine_pos"),
        CheckConstraint(
            "week_position >= 1 AND week_position <= 7",
            name="ck_schedule_assignment_week_position",
        ),
    )


class ExerciseConfiguration(Base):
    __tablename__ = "exercise_configurations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    training_day_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("training_days.id", ondelete="CASCADE"), nullable=False
    )
    training_day: Mapped["TrainingDay"] = relationship(
        "TrainingDay", back_populates="exercise_configurations"
    )
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id"), nullable=False)
    exercise: Mapped["Exercise"] = relationship("Exercise")
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    target_type: Mapped[str] = mapped_column(String, nullable=False)
    rest_after_exercise_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.datetime.utcnow
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
    )

    configured_sets: Mapped[list["ConfiguredSet"]] = relationship(
        "ConfiguredSet",
        back_populates="exercise_configuration",
        cascade="all, delete-orphan",
        order_by="ConfiguredSet.position",
    )

    __table_args__ = (
        UniqueConstraint(
            "training_day_id", "position", name="uq_exercise_config_training_day_position"
        ),
        UniqueConstraint(
            "training_day_id", "exercise_id", name="uq_exercise_config_training_day_exercise"
        ),
    )


class ConfiguredSet(Base):
    __tablename__ = "configured_sets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_configuration_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("exercise_configurations.id", ondelete="CASCADE"), nullable=False
    )
    exercise_configuration: Mapped["ExerciseConfiguration"] = relationship(
        "ExerciseConfiguration", back_populates="configured_sets"
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    target_value: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False)
    target_weight_kg: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    target_rir: Mapped[int | None] = mapped_column(Integer, nullable=True)
    eccentric_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stretched_pause_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    concentric_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    peak_contraction_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rest_after_set_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "exercise_configuration_id",
            "position",
            name="uq_configured_set_config_position",
        ),
    )
