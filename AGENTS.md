# AGENTS.md – Nextcloud MailDrop

Notes for AI agents working in this repository.

## Project

**Nextcloud MailDrop** is a Nextcloud app that fetches email via **IMAP**, extracts attachments, and stores them in Nextcloud Files. Configuration is done in the admin UI.

| Context | Value |
|---------|--------|
| Display name (UI) | MailDrop |
| App ID | `maildrop` |
| PHP namespace | `OCA\MailDrop` |
| App path | `apps/maildrop/` |
| GitHub | `djschilling/Nextcloud-MailDrop` |
| License | MIT (`LICENSE`, `apps/maildrop/LICENSE`) |
| Author | David Schilling `<davejs92@gmail.com>` |
| Current version | see `apps/maildrop/appinfo/info.xml` (released tags: `v1.0.0`, `v1.0.1`, `v1.1.0`, `v1.1.1`, `v1.1.2`) |
| Changelog | `apps/maildrop/CHANGELOG.md` |

## Tech stack

- Nextcloud 28–34 (Docker dev image often `nextcloud:31-apache` or `34-apache`)
- PHP 8.1–8.4 (set `max-version` to **8.5** in `info.xml` – Nextcloud treats PHP `max-version` as exclusive)
- IMAP via `webklex/php-imap` (Composer, **no** php-imap extension)
- Attachments default **flat**: `{Ymd_His}_uid{N}_{filename}` via `AttachmentNamer`
- Optional: `create_mail_folder`, `save_mail_file` – both **false** by default
- Cursor: `last_uid` + `uidvalidity` (reset when UIDVALIDITY changes); config writes under lock
- UID fetch: **`getByUidGreater($lastUid)`** – do **not** use `whereUid('N:*')` (IONOS rejects it → silent empty fetch, cursor stays 0)
- Limits: `max_attachment_bytes` (default 25 MiB), `imap_validate_cert` (default true)
- MariaDB, GreenMail (SMTP 3025 / IMAP 3143)
- Admin UI: plain JS + Nextcloud Settings API (no Vue build)
- l10n: English source strings + `l10n/en.*` / `l10n/de.*`
- E2E: Python 3 (stdlib only); unit: `tests/Unit/*.php` (`AttachmentNamerTest`, `UserFolderBrowserTest`)

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
docker compose exec -u www-data nextcloud php occ maildrop:fetch -m <mapping-id>
docker compose exec -u www-data nextcloud php occ upgrade

# Unit tests
php apps/maildrop/tests/Unit/AttachmentNamerTest.php
php apps/maildrop/tests/Unit/UserFolderBrowserTest.php

# Manual test mail
python3 scripts/send-test-mail.py

# Integration test (stack must be running)
./tests/integration/run.sh
# or:
python3 tests/integration/test_mail_to_nextcloud.py

# Release tarball
./scripts/build-release.sh          # version from info.xml
./scripts/build-release.sh 1.1.1    # set version + build
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
| `appinfo/info.xml` | Metadata, jobs, settings, commands – **bump version** on structural changes |
| `appinfo/routes.php` | REST routes for admin API |
| `lib/AppInfo/Application.php` | Bootstrap + Composer autoload |
| `lib/Service/ConfigService.php` | App config (encrypted IMAP password, locks, cursor) |
| `lib/Service/MailFetchService.php` | IMAP, attachments, store in Files |
| `lib/Service/AttachmentNamer.php` | Filename sanitize / flat prefix helper |
| `lib/BackgroundJob/FetchMailJob.php` | TimedJob every 300s |
| `lib/Command/FetchCommand.php` | `occ maildrop:fetch` (`-m` optional) |
| `lib/Controller/ConfigController.php` | REST API for admin UI |
| `lib/Settings/` | Admin section + form (`Util::addTranslations`) |
| `js/admin.js` / `css/admin.css` | Settings UI (`t('maildrop', …)`) |
| `l10n/*.json` / `l10n/*.js` | Translations (`en`, `de`); keep both `.json` and `.js` in sync |
| `CHANGELOG.md` / `LICENSE` | App Store / release metadata |
| `tests/Unit/` | Unit tests (also run in CI) |

### Mapping fields (persist in app config `mappings` JSON)

