#!/usr/bin/env bash
# Startet bei Bedarf den Docker-Stack und führt den E2E-Test aus.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ ! -d apps/maildrop/vendor ]]; then
	echo "Installing Composer dependencies…"
	(cd apps/maildrop && composer install --no-dev --optimize-autoloader)
fi

if ! docker compose ps --status running 2>/dev/null | grep -q nextcloud; then
	echo "Starting Docker Compose stack…"
	docker compose up -d
fi

exec python3 tests/integration/test_mail_to_nextcloud.py
