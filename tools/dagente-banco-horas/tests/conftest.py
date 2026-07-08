"""Fixtures compartilhadas para testes."""

from __future__ import annotations

import pytest


@pytest.fixture
def sample_bff_response() -> dict:
    return {
        "saldoHoras": "12:37",
        "tipoSaldo": "positivo",
        "dataReferencia": "2026-07-08",
        "marcacoes": [
            {"data": "2026-07-07", "entrada": "08:00", "saida": "17:37"},
        ],
    }


@pytest.fixture
def sample_bff_negativo() -> dict:
    return {
        "banco_horas": {
            "saldo": "-02:15",
            "data": "08/07/2026",
        },
    }