Important keys: `id`, `name`, `fetch_enabled`, IMAP fields (`imap_host`, `imap_port`, `imap_encryption`, `imap_validate_cert`, `imap_user`, `imap_password`, `imap_folder`), `target_user`, `target_path`, `subject_filter`, `sender_filter`, `max_attachment_bytes`, `create_mail_folder`, `save_mail_file`, `mark_as_seen`, `delete_after_import`, runtime: `last_uid`, `uidvalidity`, `last_run`, `last_status`, `last_error`.

### Docker

- `docker-compose.yml`: core services `db`, `nextcloud`, `mail` (GreenMail)
- `cron` and `app-init` only with Compose profile **`full`**
- Local: app via bind-mount `./apps` → `/var/www/html/custom_apps`
- `app-init` enables `maildrop` after first install (profile `full` only)
- Nextcloud healthcheck only checks Apache/`status.php` – not “installed”, so `compose up` does not hang on cron/app-init
- `docker-compose.ci.yml`: replaces apps bind-mount; CI copies the app with `docker compose cp`

## Critical rules

### Do not use config key `enabled` for fetch

Nextcloud stores the **app enablement status** under `oc_appconfig.maildrop.enabled` (`yes`/`no`).

Control fetching only via **`fetch_enabled` per mapping** (JSON key `mappings`).  
Never misuse the app key `enabled` as a feature flag.

### Multiple mappings

- Stored as JSON in app config `mappings`
- Each mapping has its own IMAP data, filters, target folder, `fetch_enabled`, cursor, and run status
- Legacy single-config (flat keys like `imap_host`, …) is migrated automatically on first read
- Admin UI: list on the left, editor on the right
- Target user: compact combobox; `GET /api/users`; dropdown on `document.body` (settings layout clips otherwise)
- Target folder: custom dialog via `GET /api/folders?user=&path=` (browses selected `target_user`, not only the logged-in admin)
- API: `GET/PUT /api/config`, `GET /api/users`, `GET /api/folders`, `POST /api/mappings`, `PUT/DELETE /api/mappings/{id}`, `POST /api/test`, `POST /api/fetch`, `POST /api/mappings/{id}/reset-cursor`
- Tests/scripts: configure via `ConfigService::saveMappings()` – **not** flat `occ config:app:set maildrop imap_*`

### IMAP UID search

- Use `$mailbox->messages()->leaveUnread()->setFetchOrder('asc')->getByUidGreater($lastUid)`
- Catch empty/error → treat as no messages; still write `uidvalidity` / status
- Cursor advances after each message (including “no attachments” skips)

### Loading vs saving passwords

- **`hydrateMapping()`**: read from stored JSON – password already encrypted, **do not** encrypt again
- **`normalizeMapping()`**: only when saving/creating – encrypt plaintext; empty client value → keep previous
- Double-encrypting on load breaks IMAP login

### Localization

- English is the **source** language in PHP (`$l10n->t('…')`) and JS (`t('maildrop', '…')`)
- When adding UI/API user-visible strings: update `l10n/en.json` + `en.js` and `l10n/de.json` + `de.js`
- Load translations in admin form via `Util::addTranslations(Application::APP_ID)` before `addScript`
- Do not hardcode German (or any language) in `admin.js` again

### Registering settings

- Admin settings/sections live in `info.xml`
- After changes to `info.xml` (settings, commands, jobs): **bump version**, then `occ upgrade` or re-enable the app
- No `appinfo/app.php` when `Application` implements `IBootstrap` (otherwise error-log spam)

### Composer / vendor

- `apps/maildrop/vendor/` is gitignored
- Always run `composer install` in the app directory before Docker start and in CI
- Autoload is loaded in `Application::__construct()`
- Release archives **must** include `vendor/`

### Passwords

- Store IMAP password encrypted only (`OCP\Security\ICrypto`)
- Never return it to the client (`imap_password_set` instead of plaintext)

## Coding conventions

- PHP: `declare(strict_types=1);`, namespace `OCA\MailDrop\...`
- Prefer Nextcloud OCP interfaces (`IRootFolder`, `IConfig`, `IL10N`, …)
- Focused diffs: no unnecessary refactors, no unsolicited markdown docs
- User-facing chat replies: **German**
- Commits/PRs: only when explicitly requested; PR body in English is fine
- Repository documentation (`README`, `AGENTS`, `info.xml` texts, CHANGELOG): **English**
- Do not commit `nextcloud-server.md` or other local server notes / secrets

