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
		"$APP_DIR/" "$STAGE/$APP_ID/"
else
	(
		cd "$APP_DIR"
		tar -cf - \
			--exclude '.git' \
			--exclude 'node_modules' \
			--exclude 'tests' \
			--exclude '.DS_Store' \
			. | tar -xf - -C "$STAGE/$APP_ID"
	)
fi

if [[ ! -f "$STAGE/$APP_ID/vendor/autoload.php" ]]; then
	echo "error: vendor/autoload.php missing in staged app – composer install failed?" >&2
	exit 1
fi

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
