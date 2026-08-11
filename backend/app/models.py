import datetime

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
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
        order_by="TrainingDay.position",
    )

    __table_args__ = (
        UniqueConstraint("user_id", "normalized_name", name="uq_routine_user_normalized_name"),
    )


class TrainingDay(Base):
    __tablename__ = "training_days"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    routine_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("routines.id", ondelete="CASCADE"), nullable=False
    )
    routine: Mapped["Routine"] = relationship("Routine", back_populates="training_days")
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.datetime.utcnow
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
    )

    __table_args__ = (
        UniqueConstraint("routine_id", "position", name="uq_training_day_routine_position"),
    )
