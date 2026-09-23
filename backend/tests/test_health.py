from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok() -> None:
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "flashrisk-backend"
    assert body["version"]


def test_health_cors_allows_frontend_origin() -> None:
    res = client.get("/api/health", headers={"Origin": "http://localhost:3417"})
    assert res.headers["access-control-allow-origin"] == "http://localhost:3417"
