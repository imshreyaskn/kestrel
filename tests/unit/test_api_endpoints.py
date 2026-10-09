"""
Unit tests for FastAPI core endpoints:
- Liveness probe (/api/v1/health/live)
- Configuration introspection (/api/v1/config)
- Provider status (/api/v1/providers)
- Correlation ID propagation and header timing
"""

from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def test_root_ping():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data.get("app") == "The Lenny Growth Assistant (Kestrel)"
    assert data.get("version") == "1.0.0"


def test_health_live_probe():
    response = client.get("/api/v1/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "ok"
    assert data.get("service") == "kestrel-api"
    assert "timestamp" in data


def test_config_endpoint_returns_safe_ui_values_no_secrets():
    response = client.get("/api/v1/config")
    assert response.status_code == 200
    data = response.json()
    assert data.get("default_provider") in ["local", "cloud"]
    assert data.get("embedding_dimensions") == 768
    assert "cloud_models" in data
    assert "cloud_enabled" in data
    # Ensure no secrets or API keys are exposed
    assert "api_key" not in str(data).lower()
    assert "token" not in str(data).lower()
    assert "password" not in str(data).lower()


def test_providers_status_endpoint():
    response = client.get("/api/v1/providers")
    assert response.status_code == 200
    data = response.json()
    assert "local" in data
    assert "cloud" in data
    assert data["local"]["provider"] == "ollama"


def test_correlation_id_and_timing_headers_propagated():
    custom_id = "test-corr-uuid-12345"
    response = client.get("/api/v1/health/live", headers={"x-correlation-id": custom_id})
    assert response.status_code == 200
    assert response.headers.get("x-correlation-id") == custom_id
    assert "x-response-time-ms" in response.headers
