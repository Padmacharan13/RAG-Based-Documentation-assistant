import os
from datetime import datetime, timedelta, timezone
import jwt
import bcrypt

# Configuration
SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("FATAL: JWT_SECRET_KEY environment variable is not set.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 2


def hash_password(password: str) -> str:
    """
    Hashes a plain password using direct bcrypt.
    """
    salt = bcrypt.gensalt()
    # Bcrypt has a 72-byte limit; truncate to avoid ValueError
    return bcrypt.hashpw(password.encode("utf-8")[:72], salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain password against the hashed version using direct bcrypt.
    """
    # Bcrypt has a 72-byte limit; truncate to match hash_password
    return bcrypt.checkpw(
        plain_password.encode("utf-8")[:72], 
        hashed_password.encode("utf-8")
    )


def create_access_token(user_id: int, username: str) -> str:
    """
    Creates a JWT access token with user payload and expiration.
    """
    # Use timezone-aware UTC datetime (Modern Python best practice)
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": str(user_id),
        "username": username,
        "exp": expire
    }
    encoded_jwt = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> dict:
    """
    Decodes a JWT access token. Returns payload dict if valid, raises exception if expired/invalid.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired")
    except jwt.PyJWTError:
        raise ValueError("Invalid token")
