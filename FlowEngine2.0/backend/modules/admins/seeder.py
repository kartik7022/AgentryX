#!/usr/bin/env python3
# backend/modules/admins/seeder.py
"""
Admin Seeder — seeds the superadmin account in Keycloak on first startup.
Runs once on app start. If superadmin already exists, does nothing.
"""

import httpx
from backend.core.config import settings


def seed_super_admin():
    import time
    deadline = time.time() + 600
    attempt = 0
    while time.time() < deadline:
        try:
            token_res = httpx.post(
                f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
                data={"grant_type": "password", "client_id": "admin-cli",
                    "username": settings.keycloak_admin_username,
                    "password": settings.keycloak_admin_password},
                timeout=10,
            )
            if token_res.status_code == 200:
                realm_check = httpx.get(
                    f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}",
                    headers={"Authorization": f"Bearer {token_res.json().get('access_token', '')}"},
                    timeout=10,
                )
                if realm_check.status_code == 200:
                    break
        except Exception:
            pass
        attempt += 1
        print(f"[INFO] Waiting for Keycloak... attempt {attempt}")
        time.sleep(15)
    try:
        # Get admin token
        token_res = httpx.post(
            f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
            data={"grant_type": "password", "client_id": "admin-cli",
                "username": settings.keycloak_admin_username,
                "password": settings.keycloak_admin_password},
            timeout=10,
        )
        admin_token = token_res.json().get("access_token")
        if not admin_token:
            print("[WARN] Could not get Keycloak admin token for seeder.")
            return

        # Check if superadmin already exists by username or email
        users_res = httpx.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?username={settings.SUPER_ADMIN_USERNAME}&exact=true",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        users = users_res.json()
        if users:
            print(f"[INFO] Superadmin already exists. Skipping seed.")
            return
        if not users:
            email_res = httpx.get(
                f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?email={settings.SUPER_ADMIN_USERNAME}%40flowengine.internal&exact=true",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=10,
            )
            users = email_res.json()
            if users:
                print(f"[INFO] Superadmin already exists. Skipping seed.")
                return

        # Create superadmin user in Keycloak
        create_res = httpx.post(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users",
            json={
                "username": settings.SUPER_ADMIN_USERNAME,
                "email": settings.SUPER_ADMIN_USERNAME,
                "enabled": True,
                "emailVerified": True,
                "credentials": [{"type": "password", "value": settings.SUPER_ADMIN_PASSWORD, "temporary": False}],
                "attributes": {"user_type": ["superadmin"]},
            },
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        if create_res.status_code not in (200, 201):
            print(f"[WARN] Superadmin creation failed: {create_res.status_code} {create_res.text}")
            return

        # Get created user ID from Location header
        location = create_res.headers.get("Location", "")
        keycloak_user_id = location.rstrip("/").split("/")[-1]
        if not keycloak_user_id:
            print(f"[WARN] Could not extract user ID.")
            return

        # Assign superadmin realm role
        role_res = httpx.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/roles/superadmin",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        if role_res.status_code == 200:
            role_data = role_res.json()
            httpx.post(
                f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{keycloak_user_id}/role-mappings/realm",
                json=[{"id": role_data["id"], "name": role_data["name"]}],
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=10,
            )

        print(f"[INFO] Superadmin '{settings.SUPER_ADMIN_USERNAME}' created successfully in Keycloak.")

    except Exception as e:
        print(f"[WARN] Superadmin seeder failed: {e}")