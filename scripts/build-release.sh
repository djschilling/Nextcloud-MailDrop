#!/usr/bin/env bash
# Baut ein installierbares Nextcloud-App-Archiv (inkl. vendor/).
#
# Usage:
#   ./scripts/build-release.sh           # Version aus info.xml
#   ./scripts/build-release.sh 1.0.0     # Version überschreiben (schreibt info.xml)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/apps/maildrop"
INFO_XML="$APP_DIR/appinfo/info.xml"
DIST_DIR="$ROOT/dist"
APP_ID="maildrop"

if [[ ! -f "$INFO_XML" ]]; then
	echo "error: $INFO_XML not found" >&2
	exit 1
fi

if [[ $# -ge 1 ]]; then
	VERSION="$1"
	if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.]+)?$ ]]; then
		echo "error: invalid version '$VERSION' (expected e.g. 1.0.0)" >&2
		exit 1
	fi
	# BSD/GNU sed compatible in-place replace of <version>…</version>
	tmp="$(mktemp)"
	sed -E "s#(<version>)[^<]+(</version>)#\\1${VERSION}\\2#" "$INFO_XML" >"$tmp"
	mv "$tmp" "$INFO_XML"
else
	VERSION="$(sed -nE 's/.*<version>([^<]+)<\/version>.*/\1/p' "$INFO_XML" | head -n1)"
	if [[ -z "$VERSION" ]]; then
		echo "error: could not read <version> from info.xml" >&2
		exit 1
	fi
fi

ARCHIVE_NAME="${APP_ID}-${VERSION}.tar.gz"
STAGE="$DIST_DIR/.stage-${APP_ID}-${VERSION}"
OUT="$DIST_DIR/$ARCHIVE_NAME"

echo "==> Building MailDrop release ${VERSION}"
echo "    app dir: $APP_DIR"
echo "    output:  $OUT"

command -v composer >/dev/null || {
	echo "error: composer not found in PATH" >&2
	exit 1
}
command -v tar >/dev/null || {
	echo "error: tar not found in PATH" >&2
	exit 1
}

mkdir -p "$DIST_DIR"
rm -rf "$STAGE"
mkdir -p "$STAGE/$APP_ID"

echo "==> composer install --no-dev"
(
	cd "$APP_DIR"
	composer install --no-dev --optimize-autoloader --no-interaction
)

echo "==> copy app files"
# rsync preferred; fallback to tar pipe
if command -v rsync >/dev/null; then
	rsync -a \
		--exclude '.git/' \
		--exclude '.github/' \
		--exclude 'node_modules/' \
		--exclude 'tests/' \
		--exclude '.phpunit*' \
		--exclude '.php-cs-fixer*' \
		--exclude '.DS_Store' \
		--exclude '*.log' \
		--exclude 'appinfo/signature.json' \
		"$APP_DIR/" "$STAGE/$APP_ID/"
else
	(
		cd "$APP_DIR"
		tar -cf - \
			--exclude '.git' \
			--exclude 'node_modules' \
			--exclude 'tests' \
			--exclude '.DS_Store' \
			--exclude 'appinfo/signature.json' \
			. | tar -xf - -C "$STAGE/$APP_ID"
	)
fi

if [[ ! -f "$STAGE/$APP_ID/vendor/autoload.php" ]]; then
	echo "error: vendor/autoload.php missing in staged app – composer install failed?" >&2
	exit 1
fi

# Throwaway Nextcloud just to run `occ integrity:sign-app` (GitHub Actions).
sign_with_oneshot_nextcloud() {
	local staged="$1"
	local key="$2"
	local crt="$3"
	local image="${NEXTCLOUD_SIGN_IMAGE:-nextcloud:34-apache}"
	signer_name="maildrop-sign-$$"

	cleanup_signer() {
		docker rm -f "$signer_name" >/dev/null 2>&1 || true
	}
	trap cleanup_signer EXIT

	echo "==> starting signer container ($image)"
	docker rm -f "$signer_name" >/dev/null 2>&1 || true
	docker run -d --name "$signer_name" \
		-e SQLITE_DATABASE=nextcloud \
		-e NEXTCLOUD_ADMIN_USER=admin \
		-e NEXTCLOUD_ADMIN_PASSWORD=admin \
		"$image" >/dev/null

	local ready=0
	local attempt
	for attempt in $(seq 1 60); do
		if docker exec -u www-data "$signer_name" php occ status 2>/dev/null | grep -q 'installed: true'; then
			ready=1
			break
		fi
		sleep 5
	done
	if [[ "$ready" != 1 ]]; then
		docker logs --tail 80 "$signer_name" >&2 || true
		echo "error: signer Nextcloud did not finish installing" >&2
		exit 1
	fi

	docker exec -u root "$signer_name" mkdir -p /tmp/sign-src /sign-app
	docker cp "$staged/." "$signer_name:/tmp/sign-src/"
	docker cp "$key" "$signer_name:/tmp/maildrop.key"
	docker cp "$crt" "$signer_name:/tmp/maildrop.crt"
	docker exec -u root "$signer_name" bash -c 'rm -rf /sign-app && mv /tmp/sign-src /sign-app && chown -R www-data:www-data /sign-app /tmp/maildrop.key /tmp/maildrop.crt && chmod 600 /tmp/maildrop.key'
	docker exec -u www-data "$signer_name" php occ integrity:sign-app \
		--privateKey=/tmp/maildrop.key \
		--certificate=/tmp/maildrop.crt \
		--path=/sign-app
	docker cp "$signer_name:/sign-app/appinfo/signature.json" "$staged/appinfo/signature.json"
	docker exec -u root "$signer_name" rm -f /tmp/maildrop.key /tmp/maildrop.crt || true
	cleanup_signer
	trap - EXIT
}

