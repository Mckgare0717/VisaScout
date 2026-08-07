import os
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request, Depends

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_DAYS = 7


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_DAYS),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def _extract_token(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    token = request.cookies.get("session_token") or request.cookies.get("access_token")
    if token:
        return token
    raise HTTPException(status_code=401, detail="Not authenticated")


def make_get_current_user(db):
    async def get_current_user(request: Request) -> dict:
        token = _extract_token(request)

        # 1) Emergent/Google session token
        sess = await db.user_sessions.find_one({"session_token": token})
        if sess:
            expires_at = sess.get("expires_at")
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at and expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at and expires_at < datetime.now(timezone.utc):
                raise HTTPException(status_code=401, detail="Session expired, please log in again")
            user = await db.users.find_one({"id": sess["user_id"]}, {"_id": 0, "password_hash": 0})
            if not user:
                raise HTTPException(status_code=401, detail="User not found")
            return user

        # 2) Email/password JWT
        try:
            payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Session expired, please log in again")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid session")
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user

    return get_current_user


def make_get_current_admin(db):
    get_current_user = make_get_current_user(db)

    async def get_current_admin(request: Request) -> dict:
        user = await get_current_user(request)
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        return user

    return get_current_admin


async def seed_demo_user(db):
    # Demo standard user
    email = os.environ.get("DEMO_EMAIL", "demo@visascout.app")
    password = os.environ.get("DEMO_PASSWORD", "Demo1234!")
    existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": email,
            "password_hash": hash_password(password),
            "name": "Demo Traveller",
            "role": "user",
            "provider": "email",
            "picture": None,
            "notify_outdated": True,
            "seen_disclaimer": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    else:
        updates = {}
        if not verify_password(password, existing["password_hash"]):
            updates["password_hash"] = hash_password(password)
        if existing.get("role") is None:
            updates["role"] = "user"
        if updates:
            await db.users.update_one({"email": email}, {"$set": updates})

    # Admin user
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@visascout.app")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin1234!")
    admin = await db.users.find_one({"email": admin_email})
    if admin is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "VisaScout Admin",
            "role": "admin",
            "provider": "email",
            "picture": None,
            "notify_outdated": True,
            "seen_disclaimer": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    else:
        updates = {"role": "admin"}
        if not verify_password(admin_password, admin["password_hash"]):
            updates["password_hash"] = hash_password(admin_password)
        await db.users.update_one({"email": admin_email}, {"$set": updates})

