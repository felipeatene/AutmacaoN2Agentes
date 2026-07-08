"""Modelos de dados estruturados."""

from __future__ import annotations

from typing import Any, Literal, TypedDict


class BancoHorasResult(TypedDict):
    """Retorno normalizado da consulta de banco de horas."""

    saldo_horas: str
    sinal: Literal["positivo", "negativo"]
    data_referencia: str
    detalhes: dict[str, Any]
