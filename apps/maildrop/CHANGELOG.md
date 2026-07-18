# Changelog

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
