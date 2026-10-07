"""
Locust load & stress testing scenario for Prioritask API.

Validates backend resilience under concurrency:
- Authentication & JWT handling
- Task retrieval and creation
- Room analytics queries (GET /api/v1/rooms/{room_id}/analytics)
- Rate limiting resilience (graceful handling of HTTP 429)
"""

import os
import random
from uuid import uuid4

from locust import HttpUser, between, task


class PrioritaskUser(HttpUser):
    wait_time = between(1.0, 3.0)
    token: str = ""
    room_id: str = ""

    def on_start(self) -> None:
        """Authenticate user and initialize workspace room."""
        unique_suffix = uuid4().hex[:8]
        email = f"loadtest_{unique_suffix}@example.com"
        password = "SecurePassword123!"

        # 1. Register user
        reg_payload = {
            "email": email,
            "nombre": f"LoadUser_{unique_suffix}",
            "password": password,
        }
        reg_resp = self.client.post("/api/v1/auth/register", json=reg_payload)
        if reg_resp.status_code == 201:
            data = reg_resp.json()
            self.token = data.get("access_token", "")
        else:
            # Fallback to login if already exists
            login_resp = self.client.post(
                "/api/v1/auth/token",
                data={"username": email, "password": password},
            )
            if login_resp.status_code == 200:
                self.token = login_resp.json().get("access_token", "")

        # 2. Create room for testing
        headers = self._headers()
        if self.token:
            room_resp = self.client.post(
                "/api/v1/rooms",
                json={"nombre": f"LoadRoom_{unique_suffix}"},
                headers=headers,
            )
            if room_resp.status_code == 201:
                self.room_id = room_resp.json().get("id", "")

    def _headers(self) -> dict[str, str]:
        if not self.token:
            return {}
        return {"Authorization": f"Bearer {self.token}"}

    @task(3)
    def get_tasks_list(self) -> None:
        """Retrieve task list with optional filtering."""
        headers = self._headers()
        if not headers:
            return
        with self.client.get(
            "/api/v1/tasks",
            headers=headers,
            catch_response=True,
            name="/api/v1/tasks [GET]",
        ) as response:
            if response.status_code in (200, 429):
                response.success()
            else:
                response.failure(f"Unexpected status: {response.status_code}")

    @task(2)
    def create_task(self) -> None:
        """Create a new task in the user's room."""
        headers = self._headers()
        if not headers or not self.room_id:
            return

        payload = {
            "titulo": f"Load task {uuid4().hex[:6]}",
            "categoria": random.choice(["LIMPIEZA", "COMPRA", "MANTENIMIENTO", "OTRO"]),
            "peso": random.choice([1.0, 1.5, 2.0, 3.0]),
            "room_id": self.room_id,
        }

        with self.client.post(
            "/api/v1/tasks",
            json=payload,
            headers=headers,
            catch_response=True,
            name="/api/v1/tasks [POST]",
        ) as response:
            if response.status_code in (201, 429):
                response.success()
            else:
                response.failure(f"Task creation failed with {response.status_code}")

    @task(4)
    def get_room_analytics(self) -> None:
        """Query room analytics (stress-testing aggregation & calculations)."""
        headers = self._headers()
        if not headers or not self.room_id:
            return

        with self.client.get(
            f"/api/v1/rooms/{self.room_id}/analytics",
            headers=headers,
            catch_response=True,
            name="/api/v1/rooms/{room_id}/analytics [GET]",
        ) as response:
            if response.status_code in (200, 429):
                response.success()
            else:
                response.failure(f"Analytics query failed with {response.status_code}")


if __name__ == "__main__":
    host = os.getenv("TARGET_HOST", "http://127.0.0.1:8000")
    print(f"Run load test with: locust -f tests/load/locustfile.py --host={host}")
