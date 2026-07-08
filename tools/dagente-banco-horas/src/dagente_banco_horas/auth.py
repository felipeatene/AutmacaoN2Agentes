"""Autenticação Azure AD (MSAL + PKCE) e Apigee (client_credentials)."""

from __future__ import annotations

import base64
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import msal
import requests

from dagente_banco_horas.config import (
    APIGEE_BASE_URL,
    APIGEE_TOKEN_PATH,
    AZURE_AUTHORITY,
    DAGENTE_CLIENT_ID,
    DAGENTE_SCOPES,
    get_apigee_client_id,
    get_apigee_client_secret,
    get_apigee_manual_token,
    get_cache_dir,
    get_http_timeout,
    get_redirect_uri,
)
from dagente_banco_horas.logging_utils import mask_token, setup_logging

logger = setup_logging(__name__)


@dataclass
class CachedAccount:
    """Metadados de uma conta com cache local."""

    home_account_id: str
    username: str
    cache_path: Path


class DaGenteAuth:
    """Encapsula autenticação dual: Azure AD (usuário) + Apigee (gateway).

    Fase A-B: Login interativo OAuth 2.0 + PKCE via MSAL (abre navegador na 1ª vez).
    Fase C: Troca de código por token (automática pelo MSAL).
    Fase D: Token Apigee via client_credentials (ou fallback manual).
    Fase F: Refresh automático do access_token Azure quando expira.
    """

    def __init__(self) -> None:
        self._cache_dir = get_cache_dir()
        self._redirect_uri = get_redirect_uri()
        self._apigee_token: str | None = None
        self._apigee_expires_at: float = 0.0

    # ------------------------------------------------------------------
    # Cache multi-usuário
    # ------------------------------------------------------------------

    def _cache_path_for(self, home_account_id: str) -> Path:
        safe_id = home_account_id.replace(":", "_").replace("/", "_")
        return self._cache_dir / f"{safe_id}.bin"

    def _load_token_cache(self, cache_path: Path) -> msal.SerializableTokenCache:
        cache = msal.SerializableTokenCache()
        if cache_path.exists():
            cache.deserialize(cache_path.read_text(encoding="utf-8"))
        return cache

    def _save_token_cache(self, cache: msal.SerializableTokenCache, cache_path: Path) -> None:
        if cache.has_state_changed:
            cache_path.write_text(cache.serialize(), encoding="utf-8")
            logger.debug("Cache salvo em %s", cache_path)

    def _build_msal_app(
        self, cache: msal.SerializableTokenCache
    ) -> msal.PublicClientApplication:
        return msal.PublicClientApplication(
            client_id=DAGENTE_CLIENT_ID,
            authority=AZURE_AUTHORITY,
            token_cache=cache,
        )

    def list_accounts(self) -> list[CachedAccount]:
        """Lista contas com cache de token persistido localmente."""
        accounts: list[CachedAccount] = []
        for cache_file in sorted(self._cache_dir.glob("*.bin")):
            cache = self._load_token_cache(cache_file)
            app = self._build_msal_app(cache)
            for account in app.get_accounts():
                accounts.append(
                    CachedAccount(
                        home_account_id=account["home_account_id"],
                        username=account.get("username", ""),
                        cache_path=cache_file,
                    )
                )
        return accounts

    def _resolve_account(
        self,
        app: msal.PublicClientApplication,
        account_hint: str | None,
    ) -> dict[str, Any] | None:
        accounts = app.get_accounts()
        if not accounts:
            return None
        if account_hint:
            hint = account_hint.lower()
            for account in accounts:
                username = (account.get("username") or "").lower()
                if hint in username:
                    return account
            raise ValueError(
                f"Nenhuma conta encontrada para o hint '{account_hint}'. "
                f"Contas disponíveis: {[a.get('username') for a in accounts]}"
            )
        if len(accounts) == 1:
            return accounts[0]
        usernames = [a.get("username", "") for a in accounts]
        raise ValueError(
            f"Múltiplas contas em cache ({usernames}). "
            "Informe account_hint com o e-mail parcial."
        )

    def _find_cache_for_hint(self, account_hint: str | None) -> tuple[Path, dict[str, Any] | None]:
        """Localiza arquivo de cache e conta MSAL correspondente."""
        if account_hint:
            hint = account_hint.lower()
            for cache_file in self._cache_dir.glob("*.bin"):
                cache = self._load_token_cache(cache_file)
                app = self._build_msal_app(cache)
                for account in app.get_accounts():
                    username = (account.get("username") or "").lower()
                    if hint in username:
                        return cache_file, account
            return self._cache_dir / "_pending.bin", None

        accounts = self.list_accounts()
        if len(accounts) == 1:
            cache = self._load_token_cache(accounts[0].cache_path)
            app = self._build_msal_app(cache)
            msal_accounts = app.get_accounts()
            return accounts[0].cache_path, msal_accounts[0] if msal_accounts else None
        if len(accounts) == 0:
            return self._cache_dir / "_pending.bin", None
        raise ValueError(
            f"Múltiplas contas em cache ({[a.username for a in accounts]}). "
            "Informe account_hint."
        )

    # ------------------------------------------------------------------
    # Azure AD
    # ------------------------------------------------------------------

    def get_azure_token(
        self,
        account_hint: str | None = None,
        *,
        force_interactive: bool = False,
    ) -> str:
        """Obtém JWT do Azure AD — silencioso se cache válido, interativo caso contrário."""
        cache_path, account = self._find_cache_for_hint(account_hint)
        cache = self._load_token_cache(cache_path)
        app = self._build_msal_app(cache)

        result: dict[str, Any] | None = None

        if not force_interactive and account:
            logger.info(
                "Tentando acquire_token_silent para %s",
                account.get("username", account.get("home_account_id")),
            )
            result = app.acquire_token_silent(DAGENTE_SCOPES, account=account)

        if not result and not force_interactive:
            result = self._try_refresh_token(app, cache)

        if not result or "access_token" not in result:
            if not sys.stdin.isatty():
                raise RuntimeError(
                    "Login interativo necessário, mas ambiente sem TTY (headless). "
                    "Execute 'dagente-banco-horas login' em terminal interativo primeiro."
                )
            logger.info("Iniciando login interativo (PKCE) — o navegador será aberto")
            result = app.acquire_token_interactive(
                scopes=DAGENTE_SCOPES,
                login_hint=account_hint,
                redirect_uri=self._redirect_uri,
            )

        if not result or "access_token" not in result:
            error = (result or {}).get("error_description", "Falha desconhecida na autenticação")
            raise RuntimeError(f"Autenticação Azure AD falhou: {error}")

        self._save_token_cache(cache, cache_path)

        home_account_id = self._extract_home_account_id(result, app)
        if home_account_id:
            final_path = self._cache_path_for(home_account_id)
            if final_path != cache_path:
                if cache_path.exists():
                    cache_path.rename(final_path)
                else:
                    self._save_token_cache(cache, final_path)
            else:
                self._save_token_cache(cache, final_path)

        access_token = result["access_token"]
        logger.info("Token Azure obtido: %s", mask_token(access_token))
        return access_token

    def _try_refresh_token(
        self,
        app: msal.PublicClientApplication,
        cache: msal.SerializableTokenCache,
    ) -> dict[str, Any] | None:
        """Fase F: tenta refresh_token antes de forçar login interativo."""
        serialized = cache.serialize()
        if not serialized:
            return None
        try:
            data = json.loads(serialized)
        except json.JSONDecodeError:
            return None

        refresh_entries = data.get("RefreshToken", {})
        for entry in refresh_entries.values():
            refresh_token = entry.get("secret")
            if not refresh_token:
                continue
            logger.info("Tentando refresh_token...")
            result = app.acquire_token_by_refresh_token(refresh_token, DAGENTE_SCOPES)
            if result and "access_token" in result:
                logger.info("Refresh token bem-sucedido")
                return result
        return None

    def _extract_home_account_id(
        self,
        result: dict[str, Any],
        app: msal.PublicClientApplication,
    ) -> str | None:
        id_token_claims = result.get("id_token_claims") or {}
        home_account_id = id_token_claims.get("oid") or id_token_claims.get("sub")
        if home_account_id:
            accounts = app.get_accounts()
            for account in accounts:
                if account.get("local_account_id") == home_account_id:
                    return account.get("home_account_id")
                if home_account_id in (account.get("home_account_id") or ""):
                    return account.get("home_account_id")
        accounts = app.get_accounts()
        if accounts:
            return accounts[0].get("home_account_id")
        return None

    # ------------------------------------------------------------------
    # Apigee
    # ------------------------------------------------------------------

    def get_apigee_token(self, *, force_refresh: bool = False) -> str:
        """Obtém token opaco do Apigee — client_credentials preferido, fallback manual."""
        now = time.time()
        if (
            not force_refresh
            and self._apigee_token
            and now < self._apigee_expires_at
        ):
            logger.debug("Token Apigee em cache: %s", mask_token(self._apigee_token))
            return self._apigee_token

        secret = get_apigee_client_secret()
        if secret:
            token, expires_in = self._fetch_apigee_client_credentials(secret)
            self._apigee_token = token
            self._apigee_expires_at = now + (expires_in * 0.9)
            logger.info("Token Apigee obtido via client_credentials: %s", mask_token(token))
            return token

        manual = get_apigee_manual_token()
        if manual:
            logger.warning(
                "Usando APIGEE_MANUAL_TOKEN (fallback). "
                "Prefira APIGEE_CLIENT_SECRET para renovação automática."
            )
            self._apigee_token = manual
            self._apigee_expires_at = now + 3600
            return manual

        raise RuntimeError(
            "Credenciais Apigee ausentes. Defina APIGEE_CLIENT_SECRET "
            "ou APIGEE_MANUAL_TOKEN nas variáveis de ambiente."
        )

    def _fetch_apigee_client_credentials(self, secret: str) -> tuple[str, int]:
        """Fase D: POST client_credentials no API Hub."""
        client_id = get_apigee_client_id()
        credentials = base64.b64encode(f"{client_id}:{secret}".encode()).decode()
        url = f"{APIGEE_BASE_URL}{APIGEE_TOKEN_PATH}?grant_type=client_credentials"
        response = requests.post(
            url,
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            timeout=get_http_timeout(),
        )
        if response.status_code != 200:
            raise RuntimeError(
                f"Falha ao obter token Apigee ({response.status_code}): "
                f"{response.text[:200]}"
            )
        data = response.json()
        token = data.get("access_token") or data.get("AccessToken") or data.get("token")
        if not token:
            raise RuntimeError(f"Resposta Apigee sem token: {data}")
        expires_in = int(data.get("expires_in", data.get("expiresIn", 3600)))
        return token, expires_in

    def invalidate_apigee_cache(self) -> None:
        """Invalida cache em memória do token Apigee."""
        self._apigee_token = None
        self._apigee_expires_at = 0.0
