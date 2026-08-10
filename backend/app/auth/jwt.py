"""JWT creation and verification using HS256."""

import datetime

from jose import JWTError, jwt

from app.config import get_config

ALGORITHM = "HS256"
TOKEN_EXPIRY = datetime.timedelta(days=7)


def create_token(user_id: int) -> str:
    config = get_config()
    now = datetime.datetime.utcnow()
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + TOKEN_EXPIRY,
    }
    return str(jwt.encode(payload, config.jwt_secret, algorithm=ALGORITHM))


def decode_token(token: str) -> int | None:
    config = get_config()
    try:
        payload = jwt.decode(token, config.jwt_secret, algorithms=[ALGORITHM])
    except JWTError:
        return None
    sub = payload.get("sub")
    if sub is None:
        return None
    try:
        return int(sub)
    except (ValueError, TypeError):
        return None
