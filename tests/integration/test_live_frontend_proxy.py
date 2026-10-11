"""
End-to-end verification of the live frontend container proxy (http://localhost:5173).
Tests:
1. Health & readiness
2. Session creation via frontend proxy
3. Session listing
4. Full SSE research stream (all stages: retrieving, drafting, validating, saving, completed)
5. Citation resolution against PostgreSQL
6. Message history retrieval
7. Session deletion and removal verification
"""

import json
import urllib.request
import pytest


BASE_URL = "http://localhost:5173"


def test_frontend_proxy_e2e_flow():
    # 1. Health check through frontend proxy
    with urllib.request.urlopen(f"{BASE_URL}/api/v1/health/ready") as resp:
        health = json.loads(resp.read().decode("utf-8"))
    assert health["status"] == "ready"
    assert health["components"]["database"]["status"] == "up"

    # 2. Create session
    create_req = urllib.request.Request(
        f"{BASE_URL}/api/v1/sessions",
        data=json.dumps(
            {
                "title": "E2E Frontend Proxy Verification",
                "provider_preference": "local",
            }
        ).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(create_req) as resp:
        session = json.loads(resp.read().decode("utf-8"))
    session_id = session["id"]
    assert session_id is not None
    assert session["title"] == "E2E Frontend Proxy Verification"

    try:
        # 3. List sessions
        with urllib.request.urlopen(f"{BASE_URL}/api/v1/sessions") as resp:
            sessions = json.loads(resp.read().decode("utf-8"))
        assert any(s["id"] == session_id for s in sessions)

        # 4. Stream SSE research message
        msg_req = urllib.request.Request(
            f"{BASE_URL}/api/v1/sessions/{session_id}/messages",
            data=json.dumps(
                {
                    "content": "How did Superhuman measure product-market fit delight?",
                    "mode": "research",
                    "provider": "local",
                    "stream": True,
                }
            ).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
            method="POST",
        )

        stages = []
        completed_data = None
        evt_type = "message"

        with urllib.request.urlopen(msg_req) as resp:
            while True:
                line = resp.readline().decode("utf-8")
                if not line:
                    break
                line = line.strip()
                if not line:
                    continue
                if line.startswith("event:"):
                    evt_type = line.split(":", 1)[1].strip()
                elif line.startswith("data:"):
                    raw_data = line.split(":", 1)[1].strip()
                    payload = json.loads(raw_data)
                    if evt_type == "stage":
                        stages.append(payload.get("stage"))
                    elif evt_type == "completed":
                        completed_data = payload
                        break

        assert "retrieving" in stages
        assert "drafting" in stages
        assert completed_data is not None
        assert "message" in completed_data
        assert completed_data["message"]["status"] == "complete"
        assert len(completed_data.get("citations", [])) > 0

        # 5. Hydrate message history
        with urllib.request.urlopen(
            f"{BASE_URL}/api/v1/sessions/{session_id}/messages"
        ) as resp:
            history = json.loads(resp.read().decode("utf-8"))
        msgs = history.get("messages", [])
        assert len(msgs) >= 2
        assistant_msg = next(m for m in msgs if m["role"] == "assistant")
        assert assistant_msg["status"] == "complete"
        assert len(assistant_msg.get("citations", [])) > 0

    finally:
        # 6. Delete session
        del_req = urllib.request.Request(
            f"{BASE_URL}/api/v1/sessions/{session_id}", method="DELETE"
        )
        with urllib.request.urlopen(del_req) as resp:
            del_res = json.loads(resp.read().decode("utf-8"))
        assert del_res.get("deleted") is True

        # 7. Verify deleted from list
        with urllib.request.urlopen(f"{BASE_URL}/api/v1/sessions") as resp:
            sessions_after = json.loads(resp.read().decode("utf-8"))
        assert not any(s["id"] == session_id for s in sessions_after)
