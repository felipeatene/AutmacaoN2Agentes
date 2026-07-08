"""Testes unitários da tool e do cliente API."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from dagente_banco_horas.api_client import BancoHorasApiError, fetch_banco_horas_raw
from dagente_banco_horas.auth import DaGenteAuth
from dagente_banco_horas.banco_horas_tool import (
    GET_BANCO_HORAS_SCHEMA,
    get_banco_horas,
    parse_banco_horas_response,
)


class TestParseBancoHorasResponse:
    def test_parse_positivo(self, sample_bff_response) -> None:
        result = parse_banco_horas_response(sample_bff_response)
        assert result["saldo_horas"] == "12:37"
        assert result["sinal"] == "positivo"
        assert result["data_referencia"] == "2026-07-08"
        assert "marcacoes" in result["detalhes"]

    def test_parse_negativo(self, sample_bff_negativo) -> None:
        result = parse_banco_horas_response(sample_bff_negativo)
        assert result["saldo_horas"] == "02:15"
        assert result["sinal"] == "negativo"
        assert result["data_referencia"] == "2026-07-08"

    def test_parse_fallback_keys(self) -> None:
        raw = {"balance": "-01:30", "competencia": "2026-06-01"}
        result = parse_banco_horas_response(raw)
        assert result["saldo_horas"] == "01:30"
        assert result["sinal"] == "negativo"


class TestApiClient:
    def test_fetch_success(self) -> None:
        auth = MagicMock(spec=DaGenteAuth)
        auth.get_azure_token.return_value = "azure_token"
        auth.get_apigee_token.return_value = "apigee_token"

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"saldoHoras": "08:00"}

        with patch("dagente_banco_horas.api_client.requests.get", return_value=mock_response):
            result = fetch_banco_horas_raw(auth)

        assert result["saldoHoras"] == "08:00"

    def test_fetch_403_raises_permission_error(self) -> None:
        auth = MagicMock(spec=DaGenteAuth)
        auth.get_azure_token.return_value = "azure_token"
        auth.get_apigee_token.return_value = "apigee_token"

        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.text = "Forbidden"

        with patch("dagente_banco_horas.api_client.requests.get", return_value=mock_response):
            with pytest.raises(PermissionError, match="Sem permissão no recurso"):
                fetch_banco_horas_raw(auth)

    def test_fetch_503_retries_then_succeeds(self) -> None:
        auth = MagicMock(spec=DaGenteAuth)
        auth.get_azure_token.return_value = "azure_token"
        auth.get_apigee_token.return_value = "apigee_token"

        fail_response = MagicMock()
        fail_response.status_code = 503
        fail_response.text = "Service Unavailable"

        ok_response = MagicMock()
        ok_response.status_code = 200
        ok_response.json.return_value = {"saldo": "05:00"}

        with (
            patch(
                "dagente_banco_horas.api_client.requests.get",
                side_effect=[fail_response, ok_response],
            ),
            patch("dagente_banco_horas.api_client.time.sleep"),
        ):
            result = fetch_banco_horas_raw(auth)

        assert result["saldo"] == "05:00"

    def test_fetch_401_retries_with_refresh(self) -> None:
        auth = MagicMock(spec=DaGenteAuth)
        auth.get_azure_token.return_value = "azure_token_new"
        auth.get_apigee_token.return_value = "apigee_token_new"

        unauthorized = MagicMock()
        unauthorized.status_code = 401
        unauthorized.text = "Unauthorized"

        ok_response = MagicMock()
        ok_response.status_code = 200
        ok_response.json.return_value = {"saldoHoras": "10:00"}

        with patch(
            "dagente_banco_horas.api_client.requests.get",
            side_effect=[unauthorized, ok_response],
        ):
            result = fetch_banco_horas_raw(auth)

        assert result["saldoHoras"] == "10:00"
        auth.invalidate_apigee_cache.assert_called_once()


class TestLangChainTool:
    def test_get_banco_horas_tool(self, sample_bff_response) -> None:
        with patch(
            "dagente_banco_horas.banco_horas_tool.fetch_banco_horas_raw",
            return_value=sample_bff_response,
        ):
            result = get_banco_horas.invoke({})

        assert result["saldo_horas"] == "12:37"
        assert result["sinal"] == "positivo"

    def test_schema_export(self) -> None:
        assert GET_BANCO_HORAS_SCHEMA["function"]["name"] == "get_banco_horas"
        params = GET_BANCO_HORAS_SCHEMA["function"]["parameters"]
        assert "account_hint" in params["properties"]


@pytest.mark.integration
def test_live_banco_horas() -> None:
    """Teste de integração — requer credenciais e login prévio."""
    auth = DaGenteAuth()
    raw = fetch_banco_horas_raw(auth)
    result = parse_banco_horas_response(raw)
    assert "saldo_horas" in result
    print(json.dumps(result, ensure_ascii=False, indent=2))
