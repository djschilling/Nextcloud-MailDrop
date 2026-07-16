# AGENTS.md – Nextcloud MailDrop

Notes for AI agents working in this repository.

## Project

**Nextcloud MailDrop** is a Nextcloud app that fetches email via **IMAP**, extracts attachments, and stores them in Nextcloud Files. Configuration is done in the admin UI.

| Context | Name |
|---------|------|
| Display name (UI) | MailDrop |
| App ID | `maildrop` |
| PHP namespace | `OCA\MailDrop` |
| App path | `apps/maildrop/` |
| GitHub | `djschilling/Nextcloud-MailDrop` |

## Tech stack

- Nextcloud 28–34 (Docker dev: `nextcloud:34-apache`)
- PHP 8.1–8.4 (set `max-version` to **8.5** in `info.xml` – Nextcloud treats PHP `max-version` as exclusive)
- IMAP via `webklex/php-imap` (Composer, **no** php-imap extension)
- Attachments default **flat** in the target folder: `{Ymd_His}_uid{N}_{filename}`
- Optional: `create_mail_folder` (per-mail subfolder), `save_mail_file` (`.eml` next to attachments) – both off by default
- Cursor: `last_uid` + `uidvalidity` (reset when UIDVALIDITY changes); config writes under lock
- MariaDB, GreenMail (SMTP 3025 / IMAP 3143)
- Admin UI: plain JS + Nextcloud Settings API (no Vue build)
- E2E: Python 3 (stdlib only)

## Important commands

```bash
# Dependencies (vendor is gitignored – always required after clone/CI)
cd apps/maildrop && composer install --no-dev --optimize-autoloader

# Local stack (core: db, mail, nextcloud)
docker compose up -d
# optional: cron + app-init (auto-enable)
docker compose --profile full up -d
docker compose logs -f app-init    # only with profile full
docker compose down                # stop
docker compose down -v             # reset including data

# App / occ (in container)
docker compose exec -u www-data nextcloud php occ app:enable maildrop
docker compose exec -u www-data nextcloud php occ maildrop:fetch
docker compose exec -u www-data nextcloud php occ upgrade

# Manual test mail
python3 scripts/send-test-mail.py

# Integration test (stack must be running)
./tests/integration/run.sh
# or:
python3 tests/integration/test_mail_to_nextcloud.py
```

Local URLs: Nextcloud http://localhost:8080 (`admin`/`admin`), GreenMail IMAP `maildrop`/`maildrop`.

## Architecture

```
SMTP → GreenMail → MailDrop (IMAP poll) → Nextcloud Files
                      ↑
              Admin UI / occ / TimedJob (5 min)
```

### App layout (`apps/maildrop/`)

| Path | Role |
|------|------|
| `appinfo/info.xml` | Metadata, jobs, settings, commands – **bump version** on changes |
| `lib/AppInfo/Application.php` | Bootstrap + Composer autoload |
| `lib/Service/ConfigService.php` | App config (encrypted IMAP password) |
| `lib/Service/MailFetchService.php` | IMAP, attachments, store in Files |
| `lib/BackgroundJob/FetchMailJob.php` | TimedJob every 300s |
| `lib/Command/FetchCommand.php` | `occ maildrop:fetch` |
| `lib/Controller/ConfigController.php` | REST API for admin UI |
| `lib/Settings/` | Admin section + form |
| `js/admin.js` / `css/admin.css` | Settings UI |

### Docker

- `docker-compose.yml`: core services `db`, `nextcloud`, `mail` (GreenMail)
- `cron` and `app-init` only with Compose profile **`full`**
- Local: app via bind-mount `./apps` → `/var/www/html/custom_apps`
- `app-init` enables `maildrop` after first install (profile `full` only)
- Nextcloud healthcheck only checks Apache/`status.php` – not “installed”, so `compose up` does not hang on cron/app-init

## Critical rules

### Do not use config key `enabled` for fetch

Nextcloud stores the **app enablement status** under `oc_appconfig.maildrop.enabled` (`yes`/`no`).

Control fetching only via **`fetch_enabled` per mapping** (JSON key `mappings`).  
Never misuse the app key `enabled` as a feature flag.

### Multiple mappings

