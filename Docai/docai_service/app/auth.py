from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import bcrypt
from pydantic import BaseModel

from app.db import SessionLocal, User, get_db

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY must be set")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/jwt/login", auto_error=False)
TOKEN_BLOCKLIST: set[str] = set()


class RegisterRequest(BaseModel):
    email: str
    password: str
    role: str = "viewer"


def get_password_hash(password: str) -> str:
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        return False


def auth_disabled() -> bool:
    return os.getenv("AUTH_DISABLED", "false").lower() == "true"


def create_access_token(data: dict[str, Any], expires_delta: timedelta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc), "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict[str, Any]:
    if token in TOKEN_BLOCKLIST:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


def get_user_by_email(db_session, email: str):
    return db_session.query(User).filter(User.email == email).first()


def authenticate_user(db_session, email: str, password: str):
    user = get_user_by_email(db_session, email)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def create_user(db_session, email: str, password: str, role: str = "viewer") -> User:
    user = User(email=email, hashed_password=get_password_hash(password), role=role, is_active=True)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _synthetic_admin() -> User:
    return User(
        email="anonymous@docai.local",
        hashed_password="",
        role="admin",
        is_active=True,
    )


def get_current_user(token: str | None = Depends(oauth2_scheme), db=Depends(get_db)) -> User:
    if auth_disabled() and not token:
        return _synthetic_admin()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = verify_token(token)

    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = get_user_by_email(db, email)
    if not user or not getattr(user, "is_active", True):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def get_current_user_optional(token: str | None = Depends(oauth2_scheme), db=Depends(get_db)) -> User | None:
    if auth_disabled() and not token:
        return _synthetic_admin()
    if not token:
        return None
    try:
        return get_current_user(token=token, db=db)
    except HTTPException:
        return None


def require_role(*roles: str) -> Callable:
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return current_user

    return dependency
