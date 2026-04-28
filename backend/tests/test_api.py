import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from src.db.database import init_db, async_engine
from main import app


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="session")
async def client():
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await async_engine.dispose()


@pytest.mark.anyio
async def test_health(client: AsyncClient):
    r = await client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "tts" in data
    assert "llm" in data


@pytest.mark.anyio
async def test_library_empty(client: AsyncClient):
    r = await client.get("/api/library")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0
    assert data["tracks"] == []


@pytest.mark.anyio
async def test_queue_empty(client: AsyncClient):
    r = await client.get("/api/queue")
    assert r.status_code == 200
    assert r.json()["queue"] == []


@pytest.mark.anyio
async def test_mood_options(client: AsyncClient):
    r = await client.get("/api/mood/options")
    assert r.status_code == 200
    moods = r.json()["moods"]
    assert "chill" in moods
    assert "hype" in moods


@pytest.mark.anyio
async def test_set_mood(client: AsyncClient):
    r = await client.post("/api/mood", json={"mood": "hype"})
    assert r.status_code == 200
    assert r.json()["mood"] == "hype"


@pytest.mark.anyio
async def test_set_mood_invalid(client: AsyncClient):
    r = await client.post("/api/mood", json={"mood": "nonexistent"})
    assert r.status_code == 400


@pytest.mark.anyio
async def test_personas(client: AsyncClient):
    r = await client.get("/api/personas")
    assert r.status_code == 200
    personas = r.json()["personas"]
    assert "smooth" in personas


@pytest.mark.anyio
async def test_set_persona(client: AsyncClient):
    r = await client.post("/api/personas/select", json={"persona": "hype"})
    assert r.status_code == 200


@pytest.mark.anyio
async def test_request_track_not_found(client: AsyncClient):
    r = await client.post("/api/requests", json={"track_id": 99999})
    assert r.status_code == 404


@pytest.mark.anyio
async def test_stats_overview(client: AsyncClient):
    r = await client.get("/api/stats/overview")
    assert r.status_code == 200
    data = r.json()
    assert "total_plays" in data
    assert "total_tracks" in data


@pytest.mark.anyio
async def test_playlists_crud(client: AsyncClient):
    r = await client.post("/api/playlists", json={"name": "Test Playlist"})
    assert r.status_code == 201
    pl_id = r.json()["id"]

    r = await client.get("/api/playlists")
    assert any(p["id"] == pl_id for p in r.json()["playlists"])

    r = await client.delete(f"/api/playlists/{pl_id}")
    assert r.status_code == 200


@pytest.mark.anyio
async def test_playlist_duplicate_name_returns_409(client: AsyncClient):
    r = await client.post("/api/playlists", json={"name": "Dupe"})
    assert r.status_code == 201
    r = await client.post("/api/playlists", json={"name": "Dupe"})
    assert r.status_code == 409


@pytest.mark.anyio
async def test_playlist_404_paths(client: AsyncClient):
    r = await client.get("/api/playlists/99999")
    assert r.status_code == 404
    r = await client.delete("/api/playlists/99999")
    assert r.status_code == 404
    r = await client.put("/api/playlists/99999", json={"name": "x"})
    assert r.status_code == 404
    r = await client.post("/api/playlists/99999/queue")
    assert r.status_code == 404


@pytest.mark.anyio
async def test_request_session_id_too_long_rejected(client: AsyncClient):
    r = await client.post(
        "/api/requests",
        json={"track_id": 1, "session_id": "x" * 100},
    )
    assert r.status_code == 422  # pydantic validation error


@pytest.mark.anyio
async def test_llm_settings_rejects_bad_url(client: AsyncClient):
    r = await client.post(
        "/api/llm/settings",
        json={
            "url": "file:///etc/passwd",
            "model": "x",
            "api_key": "",
            "use_openai_compat": False,
        },
    )
    assert r.status_code == 400


@pytest.mark.anyio
async def test_llm_settings_accepts_localhost(client: AsyncClient):
    r = await client.post(
        "/api/llm/settings",
        json={
            "url": "http://localhost:11434",
            "model": "llama3.2:3b",
            "api_key": "",
            "use_openai_compat": False,
        },
    )
    assert r.status_code == 200


@pytest.mark.anyio
async def test_library_search(client: AsyncClient):
    r = await client.get("/api/library/search?q=test")
    assert r.status_code == 200
    assert "tracks" in r.json()
