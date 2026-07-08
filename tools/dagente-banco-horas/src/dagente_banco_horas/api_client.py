"""Cliente HTTP para API de banco de horas com retry e tratamento de erros."""

from __future__ import annotations

import time
from typing import Any

import requests

from dagente_banco_horas.auth import DaGenteAuth
from dagente_banco_horas.config import (
    APIGEE_BASE_URL,
    APIGEE_HEADER_CLIENT_ID,
    BANCO_HORAS_PATH,
    DAGENTE_ORIGIN,
    DAGENTE_REFERER,
    MAX_RETRIES,
    RETRY_BACKOFF_FACTOR,
    RETRY_BASE_DELAY_SEC,
    get_http_timeout,
)
from dagente_banco_horas.logging_utils import setup_logging

logger = setup_logging(__name__)


class BancoHorasApiError(Exception):
    """Erro na chamada à API de banco de horas."""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        super().__init__(message)


def _build_headers(apigee_token: str, azure_token: str) -> dict[str, str]:
    return {
        "authorization": f"Bearer {apigee_token}",
        "authorization_app": f"Bearer {azure_token}",
        "client_id": APIGEE_HEADER_CLIENT_ID,
        "origin": DAGENTE_ORIGIN,
        "referer": DAGENTE_REFERER,
        "Accept": "application/json",
    }


def fetch_banco_horas_raw(
    auth: DaGenteAuth,
    account_hint: str | None = None,
    *,
    force_interactive: bool = False,
) -> dict[str, Any]:
    """Fase E: GET banco-horas com tokens duplos (Apigee + Azure AD)."""
    url = f"{APIGEE_BASE_URL}{BANCO_HORAS_PATH}"
    timeout = get_http_timeout()
    auth_attempts = 0
    max_auth_retries = 1

    while auth_attempts <= max_auth_retries:
        azure_token = auth.get_azure_token(
            account_hint=account_hint,
            force_interactive=force_interactive,
        )
        apigee_token = auth.get_apigee_token(force_refresh=auth_attempts > 0)

        try:
            return _request_with_retry(
                url,
                headers=_build_headers(apigee_token, azure_token),
                timeout=timeout,
            )
        except BancoHorasApiError as exc:
            if exc.status_code == 401 and auth_attempts < max_auth_retries:
                logger.warning("401 recebido — tentando refresh de tokens")
                auth.invalidate_apigee_cache()
                auth_attempts += 1
                force_interactive = False
                continue
            if exc.status_code == 401:
                logger.warning("401 persistente — forçando login interativo")
                auth.invalidate_apigee_cache()
                azure_token = auth.get_azure_token(
                    account_hint=account_hint,
                    force_interactive=True,
                )
                apigee_token = auth.get_apigee_token(force_refresh=True)
                return _request_with_retry(
                    url,
                    headers=_build_headers(apigee_token, azure_token),
                    timeout=timeout,
                )
            raise

    raise RuntimeError("Falha de autenticação após tentativas de refresh")


def _request_with_retry(
    url: str,
    headers: dict[str, str],
    timeout: float,
) -> dict[str, Any]:
    last_error: Exception | None = None

    for attempt in range(MAX_RETRIES):
        try:
            response = requests.get(url, headers=headers, timeout=timeout)
        except requests.Timeout as exc:
            last_error = exc
            _sleep_backoff(attempt, "timeout")
            continue
        except requests.RequestException as exc:
            raise RuntimeError(f"Erro de rede ao consultar banco de horas: {exc}") from exc

        if response.status_code == 200:
            return response.json()

        if response.status_code == 403:
            raise PermissionError("Sem permissão no recurso")

        if response.status_code == 401:
            raise BancoHorasApiError(401, "Não autorizado")

        if response.status_code == 429:
            retry_after = response.headers.get("Retry-After")
            wait = float(retry_after) if retry_after else RETRY_BASE_DELAY_SEC * (
                RETRY_BACKOFF_FACTOR ** attempt
            )
            logger.warning("Rate limit 429 — aguardando %.1fs", wait)
            time.sleep(wait)
            continue

        if response.status_code >= 500:
            last_error = BancoHorasApiError(
                response.status_code,
                f"Erro do servidor: {response.text[:200]}",
            )
            _sleep_backoff(attempt, f"HTTP {response.status_code}")
            continue

        raise RuntimeError(
            f"Erro HTTP {response.status_code}: {response.text[:200]}"
        )

    if last_error:
        raise last_error
    raise RuntimeError("Falha após tentativas de retry")


def _sleep_backoff(attempt: int, reason: str) -> None:
    if attempt >= MAX_RETRIES - 1:
        return
    delay = RETRY_BASE_DELAY_SEC * (RETRY_BACKOFF_FACTOR ** attempt)
    logger.warning("Retry %d/%d após %s (%.1fs)", attempt + 1, MAX_RETRIES, reason, delay)
    time.sleep(delay)
