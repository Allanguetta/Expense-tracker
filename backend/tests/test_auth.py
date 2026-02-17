from app.schemas.auth import RefreshTokenRequest


def test_register_login_refresh_logout(client):
    register = client.post("/auth/register", json={"email": "a@example.com", "password": "pass1234"})
    assert register.status_code == 201

    login = client.post(
        "/auth/token",
        data={"username": "a@example.com", "password": "pass1234"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200
    tokens = login.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens

    refresh = client.post("/auth/refresh", json=RefreshTokenRequest(refresh_token=tokens["refresh_token"]).model_dump())
    assert refresh.status_code == 200
    new_tokens = refresh.json()
    assert new_tokens["refresh_token"] != tokens["refresh_token"]

    logout = client.post(
        "/auth/logout",
        json=RefreshTokenRequest(refresh_token=new_tokens["refresh_token"]).model_dump(),
    )
    assert logout.status_code == 204

    refresh_again = client.post(
        "/auth/refresh",
        json=RefreshTokenRequest(refresh_token=new_tokens["refresh_token"]).model_dump(),
    )
    assert refresh_again.status_code == 401


def test_me_requires_auth(client):
    response = client.get("/users/me")
    assert response.status_code == 401