sign_staged_app() {
	local cert_dir="${MAILDROP_CERT_DIR:-$HOME/.nextcloud/certificates}"
	local key="$cert_dir/${APP_ID}.key"
	local crt="$cert_dir/${APP_ID}.crt"
	local staged="$STAGE/$APP_ID"

	if [[ "${SKIP_SIGN:-}" == "1" ]]; then
		echo "==> skipping code signing (SKIP_SIGN=1)"
		return 0
	fi
	if [[ ! -f "$key" || ! -f "$crt" ]]; then
		echo "==> unsigned archive (no ${APP_ID}.key / ${APP_ID}.crt in $cert_dir)"
		echo "    App Store uploads require a signed certificate; GitHub releases can stay unsigned."
		return 0
	fi

	echo "==> signing staged app"
	if [[ -n "${OCC:-}" ]]; then
		php "$OCC" integrity:sign-app \
			--privateKey="$key" \
			--certificate="$crt" \
			--path="$staged"
	elif [[ "${MAILDROP_SIGN_WITH_DOCKER:-}" == "1" ]]; then
		sign_with_oneshot_nextcloud "$staged" "$key" "$crt"
	elif docker compose -f "$ROOT/docker-compose.yml" ps --status running --services 2>/dev/null | grep -qx nextcloud; then
		docker compose -f "$ROOT/docker-compose.yml" run --rm --no-deps \
			-v "$cert_dir:/certs:ro" \
			-v "$staged:/sign-app:rw" \
			-u www-data \
			nextcloud php occ integrity:sign-app \
				--privateKey="/certs/${APP_ID}.key" \
				--certificate="/certs/${APP_ID}.crt" \
				--path=/sign-app
	else
		echo "error: certificates found but cannot sign." >&2
		echo "  Set OCC=/path/to/nextcloud/occ, start docker compose (nextcloud)," >&2
		echo "  MAILDROP_SIGN_WITH_DOCKER=1, or SKIP_SIGN=1" >&2
		exit 1
	fi

	if [[ ! -f "$staged/appinfo/signature.json" ]]; then
		echo "error: appinfo/signature.json missing after signing" >&2
		exit 1
	fi
	echo "    wrote appinfo/signature.json"
}

sign_staged_app

staged_version="$(sed -nE 's/.*<version>([^<]+)<\/version>.*/\1/p' "$STAGE/$APP_ID/appinfo/info.xml" | head -n1)"
if [[ "$staged_version" != "$VERSION" ]]; then
	echo "error: staged info.xml version ($staged_version) != $VERSION" >&2
	exit 1
fi

echo "==> create archive"
rm -f "$OUT"
(
	cd "$STAGE"
	tar -czf "$OUT" "$APP_ID"
)

rm -rf "$STAGE"

checksum=""
if command -v shasum >/dev/null; then
	checksum="$(shasum -a 256 "$OUT" | awk '{print $1}')"
elif command -v sha256sum >/dev/null; then
	checksum="$(sha256sum "$OUT" | awk '{print $1}')"
fi

size="$(wc -c <"$OUT" | tr -d ' ')"
echo
echo "Release archive ready:"
echo "  file:   $OUT"
echo "  size:   ${size} bytes"
if [[ -n "$checksum" ]]; then
	echo "  sha256: $checksum"
	echo "$checksum  $(basename "$OUT")" >"${OUT}.sha256"
	echo "  wrote:  ${OUT}.sha256"
fi
echo
echo "Install on a Nextcloud host:"
echo "  1. Extract into custom_apps/ (top-level folder must be '${APP_ID}/')"
echo "  2. occ app:enable ${APP_ID}"
echo "  3. Configure under Administration → MailDrop"