## Tests & CI

- Unit: `apps/maildrop/tests/Unit/*.php` (CI runs these)
- E2E: `tests/integration/test_mail_to_nextcloud.py`
  - SMTP → GreenMail → `occ maildrop:fetch` → WebDAV
  - scenarios: `flat-default`, `mail-folder`, `save-mail-file`, `folder-and-eml`
  - configures mapping via `ConfigService::saveMappings()` (incl. `fetch_enabled`, storage flags)
- CI: `.github/workflows/integration.yml`
  - `COMPOSE_FILE=docker-compose.yml:docker-compose.ci.yml`
  - services: `db` / `mail` / `nextcloud` only
  - app via `docker compose cp` → `custom_apps/maildrop` + `occ app:enable`
  - do not re-enable the local `./apps` bind-mount in CI

When fetch/tests fail, check:

```bash
docker compose logs --tail 100 nextcloud mail
docker compose exec -u www-data nextcloud php occ config:list maildrop
docker compose exec -u www-data nextcloud tail -n 80 /var/www/html/data/nextcloud.log
```

## Typical tasks

| Task | Approach |
|------|----------|
| Change IMAP / storage logic | `MailFetchService.php` (+ `AttachmentNamer` if names), run unit + E2E |
| Mapping fields / persistence | `ConfigService` (`hydrate` vs `normalize`), UI + E2E + l10n |
| Extend admin UI | `ConfigService` + `ConfigController` + `js/admin.js` + `l10n/*` |
| New user-visible string | English source + update `en`/`de` json **and** js |
| New occ command | `lib/Command/`, register in `info.xml`, bump version |
| Dependencies | Commit `composer.json` / `composer.lock`, not `vendor/` |
| Broken CI install | Bind-mount vs `docker-compose.ci.yml`; `compose cp` |
| Release | bump `info.xml` + `CHANGELOG.md`, `build-release.sh`, GitHub tag `vX.Y.Z` |

## Releases

```bash
./scripts/build-release.sh 1.1.1
# → dist/maildrop-1.1.1.tar.gz (+ .sha256)
```

- Archive root must be `maildrop/`
- Include `vendor/`, `l10n/`, `LICENSE`, `CHANGELOG.md`
- GitHub release tag `vX.Y.Z` must match `info.xml` version
- Do not put server install helpers with secrets into this repo

## Do not

- No exploits/malware, no committing secrets
- Avoid `git push --force` on `main`
- Docker volumes (`down -v`) only when intentional data loss is OK
- Do not misuse app config key `enabled` for feature flags
- Do not re-encrypt stored mapping passwords on load
- Do not use `whereUid('N:*')` for IMAP ranges
- Do not re-enable the local `./apps` bind-mount in CI
- Do not publish release archives without `vendor/`
- Do not leave hardcoded UI language strings outside l10n

## Cursor Cloud specific instructions

The startup update script only runs `composer install` in `apps/maildrop/`. Everything else is a manual step below (standard commands live in the sections above / README).

- **Docker is not started automatically.** There is no systemd in the VM, so start the daemon manually and leave it running in the background (e.g. a tmux session): `sudo dockerd`. Then run the normal `docker compose ...` commands from the repo root. The `ubuntu` user is in the `docker` group, so `sudo` is not needed for `docker`/`docker compose` themselves.
- Docker is configured for docker-in-docker with the `fuse-overlayfs` storage driver and the containerd snapshotter disabled (required for Docker 29 in this VM) via `/etc/docker/daemon.json`; `iptables` is set to `iptables-legacy`. If networking/overlay errors appear, verify these before debugging further.
- Local dev uses the `./apps` bind-mount (`docker compose up -d`, then `occ app:enable maildrop`). This differs from CI, which copies the app in. After Nextcloud first boots, wait for `status.php` to report `"installed":true` before running `occ` (first install takes ~10-60s).
- PHP CLI and Composer are provided as system packages (not in the update script). The unit test is a plain PHP script (`php apps/maildrop/tests/Unit/AttachmentNamerTest.php`), not PHPUnit.
- The E2E test (`python3 tests/integration/test_mail_to_nextcloud.py`) reconfigures the `mappings` app config and leaves a mapping behind; delete it with `occ config:app:delete maildrop mappings` for a clean UI state.
