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

- Nextcloud 28–34 (Docker-Dev: `nextcloud:34-apache`)
- PHP 8.1+ (App), IMAP via `webklex/php-imap` (Composer, **keine** php-imap Extension)
- MariaDB, GreenMail (SMTP 3025 / IMAP 3143)
- Admin-UI: Plain JS + Nextcloud Settings API (kein Vue-Build)
- E2E: Python 3 (stdlib only)

## Wichtige Befehle

```bash
# Dependencies (vendor ist gitignored – immer nötig nach Clone/CI)
cd apps/maildrop && composer install --no-dev --optimize-autoloader

# Lokaler Stack (Kern: db, mail, nextcloud)
docker compose up -d
# optional: Cron + app-init (Auto-Enable)
docker compose --profile full up -d
docker compose logs -f app-init    # nur mit Profile full
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

- `docker-compose.yml`: Kern-Services `db`, `nextcloud`, `mail` (GreenMail)
- `cron` und `app-init` nur mit Compose-Profile **`full`**
- Lokal: App via Bind-Mount `./apps` → `/var/www/html/custom_apps`
- `app-init` aktiviert `maildrop` nach der Erstinstallation (nur Profile `full`)
- Nextcloud-Healthcheck prüft nur Apache/`status.php` – nicht „installed“, damit `compose up` nicht an Cron/App-Init hängt

## Kritische Regeln

### Config-Key `enabled` nicht für Abruf nutzen

Nextcloud speichert den **App-Aktivierungsstatus** unter `oc_appconfig.maildrop.enabled` (`yes`/`no`).

Abruf steuern ausschließlich über **`fetch_enabled` pro Mapping** (JSON-Key `mappings`).  
Niemals den App-Key `enabled` als Feature-Flag missbrauchen.

### Mehrere Mappings

- Gespeichert als JSON in App-Config `mappings`
- Jedes Mapping hat eigene IMAP-Daten, Filter, Zielordner, `fetch_enabled`, `last_uid` und Lauf-Status (`last_run` / `last_status` / `last_error`)
- Legacy-Einzelconfig (flache Keys wie `imap_host`, …) wird beim ersten Lesen automatisch migriert
- Admin-UI: Liste links, Editor rechts
- Zielbenutzer: kompakte Combobox (Client-Filter); User-Liste via `GET /api/users`; Dropdown an `document.body` (sonst clippt Settings-Layout)
- Zielordner: Button „Ordner wählen…“ nutzt `OC.dialogs.filepicker` (nativer NC-Dialog, nur Ordner); zeigt Dateien des **angemeldeten** Admins, nicht zwingend von `target_user`
- API: `GET/PUT /api/config`, `GET /api/users`, `POST /api/mappings`, `PUT/DELETE /api/mappings/{id}`, `POST /api/test|fetch` mit optionalem `{id}`
- Tests/Skripte: Mapping-Config über `ConfigService::saveMappings()` setzen – **nicht** über flache `occ config:app:set maildrop imap_*`-Keys

### Passwort laden vs. speichern

- **`hydrateMapping()`**: aus gespeichertem JSON lesen – Passwort bleibt wie gespeichert (bereits verschlüsselt), **nicht** erneut encrypten
- **`normalizeMapping()`**: nur beim Speichern/Anlegen – Klartext-Passwort encrypten; leerer Client-Wert → bisheriges Passwort behalten
- Doppeltes Encrypten beim Laden bricht den IMAP-Login (häufige Falle bei Refactors am ConfigService)

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
- Nie im API-Response an den Client zurückgeben (`imap_password_set` statt Klartext)

## Coding-Konventionen

- PHP: `declare(strict_types=1);`, Namespace `OCA\MailDrop\...`
- Nextcloud-OCP-Interfaces bevorzugen (`IRootFolder`, `IConfig`, …)
- Gezielte Diffs: keine unnötigen Refactors, keine unsolicited Markdown-Docs
- Nutzerkommunikation: **Deutsch**
- Commits/PRs: nur auf ausdrücklichen Wunsch; PR-Body auf Englisch ok

## Tests & CI

- E2E: `tests/integration/test_mail_to_nextcloud.py`
  - echte SMTP-Mail → GreenMail → `occ maildrop:fetch` → WebDAV-Assertion
  - konfiguriert ein Mapping via `ConfigService::saveMappings()` (inkl. `fetch_enabled`)
- Zielordner im E2E: `/MailDrop-Integration` (ASCII, zuverlässig für WebDAV)
- CI: `.github/workflows/integration.yml`
  - `COMPOSE_FILE=docker-compose.yml:docker-compose.ci.yml`
  - startet nur `db` / `mail` / `nextcloud` (kein Profile `full`)
  - `docker-compose.ci.yml` ersetzt den App-Bind-Mount durch ein leeres Volume – sonst schlägt die Nextcloud-Erstinstallation unter Linux mit „Cannot write into apps“ fehl
  - App wird per `docker compose cp` nach `custom_apps/maildrop` kopiert und per `occ app:enable` aktiviert
  - CI-Workflows / Compose-Overrides nicht ändern, nur um Checks „grün“ zu machen

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
| Mapping-Felder / Persistenz | `ConfigService` (`hydrate` vs `normalize`), danach UI + E2E anpassen |
| Admin-UI erweitern | `ConfigService` + `ConfigController` + `js/admin.js` |
| Neuen Occ-Befehl | Klasse unter `lib/Command/`, in `info.xml` registrieren, Version bumpen |
| Dependencies | `composer.json` / `composer.lock` committen, nicht `vendor/` |
| CI-Install kaputt | Bind-Mount vs. `docker-compose.ci.yml` prüfen; App per `compose cp` |

## Releases

```bash
# Version in info.xml setzen (optional) und Tarball bauen – inkl. vendor/
./scripts/build-release.sh 1.0.0
# → dist/maildrop-1.0.0.tar.gz (+ .sha256)
```

- Archiv-Root muss der App-Ordner `maildrop/` sein
- `vendor/` gehört **ins** Release (gitignored im Repo)
- GitHub Release: Tag `vX.Y.Z`, Asset = gebautes Archiv
- App-Version in `apps/maildrop/appinfo/info.xml` muss zum Tag passen

## Nicht tun

- Keine Exploits/Malware, keine Secrets committen
- `git push --force` auf `main` vermeiden
- Docker-Volumes (`down -v`) nur wenn bewusst Datenverlust ok ist
- App-Config-Key nicht `enabled` für Feature-Flags missbrauchen
- Gespeicherte Mapping-Passwörter nicht nochmal durch `normalizeMapping()` / `encrypt()` jagen
- In CI den lokalen `./apps`-Bind-Mount nicht wieder aktivieren (bricht Linux-Install)
- Release-Archive ohne `vendor/` veröffentlichen
