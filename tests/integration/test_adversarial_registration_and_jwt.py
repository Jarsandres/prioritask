from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from jose import jwt
from sqlalchemy import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.enums import UserRole
from app.models.user import Usuario
from app.services.auth import ALGORITHM, SECRET_KEY, hash_password


class TestRegistrationPrivilegeEscalation:
    """
    Adversarial tests to verify that public registration endpoints cannot be exploited
    via mass assignment or JSON payload tampering to create users with elevated privileges.
    """

    @pytest.mark.asyncio
    async def test_register_with_is_superuser_true_payload(self, async_client, session: AsyncSession):
        email = f"attacker-superuser-{uuid4()}@example.com"
        malicious_payload = {
            "email": email,
            "nombre": "Attacker",
            "password": "attackPassword123",
            "is_superuser": True,
            "role": "ADMIN",
        }

        # 1. Send registration request with privilege escalation attributes
        reg_resp = await async_client.post("/api/v1/auth/register", json=malicious_payload)
        assert reg_resp.status_code == 201
        data = reg_resp.json()

        # 2. Verify response model does not grant admin status
        assert data["email"] == email
        assert data["is_superuser"] is False
        assert data["role"] == UserRole.USER.value

        # 3. Direct DB forensic check
        db_user = await session.scalar(select(Usuario).where(Usuario.email == email))
        assert db_user is not None
        assert db_user.is_superuser is False
        assert db_user.role == UserRole.USER

        # 4. Attempt login and verify JWT claims
        login_resp = await async_client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "attackPassword123"},
        )
        assert login_resp.status_code == 200
        token_data = login_resp.json()
        access_token = token_data["access_token"]

        payload = jwt.decode(access_token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["is_superuser"] is False
        assert payload["role"] == "USER"
        assert payload["sub"] == str(db_user.id)

        # 5. Verify attacker cannot access admin-only endpoint
        admin_endpoint_resp = await async_client.get(
            "/api/v1/users",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert admin_endpoint_resp.status_code == 403
        assert "No tiene permisos de administrador" in admin_endpoint_resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_register_with_arbitrary_extra_fields(self, async_client, session: AsyncSession):
        email = f"fuzz-user-{uuid4()}@example.com"
        fuzz_payload = {
            "email": email,
            "nombre": "Fuzzer",
            "password": "fuzzPassword123",
            "is_superuser": 1,
            "is_admin": True,
            "admin": True,
            "role": "SUPERUSER",
            "roles": ["ADMIN", "SUPERADMIN"],
            "permissions": ["all"],
        }

        reg_resp = await async_client.post("/api/v1/auth/register", json=fuzz_payload)
        assert reg_resp.status_code == 201
        data = reg_resp.json()

        assert data["is_superuser"] is False
        assert data["role"] == UserRole.USER.value

        db_user = await session.scalar(select(Usuario).where(Usuario.email == email))
        assert db_user is not None
        assert db_user.is_superuser is False
        assert db_user.role == UserRole.USER


class TestJWTClaimsAndAccessControl:
    """
    Adversarial and functional verification of JWT claim encoding, token integrity,
    and role-based authorization for Admin and Standard users.
    """

    @pytest.mark.asyncio
    async def test_admin_login_jwt_claims_and_access(self, async_client, session: AsyncSession):
        admin_email = f"admin-{uuid4()}@example.com"
        admin_user = Usuario(
            id=uuid4(),
            email=admin_email,
            nombre="Super Admin",
            hashed_password=hash_password("adminSecret123"),
            is_active=True,
            is_superuser=True,
        )
        session.add(admin_user)
        await session.commit()
        await session.refresh(admin_user)

        # Login as Admin
        login_resp = await async_client.post(
            "/api/v1/auth/login",
            json={"email": admin_email, "password": "adminSecret123"},
        )
        assert login_resp.status_code == 200
        token_data = login_resp.json()
        access_token = token_data["access_token"]
        refresh_token = token_data["refresh_token"]

        # Inspect Access Token Claims
        access_payload = jwt.decode(access_token, SECRET_KEY, algorithms=[ALGORITHM])
        assert access_payload["sub"] == str(admin_user.id)
        assert access_payload["type"] == "access"
        assert access_payload["is_superuser"] is True
        assert access_payload["role"] == "ADMIN"

        # Inspect Refresh Token Claims
        refresh_payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        assert refresh_payload["sub"] == str(admin_user.id)
        assert refresh_payload["type"] == "refresh"

        # Access GET /api/v1/users as Admin -> 200 OK
        users_resp = await async_client.get(
            "/api/v1/users",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert users_resp.status_code == 200
        users_list = users_resp.json()
        assert isinstance(users_list, list)
        assert any(u["email"] == admin_email and u["role"] == "ADMIN" and u["is_superuser"] is True for u in users_list)

        # Refresh token flow for Admin
        refresh_resp = await async_client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert refresh_resp.status_code == 200
        new_access_token = refresh_resp.json()["access_token"]
        new_access_payload = jwt.decode(new_access_token, SECRET_KEY, algorithms=[ALGORITHM])
        assert new_access_payload["is_superuser"] is True
        assert new_access_payload["role"] == "ADMIN"

    @pytest.mark.asyncio
    async def test_standard_user_jwt_claims_and_forbidden_users_list(self, async_client, session: AsyncSession):
        user_email = f"user-{uuid4()}@example.com"
        std_user = Usuario(
            id=uuid4(),
            email=user_email,
            nombre="Standard User",
            hashed_password=hash_password("stdSecret123"),
            is_active=True,
            is_superuser=False,
        )
        session.add(std_user)
        await session.commit()
        await session.refresh(std_user)

        # Login as Standard User
        login_resp = await async_client.post(
            "/api/v1/auth/login",
            json={"email": user_email, "password": "stdSecret123"},
        )
        assert login_resp.status_code == 200
        token_data = login_resp.json()
        access_token = token_data["access_token"]
        refresh_token = token_data["refresh_token"]

        # Inspect claims
        payload = jwt.decode(access_token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["is_superuser"] is False
        assert payload["role"] == "USER"

        # Standard user calling GET /api/v1/users -> 403 Forbidden
        users_resp = await async_client.get(
            "/api/v1/users",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert users_resp.status_code == 403
        assert "No tiene permisos de administrador" in users_resp.json()["detail"]

        # Standard user calling /api/v1/auth/me -> 200 OK with role USER
        me_resp = await async_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert me_resp.status_code == 200
        me_data = me_resp.json()
        assert me_data["is_superuser"] is False
        assert me_data["role"] == "USER"

        # Refresh token flow retains USER role
        refresh_resp = await async_client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert refresh_resp.status_code == 200
        new_access = refresh_resp.json()["access_token"]
        new_payload = jwt.decode(new_access, SECRET_KEY, algorithms=[ALGORITHM])
        assert new_payload["is_superuser"] is False
        assert new_payload["role"] == "USER"

    @pytest.mark.asyncio
    async def test_forged_admin_token_with_wrong_secret_rejected(self, async_client, session: AsyncSession):
        user_email = f"victim-{uuid4()}@example.com"
        victim_user = Usuario(
            id=uuid4(),
            email=user_email,
            nombre="Victim",
            hashed_password=hash_password("pwd"),
            is_active=True,
            is_superuser=False,
        )
        session.add(victim_user)
        await session.commit()

        # Attacker crafts token claiming is_superuser=True with attacker secret
        forged_payload = {
            "sub": str(victim_user.id),
            "type": "access",
            "is_superuser": True,
            "role": "ADMIN",
            "exp": datetime.now(UTC) + timedelta(minutes=30),
        }
        forged_token = jwt.encode(forged_payload, "wrong-attacker-secret", algorithm=ALGORITHM)

        resp = await async_client.get(
            "/api/v1/users",
            headers={"Authorization": f"Bearer {forged_token}"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_refresh_token_cannot_be_used_as_access_token(self, async_client, session: AsyncSession):
        admin_email = f"admin-{uuid4()}@example.com"
        admin_user = Usuario(
            id=uuid4(),
            email=admin_email,
            hashed_password=hash_password("pwd"),
            is_active=True,
            is_superuser=True,
        )
        session.add(admin_user)
        await session.commit()

        login_resp = await async_client.post(
            "/api/v1/auth/login",
            json={"email": admin_email, "password": "pwd"},
        )
        refresh_token = login_resp.json()["refresh_token"]

        # Try to use refresh token as Bearer token for protected endpoints
        resp_users = await async_client.get(
            "/api/v1/users",
            headers={"Authorization": f"Bearer {refresh_token}"},
        )
        assert resp_users.status_code == 401

        resp_me = await async_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {refresh_token}"},
        )
        assert resp_me.status_code == 401
