"""Promote one existing account to administrator.

This is the only supported way to grant the `admin` system role. It targets one
exact existing account by normalized email, is idempotent, and never creates an
account, accepts a password, mints a token, or changes any other user.

Local usage (from the backend directory):

    uv run python scripts/promote_admin.py --email owner@example.com

Deployed Compose usage (uses the running backend's configured database):

    docker compose exec backend \
        uv run python scripts/promote_admin.py --email owner@example.com
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import SessionLocal  # noqa: E402
from app.services.admin_service import AdminNotFoundError, promote_to_admin  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Promote one existing account to administrator.")
    parser.add_argument("--email", required=True, help="Exact account email (normalized on lookup)")
    args = parser.parse_args()

    try:
        with SessionLocal() as session:
            user = promote_to_admin(session, args.email)
    except AdminNotFoundError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Error: unable to promote administrator: {exc}", file=sys.stderr)
        return 1

    print(f"Account {user.email} now has role {user.role}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
