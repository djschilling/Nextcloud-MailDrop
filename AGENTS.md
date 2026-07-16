# AGENTS.md – Nextcloud MailDrop

Hinweise für AI-Agents, die in diesem Repository arbeiten.

## Projekt

**Nextcloud MailDrop** ist eine Nextcloud-App, die E-Mails per **IMAP** abruft, Anhänge extrahiert und in Nextcloud Files speichert. Konfiguration läuft über die Admin-UI.

| Kontext | Name |
|---------|------|
| Anzeigename (UI) | MailDrop |
| App-ID | `maildrop` |
| PHP-Namespace | `OCA\MailDrop` |
| App-Pfad | `apps/maildrop/` |
| GitHub | `djschilling/Nextcloud-MailDrop` |

## Tech-Stack

- Nextcloud 28–31 (Docker-Dev: `nextcloud:31-apache`)
- PHP 8.1+ (App), IMAP via `webklex/php-imap` (Composer, **keine** php-imap Extension)
- MariaDB, GreenMail (SMTP 3025 / IMAP 3143)
- Admin-UI: Plain JS + Nextcloud Settings API (kein Vue-Build)
- E2E: Python 3 (stdlib only)

## Wichtige Befehle

```bash
# Dependencies (vendor ist gitignored – immer nötig nach Clone/CI)
cd apps/maildrop && composer install --no-dev --optimize-autoloader

# Lokaler Stack
docker compose up -d
docker compose logs -f app-init    # wartet auf Enable von maildrop
docker compose down                # stoppen
docker compose down -v             # inkl. Daten zurücksetzen

# App / Occ (im Container)
docker compose exec -u www-data nextcloud php occ app:enable maildrop
docker compose exec -u www-data nextcloud php occ maildrop:fetch
docker compose exec -u www-data nextcloud php occ upgrade

# Manuelle Testmail
python3 scripts/send-test-mail.py

# Integrationstest (Stack muss laufen)
./tests/integration/run.sh
# oder:
python3 tests/integration/test_mail_to_nextcloud.py
```

Lokale URLs: Nextcloud http://localhost:8080 (`admin`/`admin`), GreenMail IMAP `maildrop`/`maildrop`.

## Architektur

```
SMTP → GreenMail → MailDrop (IMAP Poll) → Nextcloud Files
                      ↑
              Admin UI / occ / TimedJob (5 min)
```

### App-Struktur (`apps/maildrop/`)

| Pfad | Rolle |
|------|--------|
| `appinfo/info.xml` | Metadaten, Jobs, Settings, Commands – bei Änderungen **Version bumpen** |
| `lib/AppInfo/Application.php` | Bootstrap + Composer-Autoload |
| `lib/Service/ConfigService.php` | App-Config (verschlüsseltes IMAP-Passwort) |
| `lib/Service/MailFetchService.php` | IMAP, Anhänge, Speichern in Files |
| `lib/BackgroundJob/FetchMailJob.php` | TimedJob alle 300s |
| `lib/Command/FetchCommand.php` | `occ maildrop:fetch` |
| `lib/Controller/ConfigController.php` | REST API für Admin-UI |
| `lib/Settings/` | Admin-Sektion + Formular |
| `js/admin.js` / `css/admin.css` | Settings-UI |

### Docker

- `docker-compose.yml`: `db`, `nextcloud`, `cron`, `mail` (GreenMail), `app-init`
- App wird nach `custom_apps` gemountet (`./apps` → `/var/www/html/custom_apps`)
- `app-init` aktiviert `maildrop` nach der Erstinstallation

## Kritische Regeln

### Config-Key `enabled` nicht für Abruf nutzen

Nextcloud speichert den **App-Aktivierungsstatus** unter `oc_appconfig.maildrop.enabled` (`yes`/`no`).

Abruf steuern ausschließlich über **`fetch_enabled` pro Mapping** (JSON-Key `mappings`).  
Niemals den App-Key `enabled` als Feature-Flag missbrauchen.

### Mehrere Mappings

- Gespeichert als JSON in App-Config `mappings`
- Jedes Mapping hat eigene IMAP-Daten, Filter, Zielordner und `last_uid`
- Legacy-Einzelconfig wird beim ersten Lesen automatisch migriert
- Admin-UI: Liste links, Editor rechts
- API: `GET/PUT /api/config`, `POST /api/mappings`, `PUT/DELETE /api/mappings/{id}`, `POST /api/test|fetch` mit optionalem `{id}`

### Settings registrieren

- Admin-Settings/Sektionen stehen in `info.xml`
- Nach Änderungen an `info.xml` (Settings, Commands, Jobs): **Version erhöhen**, dann `occ upgrade` bzw. App neu enablen
- Kein `appinfo/app.php`, wenn `Application` `IBootstrap` implementiert (sonst Error-Log-Spam)

### Composer / Vendor

- `apps/maildrop/vendor/` ist gitignored
- Vor Docker-Start und in CI immer `composer install` im App-Verzeichnis
- Autoload wird in `Application::__construct()` geladen

### Passwörter

- IMAP-Passwort nur verschlüsselt speichern (`OCP\Security\ICrypto`)
- Nie im API-Response an den Client zurückgeben

## Coding-Konventionen

- PHP: `declare(strict_types=1);`, Namespace `OCA\MailDrop\...`
- Nextcloud-OCP-Interfaces bevorzugen (`IRootFolder`, `IConfig`, …)
- Gezielte Diffs: keine unnötigen Refactors, keine unsolicited Markdown-Docs
- Nutzerkommunikation: **Deutsch**
- Commits/PRs: nur auf ausdrücklichen Wunsch; PR-Body auf Englisch ok

## Tests & CI

- E2E: `tests/integration/test_mail_to_nextcloud.py`
  - echte SMTP-Mail → GreenMail → `occ maildrop:fetch` → WebDAV-Assertion
- CI: `.github/workflows/integration.yml` (Docker Compose + derselbe Test)
- Zielordner im E2E: `/MailDrop-Integration` (ASCII, zuverlässig für WebDAV)

Bei Test-/Fetch-Fehlern prüfen:

```bash
docker compose logs --tail 100 nextcloud mail
docker compose exec -u www-data nextcloud php occ config:list maildrop
docker compose exec -u www-data nextcloud tail -n 80 /var/www/html/data/nextcloud.log
```

## Typische Aufgaben

| Aufgabe | Vorgehen |
|---------|----------|
| IMAP-Logik ändern | `MailFetchService.php`, E2E laufen lassen |
| Admin-UI erweitern | `ConfigService` + `ConfigController` + `js/admin.js` |
| Neuen Occ-Befehl | Klasse unter `lib/Command/`, in `info.xml` registrieren, Version bumpen |
| Dependencies | `composer.json` / `composer.lock` committen, nicht `vendor/` |

## Nicht tun

- Keine Exploits/Malware, keine Secrets committen
- `git push --force` auf `main` vermeiden
- Docker-Volumes (`down -v`) nur wenn bewusst Datenverlust ok ist
- App-Config-Key nicht `enabled` für Feature-Flags missbrauchen
