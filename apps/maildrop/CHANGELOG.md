# Changelog

## 1.1.4

- App Store listing: Nextcloud 28–35, store description (en/de), admin screenshots, app icon
- Remove leftover single-config IMAP keys after the mappings migration
- Add `occ maildrop:purge-config` to delete stored mappings (imported files are kept)
- Release script signs the archive when `~/.nextcloud/certificates/maildrop.{key,crt}` is present

## 1.1.3

- Extend Nextcloud compatibility to 28–36
- Drop PHP `max-version` so supported PHP follows the Nextcloud server range

## 1.1.2

- Admin folder picker browses the selected target user's folders (not only the logged-in admin)

## 1.1.1

- Fix IMAP UID fetch on IONOS and similar servers (`getByUidGreater`)

## 1.1.0

- Flat attachment storage by default (timestamp/UID prefix)
- Optional per-mail folders and `.eml` sidecars
- UIDVALIDITY tracking, config locks, cert validation, attachment size limit
- Cursor reset in admin UI; `occ maildrop:fetch -m <id>`

## 1.0.1

- Nextcloud 28–34 support
- Replace deprecated initial-state API

## 1.0.0

- Initial installable release
