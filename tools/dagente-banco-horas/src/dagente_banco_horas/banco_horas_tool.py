"""Tool LangChain para consulta de banco de horas."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

from langchain_core.tools import tool

from dagente_banco_horas.api_client import fetch_banco_horas_raw
from dagente_banco_horas.auth import DaGenteAuth
from dagente_banco_horas.models import BancoHorasResult

# Instância compartilhada para reutilizar cache entre invocações da tool
_default_auth = DaGenteAuth()


def _find_nested(data: Any, *keys: str) -> Any:
    """Busca valor em dict aninhado por lista de chaves candidatas."""
    if not isinstance(data, dict):
        return None
    for key in keys:
        if key in data and data[key] is not None:
            return data[key]
    for value in data.values():
        if isinstance(value, dict):
            found = _find_nested(value, *keys)
            if found is not None:
                return found
    return None


def _normalize_horas(value: Any) -> str:
    """Normaliza saldo para formato HH:MM."""
    if value is None:
        return "00:00"
    if isinstance(value, (int, float)):
        total_minutes = int(abs(value))
        hours, minutes = divmod(total_minutes, 60)
        return f"{hours:02d}:{minutes:02d}"
    text = str(value).strip()
    match = re.match(r"^(-?)(\d{1,3}):(\d{2})$", text)
    if match:
        sign, hours, minutes = match.groups()
        return f"{sign}{int(hours):02d}:{minutes}"
    match = re.match(r"^(-?)(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*min)?", text, re.I)
    if match:
        sign, hours_str, mins = match.groups()
        hours = int(float(hours_str))
        minutes = int(mins or 0)
        return f"{sign}{hours:02d}:{minutes:02d}"
    return text


def _detect_sinal(value: Any, raw: dict[str, Any]) -> str:
    """Determina se o saldo é positivo ou negativo."""
    explicit = _find_nested(
        raw,
        "sinal",
        "tipo",
        "tipoSaldo",
        "tipo_saldo",
        "natureza",
        "status",
    )
    if explicit:
        text = str(explicit).lower()
        if any(k in text for k in ("neg", "dev", "déb", "deb")):
            return "negativo"
        if any(k in text for k in ("pos", "cred", "créd")):
            return "positivo"

    if isinstance(value, (int, float)) and value < 0:
        return "negativo"
    text = str(value).strip()
    if text.startswith("-"):
        return "negativo"
    return "positivo"


def _normalize_data_referencia(raw: dict[str, Any]) -> str:
    """Extrai data de referência no formato YYYY-MM-DD."""
    value = _find_nested(
        raw,
        "data_referencia",
        "dataReferencia",
        "data",
        "referencia",
        "competencia",
        "periodo",
    )
    if not value:
        return date.today().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(text[:10], fmt).date().isoformat()
        except ValueError:
            continue
    return text[:10]


def parse_banco_horas_response(raw: dict[str, Any]) -> BancoHorasResult:
    """Mapeia resposta bruta do BFF para JSON estruturado para o LLM."""
    saldo_raw = _find_nested(
        raw,
        "saldo_horas",
        "saldoHoras",
        "saldo",
        "balance",
        "horas",
        "total",
        "bancoHoras",
        "banco_horas",
    )
    if isinstance(saldo_raw, dict):
        saldo_raw = _find_nested(
            saldo_raw,
            "saldo_horas",
            "saldoHoras",
            "saldo",
            "balance",
            "horas",
            "total",
        )
    saldo_horas = _normalize_horas(saldo_raw)
    sinal = _detect_sinal(saldo_raw, raw)
    if saldo_horas.startswith("-"):
        saldo_horas = saldo_horas.lstrip("-")
        sinal = "negativo"

    return BancoHorasResult(
        saldo_horas=saldo_horas,
        sinal=sinal,  # type: ignore[typeddict-item]
        data_referencia=_normalize_data_referencia(raw),
        detalhes=raw,
    )


GET_BANCO_HORAS_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "get_banco_horas",
        "description": (
            "Consulta o saldo do banco de horas do colaborador autenticado no portal "
            "DaGente (Localiza). Use quando o usuário perguntar sobre banco de horas, "
            "saldo de horas extras, débito/crédito de ponto ou situação do ponto eletrônico."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "account_hint": {
                    "type": "string",
                    "description": (
                        "Parte do e-mail corporativo para selecionar a conta quando há "
                        "múltiplos usuários em cache. Opcional se houver apenas uma conta."
                    ),
                },
            },
            "required": [],
        },
    },
}


@tool
def get_banco_horas(account_hint: str | None = None) -> dict[str, Any]:
    """Consulta o saldo do banco de horas do colaborador autenticado no portal DaGente (Localiza).

    Use esta ferramenta quando o usuário perguntar sobre:
    - Saldo de banco de horas ("quanto tenho de banco de horas?")
    - Horas extras acumuladas ou débito de ponto
    - Situação do ponto eletrônico referente a banco de horas

    Na primeira execução pode ser necessário login interativo via navegador (MFA corporativo).
    Execuções subsequentes usam refresh token automaticamente.

    Args:
        account_hint: Parte do e-mail para selecionar conta em ambiente multi-usuário.

    Returns:
        JSON com saldo_horas (HH:MM), sinal (positivo/negativo),
        data_referencia (YYYY-MM-DD) e detalhes com payload completo da API.
    """
    raw = fetch_banco_horas_raw(_default_auth, account_hint=account_hint)
    result = parse_banco_horas_response(raw)
    return dict(result)
