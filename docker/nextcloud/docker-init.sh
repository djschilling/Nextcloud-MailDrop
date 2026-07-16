#!/bin/bash
set -euo pipefail

echo "Warte auf Nextcloud…"
for _ in $(seq 1 90); do
	if su -s /bin/bash www-data -c "php /var/www/html/occ status" 2>/dev/null | grep -q "installed: true"; then
		echo "Nextcloud ist installiert."
		su -s /bin/bash www-data -c "php /var/www/html/occ app:enable maildrop" || true
		su -s /bin/bash www-data -c "php /var/www/html/occ background:cron" || true
		echo "App maildrop aktiviert."
		exit 0
	fi
	sleep 5
done

echo "Timeout: Nextcloud wurde nicht rechtzeitig installiert." >&2
exit 1
