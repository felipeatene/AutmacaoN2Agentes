"""CLI standalone para login, listagem de contas e consulta de banco de horas."""

from __future__ import annotations

import argparse
import json
import sys

from dagente_banco_horas.api_client import fetch_banco_horas_raw
from dagente_banco_horas.auth import DaGenteAuth
from dagente_banco_horas.banco_horas_tool import parse_banco_horas_response
from dagente_banco_horas.logging_utils import setup_logging

logger = setup_logging(__name__)


def _cmd_login(args: argparse.Namespace) -> int:
    auth = DaGenteAuth()
    token = auth.get_azure_token(
        account_hint=args.account_hint,
        force_interactive=True,
    )
    logger.info("Login concluído. Token: %s...", token[:6])
    return 0


def _cmd_accounts(_args: argparse.Namespace) -> int:
    auth = DaGenteAuth()
    accounts = auth.list_accounts()
    if not accounts:
        print("Nenhuma conta em cache. Execute: dagente-banco-horas login")
        return 0
    for acc in accounts:
        print(f"  {acc.username}  (cache: {acc.cache_path.name})")
    return 0


def _cmd_banco_horas(args: argparse.Namespace) -> int:
    auth = DaGenteAuth()
    raw = fetch_banco_horas_raw(auth, account_hint=args.account_hint)
    result = parse_banco_horas_response(raw)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        sinal_label = "positivas" if result["sinal"] == "positivo" else "negativas"
        print(
            f"Saldo: {result['saldo_horas']} ({sinal_label}) "
            f"| Referência: {result['data_referencia']}"
        )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="dagente-banco-horas",
        description="Consulta banco de horas no portal DaGente (Localiza)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    login_parser = sub.add_parser("login", help="Força login interativo (MFA)")
    login_parser.add_argument(
        "--account-hint",
        help="Parte do e-mail corporativo",
    )
    login_parser.set_defaults(func=_cmd_login)

    accounts_parser = sub.add_parser("accounts", help="Lista contas com cache local")
    accounts_parser.set_defaults(func=_cmd_accounts)

    bh_parser = sub.add_parser("banco-horas", help="Consulta saldo de banco de horas")
    bh_parser.add_argument("--account-hint", help="Parte do e-mail corporativo")
    bh_parser.add_argument("--json", action="store_true", help="Saída em JSON")
    bh_parser.set_defaults(func=_cmd_banco_horas)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except (RuntimeError, PermissionError, ValueError) as exc:
        logger.error("%s", exc)
        return 1
    except KeyboardInterrupt:
        print("\nInterrompido.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
