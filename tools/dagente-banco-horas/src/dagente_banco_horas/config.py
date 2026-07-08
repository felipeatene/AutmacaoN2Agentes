"""Configuração centralizada via variáveis de ambiente."""

from __future__ import annotations

import os
from pathlib import Path

# --- Azure AD (não-secretos) ---
AZURE_TENANT_ID = "3737367d-87d3-46ca-b00f-21b50c428b5e"
DAGENTE_CLIENT_ID = "dcd4a76f-f189-495f-a6f4-87fb1c63bd76"
AZURE_AUTHORITY = f"https://login.microsoftonline.com/{AZURE_TENANT_ID}"
DAGENTE_SCOPES = [
    f"{DAGENTE_CLIENT_ID}/.default",
    "openid",
    "profile",
    "offline_access",
]

# --- Apigee (não-secretos) ---
APIGEE_BASE_URL = "https://api-hub.localiza.com"
APIGEE_HEADER_CLIENT_ID = "03b27e5b1c9bd889e014043831d17785"
APIGEE_TOKEN_PATH = "/oauth/token/accesstoken"
BANCO_HORAS_PATH = "/rh-portalcolaborador-bff/v1/ponto/banco-horas"

# --- Headers fixos do portal ---
DAGENTE_ORIGIN = "https://dagente.localiza.com"
DAGENTE_REFERER = "https://dagente.localiza.com/"

# --- Retry ---
MAX_RETRIES = 3
RETRY_BASE_DELAY_SEC = 1.0
RETRY_BACKOFF_FACTOR = 2.0


def _expand_path(value: str) -> Path:
    return Path(os.path.expanduser(value)).resolve()


def get_redirect_uri() -> str:
    return os.getenv(
        "DAGENTE_REDIRECT_URI",
        "http://localhost:8400/auth-callback",
    )


def get_cache_dir() -> Path:
    raw = os.getenv("DAGENTE_CACHE_DIR", "~/.dagente_cache")
    path = _expand_path(raw)
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_http_timeout() -> float:
    return float(os.getenv("DAGENTE_HTTP_TIMEOUT", "30"))


def is_debug() -> bool:
    return os.getenv("DAGENTE_DEBUG", "").strip() in {"1", "true", "True", "yes"}


def use_keyring() -> bool:
    return os.getenv("DAGENTE_USE_KEYRING", "").strip() in {"1", "true", "True", "yes"}


def get_apigee_client_id() -> str:
    return os.getenv("APIGEE_CLIENT_ID", APIGEE_HEADER_CLIENT_ID)


def get_apigee_client_secret() -> str | None:
    if use_keyring():
        try:
            import keyring

            secret = keyring.get_password("dagente-banco-horas", "APIGEE_CLIENT_SECRET")
            if secret:
                return secret
        except Exception:
            pass
    return os.getenv("APIGEE_CLIENT_SECRET")


def get_apigee_manual_token() -> str | None:
    return os.getenv("APIGEE_MANUAL_TOKEN")
