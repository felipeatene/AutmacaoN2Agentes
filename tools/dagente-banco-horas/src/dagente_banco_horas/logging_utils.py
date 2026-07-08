"""Utilitários de logging com mascaramento de tokens."""

from __future__ import annotations

import logging
import re

from dagente_banco_horas.config import is_debug

_TOKEN_PATTERN = re.compile(
    r"(Bearer\s+)([A-Za-z0-9\-_.~+/]+=*)([A-Za-z0-9\-_.~+/=]*)",
    re.IGNORECASE,
)
_MASK_VISIBLE_CHARS = 6


def mask_token(token: str | None) -> str:
    """Mascara token para logs — exibe apenas os 6 primeiros caracteres."""
    if not token:
        return "<vazio>"
    if len(token) <= _MASK_VISIBLE_CHARS:
        return "***"
    return f"{token[:_MASK_VISIBLE_CHARS]}***"


def mask_bearer_header(value: str) -> str:
    """Mascara Bearer tokens em strings de log."""
    def _replacer(match: re.Match[str]) -> str:
        prefix, visible, _rest = match.groups()
        return f"{prefix}{visible[:_MASK_VISIBLE_CHARS]}***"

    return _TOKEN_PATTERN.sub(_replacer, value)


def setup_logging(name: str = "dagente_banco_horas") -> logging.Logger:
    """Configura logger com nível INFO (ou DEBUG se DAGENTE_DEBUG=1)."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )
        logger.addHandler(handler)
    logger.setLevel(logging.DEBUG if is_debug() else logging.INFO)
    return logger
