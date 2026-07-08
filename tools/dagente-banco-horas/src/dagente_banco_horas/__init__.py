"""Pacote para consulta de banco de horas no portal DaGente (Localiza)."""

from dagente_banco_horas.auth import DaGenteAuth
from dagente_banco_horas.banco_horas_tool import (
    GET_BANCO_HORAS_SCHEMA,
    get_banco_horas,
    parse_banco_horas_response,
)
from dagente_banco_horas.models import BancoHorasResult

__all__ = [
    "BancoHorasResult",
    "DaGenteAuth",
    "GET_BANCO_HORAS_SCHEMA",
    "get_banco_horas",
    "parse_banco_horas_response",
]

__version__ = "1.0.0"
