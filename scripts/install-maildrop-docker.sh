#!/usr/bin/env bash
# Installiert MailDrop in ein Nextcloud-Docker-Compose-Setup.
#
# Voraussetzung: Im Verzeichnis der docker-compose.yml ausführen.
# Erwarteter Service-Name: app (wie in nextcloud-server.md).
#
# Usage:
#   ./install-maildrop-docker.sh 1.0.1
#   ./install-maildrop-docker.sh v1.0.1
#   NEXTCLOUD_SERVICE=nextcloud ./install-maildrop-docker.sh 1.0.1
#
set -euo pipefail

VERSION_RAW="${1:-}"
if [[ -z "$VERSION_RAW" ]]; then
	echo "Usage: $0 <version>" >&2
	echo "Example: $0 1.0.1" >&2
	exit 1
fi

# v1.0.1 → 1.0.1
VERSION="${VERSION_RAW#v}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.]+)?$ ]]; then
	echo "error: invalid version '$VERSION_RAW'" >&2
	exit 1
fi

SERVICE="${NEXTCLOUD_SERVICE:-app}"
REPO="${MAILDROP_REPO:-djschilling/Nextcloud-MailDrop}"
TAG="v${VERSION}"
ARCHIVE="maildrop-${VERSION}.tar.gz"
URL="https://github.com/${REPO}/releases/download/${TAG}/${ARCHIVE}"

TMP_DIR="$(mktemp -d)"
cleanup() {
	rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [[ ! -f docker-compose.yml && ! -f compose.yml && ! -f compose.yaml ]]; then
	echo "error: no docker-compose.yml/compose.yml in $(pwd)" >&2
	echo "Run this script from your Nextcloud Compose project directory." >&2
	exit 1
fi

if ! docker compose ps --status running --services 2>/dev/null | grep -qx "$SERVICE"; then
	echo "error: Compose service '$SERVICE' is not running" >&2
	echo "Hint: set NEXTCLOUD_SERVICE=<name> if your service is not called 'app'." >&2
	docker compose ps || true
	exit 1
fi

echo "==> Downloading ${URL}"
curl -fsSL -o "$TMP_DIR/$ARCHIVE" "$URL"

# Optional checksum, falls im Release vorhanden
SHA_URL="${URL}.sha256"
if curl -fsSL -o "$TMP_DIR/$ARCHIVE.sha256" "$SHA_URL" 2>/dev/null; then
	echo "==> Verifying SHA256"
	(
		cd "$TMP_DIR"
		if command -v shasum >/dev/null; then
			shasum -a 256 -c "$ARCHIVE.sha256"
		else
			sha256sum -c "$ARCHIVE.sha256"
		fi
	)
else
	echo "==> No .sha256 asset found – skipping checksum"
fi

echo "==> Extracting archive"
tar -tzf "$TMP_DIR/$ARCHIVE" | head -n1 | grep -q '^maildrop/' || {
	echo "error: archive must contain top-level folder maildrop/" >&2
	exit 1
}
mkdir -p "$TMP_DIR/extract"
tar -xzf "$TMP_DIR/$ARCHIVE" -C "$TMP_DIR/extract"

echo "==> Installing into container '${SERVICE}:/var/www/html/custom_apps/maildrop'"
docker compose exec -u root "$SERVICE" mkdir -p /var/www/html/custom_apps
# Alten Stand entfernen, dann frisch kopieren
docker compose exec -u root "$SERVICE" rm -rf /var/www/html/custom_apps/maildrop
docker compose cp "$TMP_DIR/extract/maildrop/." "${SERVICE}:/var/www/html/custom_apps/maildrop/"
docker compose exec -u root "$SERVICE" chown -R www-data:www-data /var/www/html/custom_apps/maildrop

echo "==> Enabling app"
docker compose exec -u www-data "$SERVICE" php occ app:enable maildrop
docker compose exec -u www-data "$SERVICE" php occ upgrade || true

echo "==> Status"
docker compose exec -u www-data "$SERVICE" php occ app:list --enabled | grep -i maildrop || true
docker compose exec -u www-data "$SERVICE" php occ status | sed -n '1,12p'

echo
echo "Done. Configure under Administration → MailDrop"
echo "  https://cloud.feg-karlsruhe.de/settings/admin/maildrop"
