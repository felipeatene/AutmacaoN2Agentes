"""Testes unitários do módulo de autenticação."""

from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import pytest

from dagente_banco_horas.auth import DaGenteAuth


class TestDaGenteAuth:
    def test_get_apigee_token_client_credentials(self) -> None:
        auth = DaGenteAuth()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "access_token": "apigee_token_abc123",
            "expires_in": 3600,
        }

        with (
            patch("dagente_banco_horas.auth.get_apigee_client_secret", return_value="secret"),
            patch("dagente_banco_horas.auth.requests.post", return_value=mock_response) as mock_post,
        ):
            token = auth.get_apigee_token()

        assert token == "apigee_token_abc123"
        mock_post.assert_called_once()

    def test_get_apigee_token_fallback_manual(self) -> None:
        auth = DaGenteAuth()
        with (
            patch("dagente_banco_horas.auth.get_apigee_client_secret", return_value=None),
            patch("dagente_banco_horas.auth.get_apigee_manual_token", return_value="manual_token_xyz"),
        ):
            token = auth.get_apigee_token()

        assert token == "manual_token_xyz"

    def test_get_apigee_token_cache(self) -> None:
        auth = DaGenteAuth()
        auth._apigee_token = "cached_token"
        auth._apigee_expires_at = time.time() + 3600

        with patch("dagente_banco_horas.auth.requests.post") as mock_post:
            token = auth.get_apigee_token()

        assert token == "cached_token"
        mock_post.assert_not_called()

    def test_get_apigee_token_missing_credentials(self) -> None:
        auth = DaGenteAuth()
        with (
            patch("dagente_banco_horas.auth.get_apigee_client_secret", return_value=None),
            patch("dagente_banco_horas.auth.get_apigee_manual_token", return_value=None),
        ):
            with pytest.raises(RuntimeError, match="Credenciais Apigee ausentes"):
                auth.get_apigee_token()

    def test_get_azure_token_silent(self, tmp_path, monkeypatch) -> None:
        monkeypatch.setenv("DAGENTE_CACHE_DIR", str(tmp_path))
        auth = DaGenteAuth()

        mock_app = MagicMock()
        mock_app.get_accounts.return_value = []
        mock_app.acquire_token_silent.return_value = {
            "access_token": "azure_jwt_token",
            "id_token_claims": {"oid": "user-123"},
        }
        mock_app.acquire_token_by_refresh_token.return_value = None

        account = {"home_account_id": "abc", "username": "user@localiza.com"}
        with patch.object(auth, "_build_msal_app", return_value=mock_app):
            with patch.object(
                auth,
                "_find_cache_for_hint",
                return_value=(tmp_path / "test.bin", account),
            ):
                token = auth.get_azure_token()

        assert token == "azure_jwt_token"

    def test_get_azure_token_interactive(self, tmp_path, monkeypatch) -> None:
        monkeypatch.setenv("DAGENTE_CACHE_DIR", str(tmp_path))
        auth = DaGenteAuth()

        mock_app = MagicMock()
        mock_app.get_accounts.return_value = [
            {"home_account_id": "abc", "username": "user@localiza.com"},
        ]
        mock_app.acquire_token_silent.return_value = None
        mock_app.acquire_token_by_refresh_token.return_value = None
        mock_app.acquire_token_interactive.return_value = {
            "access_token": "interactive_token",
            "id_token_claims": {"oid": "user-123"},
        }

        with patch.object(auth, "_build_msal_app", return_value=mock_app):
            with patch.object(
                auth,
                "_find_cache_for_hint",
                return_value=(tmp_path / "test.bin", {"home_account_id": "abc"}),
            ):
                with patch("dagente_banco_horas.auth.sys.stdin") as mock_stdin:
                    mock_stdin.isatty.return_value = True
                    token = auth.get_azure_token(force_interactive=True)

        assert token == "interactive_token"
        mock_app.acquire_token_interactive.assert_called_once()

    def test_list_accounts_empty(self, tmp_path, monkeypatch) -> None:
        monkeypatch.setenv("DAGENTE_CACHE_DIR", str(tmp_path))
        auth = DaGenteAuth()
        assert auth.list_accounts() == []

    def test_mask_token_in_logs(self) -> None:
        from dagente_banco_horas.logging_utils import mask_token

        assert mask_token("abcdefghijklmnop") == "abcdef***"
        assert mask_token("abc") == "***"
        assert mask_token(None) == "<vazio>"