- Stored as JSON in app config `mappings`
- Each mapping has its own IMAP data, filters, target folder, `fetch_enabled`, `last_uid`, and run status (`last_run` / `last_status` / `last_error`)
- Legacy single-config (flat keys like `imap_host`, …) is migrated automatically on first read
- Admin UI: list on the left, editor on the right
- Target user: compact combobox (client filter); user list via `GET /api/users`; dropdown on `document.body` (otherwise the settings layout clips it)
- Target folder: “Choose folder…” uses `OC.dialogs.filepicker` (native NC dialog, folders only); shows files of the **logged-in** admin, not necessarily `target_user`
- API: `GET/PUT /api/config`, `GET /api/users`, `POST /api/mappings`, `PUT/DELETE /api/mappings/{id}`, `POST /api/test|fetch` with optional `{id}`
- Tests/scripts: set mapping config via `ConfigService::saveMappings()` – **not** via flat `occ config:app:set maildrop imap_*` keys

### Loading vs saving passwords

- **`hydrateMapping()`**: read from stored JSON – password stays as stored (already encrypted), **do not** encrypt again
- **`normalizeMapping()`**: only when saving/creating – encrypt plaintext password; empty client value → keep previous password
- Double-encrypting on load breaks IMAP login (common pitfall when refactoring ConfigService)

### Registering settings

- Admin settings/sections live in `info.xml`
- After changes to `info.xml` (settings, commands, jobs): **bump version**, then `occ upgrade` or re-enable the app
- No `appinfo/app.php` when `Application` implements `IBootstrap` (otherwise error-log spam)

### Composer / vendor

- `apps/maildrop/vendor/` is gitignored
- Always run `composer install` in the app directory before Docker start and in CI
- Autoload is loaded in `Application::__construct()`

### Passwords

- Store IMAP password encrypted only (`OCP\Security\ICrypto`)
- Never return it to the client in API responses (`imap_password_set` instead of plaintext)

## Coding conventions

- PHP: `declare(strict_types=1);`, namespace `OCA\MailDrop\...`
- Prefer Nextcloud OCP interfaces (`IRootFolder`, `IConfig`, …)
- Focused diffs: no unnecessary refactors, no unsolicited markdown docs
- User-facing chat replies: **German**
- Commits/PRs: only when explicitly requested; PR body in English is fine
- Repository documentation (`README`, `AGENTS`, `info.xml` texts): **English**

## Tests & CI

- E2E: `tests/integration/test_mail_to_nextcloud.py`
  - real SMTP mail → GreenMail → `occ maildrop:fetch` → WebDAV assertion
  - configures a mapping via `ConfigService::saveMappings()` (including `fetch_enabled`)
- E2E target folder: `/MailDrop-Integration` (ASCII, reliable for WebDAV)
- CI: `.github/workflows/integration.yml`
  - `COMPOSE_FILE=docker-compose.yml:docker-compose.ci.yml`
  - starts only `db` / `mail` / `nextcloud` (no profile `full`)
  - `docker-compose.ci.yml` replaces the app bind-mount with an empty volume – otherwise Nextcloud first install fails on Linux with “Cannot write into apps”
  - App is copied with `docker compose cp` into `custom_apps/maildrop` and enabled with `occ app:enable`
  - Do not change CI workflows / compose overrides just to make checks green

When fetch/tests fail, check:

```bash
docker compose logs --tail 100 nextcloud mail
docker compose exec -u www-data nextcloud php occ config:list maildrop
docker compose exec -u www-data nextcloud tail -n 80 /var/www/html/data/nextcloud.log
```

## Typical tasks

| Task | Approach |
|------|----------|
| Change IMAP logic | `MailFetchService.php`, run E2E |
| Mapping fields / persistence | `ConfigService` (`hydrate` vs `normalize`), then update UI + E2E |
| Extend admin UI | `ConfigService` + `ConfigController` + `js/admin.js` |
| New occ command | Class under `lib/Command/`, register in `info.xml`, bump version |
| Dependencies | Commit `composer.json` / `composer.lock`, not `vendor/` |
| Broken CI install | Check bind-mount vs `docker-compose.ci.yml`; copy app via `compose cp` |

## Releases

```bash
# Optionally set version in info.xml and build tarball – includes vendor/
./scripts/build-release.sh 1.0.0
# → dist/maildrop-1.0.0.tar.gz (+ .sha256)
```

- Archive root must be the app folder `maildrop/`
- `vendor/` belongs **in** the release (gitignored in the repo)
- GitHub release: tag `vX.Y.Z`, asset = built archive
- App version in `apps/maildrop/appinfo/info.xml` must match the tag

## Do not

- No exploits/malware, no committing secrets
- Avoid `git push --force` on `main`
- Docker volumes (`down -v`) only when intentional data loss is OK
- Do not misuse app config key `enabled` for feature flags
- Do not run stored mapping passwords through `normalizeMapping()` / `encrypt()` again
- Do not re-enable the local `./apps` bind-mount in CI (breaks Linux install)
- Do not publish release archives without `vendor/`
