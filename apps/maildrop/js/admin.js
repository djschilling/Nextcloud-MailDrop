/**
 * MailDrop – Admin-Einstellungen (mehrere Mappings)
 */
(function () {
	const initial = OCP.InitialState.loadState('maildrop', 'config')
	let mappings = Array.isArray(initial.mappings) ? initial.mappings.slice() : []
	let selectedId = mappings[0] ? mappings[0].id : null

	const el = document.getElementById('maildrop-admin')
	if (!el) {
		return
	}

	function selectedMapping() {
		return mappings.find((m) => m.id === selectedId) || null
	}

	function emptyMapping() {
		return {
			id: '',
			name: 'Neues Mapping',
			fetch_enabled: false,
			imap_host: 'mail',
			imap_port: 3143,
			imap_encryption: 'none',
			imap_user: 'maildrop',
			imap_password: '',
			imap_password_set: false,
			imap_folder: 'INBOX',
			target_user: 'admin',
			target_path: '/Mail-Anhänge',
			mark_as_seen: true,
			delete_after_import: false,
			subject_filter: '',
			sender_filter: '',
			last_run: '',
			last_status: '',
			last_error: '',
		}
	}

	function render() {
		const mapping = selectedMapping() || emptyMapping()
		el.innerHTML = `
			<h2>MailDrop</h2>
			<p class="settings-hint">
				Mehrere Mapping-Konfigurationen: jedes Mapping verbindet ein IMAP-Postfach
				(optional gefiltert) mit einem Zielordner in Nextcloud.
			</p>

			<div class="maildrop-layout">
				<aside class="maildrop-sidebar">
					<div class="maildrop-sidebar__header">
						<strong>Mappings</strong>
						<button type="button" id="mf-add" class="primary">Hinzufügen</button>
					</div>
					<ul class="maildrop-list" id="mf-list">
						${mappings.map((m) => `
							<li class="maildrop-list__item ${m.id === selectedId ? 'is-active' : ''}" data-id="${escapeAttr(m.id)}">
								<span class="maildrop-list__name">${escapeHtml(m.name || 'Ohne Namen')}</span>
								<span class="maildrop-list__meta">${m.fetch_enabled ? 'aktiv' : 'pausiert'} · ${escapeHtml(m.target_path || '/')}</span>
							</li>
						`).join('') || '<li class="maildrop-list__empty">Noch keine Mappings</li>'}
					</ul>
					<p class="maildrop-actions maildrop-actions--stack">
						<button type="button" id="mf-fetch-all">Alle aktiven abrufen</button>
					</p>
				</aside>

				<section class="maildrop-editor">
					<form id="maildrop-form" class="maildrop-form">
						<p>
							<label for="mf-name">Name</label>
							<input type="text" id="mf-name" value="${escapeAttr(mapping.name)}" required>
						</p>
						<p>
							<input type="checkbox" id="mf-enabled" class="checkbox" ${mapping.fetch_enabled ? 'checked' : ''}>
							<label for="mf-enabled">Abruf für dieses Mapping aktivieren</label>
						</p>

						<h3>IMAP-Zugang</h3>
						<p>
							<label for="mf-host">Host</label>
							<input type="text" id="mf-host" value="${escapeAttr(mapping.imap_host)}" placeholder="mail">
						</p>
						<p>
							<label for="mf-port">Port</label>
							<input type="number" id="mf-port" value="${escapeAttr(String(mapping.imap_port))}" min="1" max="65535">
						</p>
						<p>
							<label for="mf-enc">Verschlüsselung</label>
							<select id="mf-enc">
								<option value="none" ${mapping.imap_encryption === 'none' ? 'selected' : ''}>Keine</option>
								<option value="tls" ${mapping.imap_encryption === 'tls' ? 'selected' : ''}>STARTTLS</option>
								<option value="ssl" ${mapping.imap_encryption === 'ssl' ? 'selected' : ''}>SSL/TLS</option>
							</select>
						</p>
						<p>
							<label for="mf-user">IMAP-Benutzer</label>
							<input type="text" id="mf-user" value="${escapeAttr(mapping.imap_user)}" autocomplete="off">
						</p>
						<p>
							<label for="mf-pass">Passwort ${mapping.imap_password_set ? '(gesetzt – leer lassen zum Behalten)' : ''}</label>
							<input type="password" id="mf-pass" value="" autocomplete="new-password" placeholder="${mapping.imap_password_set ? '••••••••' : ''}">
						</p>
						<p>
							<label for="mf-folder">IMAP-Ordner</label>
							<input type="text" id="mf-folder" value="${escapeAttr(mapping.imap_folder)}" placeholder="INBOX">
						</p>

						<h3>Ziel in Nextcloud</h3>
						<p class="maildrop-user-picker">
							<label for="mf-target-user-input">Zielbenutzer</label>
							<input type="hidden" id="mf-target-user" value="${escapeAttr(mapping.target_user)}" required>
							<input
								type="text"
								id="mf-target-user-input"
								class="maildrop-user-picker__input"
								value="${escapeAttr(mapping.target_user)}"
								placeholder="Name oder User-ID eingeben…"
								autocomplete="off"
								spellcheck="false"
								role="combobox"
								aria-expanded="false"
								aria-controls="mf-user-results"
								aria-autocomplete="list"
							>
							<ul id="mf-user-results" class="maildrop-user-picker__menu" role="listbox" hidden></ul>
							<em class="maildrop-hint" id="mf-target-user-hint"></em>
						</p>
						<p>
							<label for="mf-target-path">Zielordner</label>
							<span class="maildrop-path-row">
								<input type="text" id="mf-target-path" value="${escapeAttr(mapping.target_path)}" placeholder="/Mail-Anhänge">
								<button type="button" id="mf-pick-path" title="Ordner über Nextcloud-Dateiauswahl wählen">Ordner wählen…</button>
							</span>
							<em class="maildrop-hint">Der Dialog zeigt die Dateien des angemeldeten Admins. Existiert der Ordner noch nicht, kann der Pfad auch manuell eingetragen werden (wird beim Abruf angelegt).</em>
						</p>

						<h3>Filter &amp; Verhalten</h3>
						<p>
							<label for="mf-subject">Betreff enthält (optional)</label>
							<input type="text" id="mf-subject" value="${escapeAttr(mapping.subject_filter || '')}">
						</p>
						<p>
							<label for="mf-sender">Absender enthält (optional)</label>
							<input type="text" id="mf-sender" value="${escapeAttr(mapping.sender_filter || '')}">
						</p>
						<p>
							<input type="checkbox" id="mf-seen" class="checkbox" ${mapping.mark_as_seen ? 'checked' : ''}>
							<label for="mf-seen">Nachrichten nach Import als gelesen markieren</label>
						</p>
						<p>
							<input type="checkbox" id="mf-delete" class="checkbox" ${mapping.delete_after_import ? 'checked' : ''}>
							<label for="mf-delete">Nachrichten nach Import löschen</label>
						</p>

						<p class="maildrop-actions">
							<button type="submit" class="primary">Mapping speichern</button>
							<button type="button" id="mf-test">Verbindung testen</button>
							<button type="button" id="mf-fetch">Dieses Mapping abrufen</button>
							<button type="button" id="mf-delete-mapping" ${mappings.length <= 1 ? 'disabled' : ''}>Löschen</button>
						</p>
					</form>

					<div id="maildrop-status" class="maildrop-status" aria-live="polite"></div>

					<div class="maildrop-meta">
						<p><strong>Letzter Lauf:</strong> <span id="mf-last-run">${escapeHtml(mapping.last_run || '–')}</span></p>
						<p><strong>Status:</strong> <span id="mf-last-status">${escapeHtml(mapping.last_status || '–')}</span></p>
						<p><strong>Meldung:</strong> <span id="mf-last-error">${escapeHtml(mapping.last_error || '–')}</span></p>
					</div>
				</section>
			</div>
		`

		bindEvents()
	}

	function bindEvents() {
		const statusEl = document.getElementById('maildrop-status')

		document.querySelectorAll('.maildrop-list__item[data-id]').forEach((item) => {
			item.addEventListener('click', () => {
				selectedId = item.getAttribute('data-id')
				render()
			})
		})

		document.getElementById('mf-add').addEventListener('click', async () => {
			setStatus('Lege Mapping an…', 'info')
			try {
				const created = await api('POST', '/apps/maildrop/api/mappings', emptyMapping())
				mappings.push(created)
				selectedId = created.id
				render()
				setStatus('Neues Mapping angelegt – bitte speichern/konfigurieren.', 'ok')
			} catch (error) {
				setStatus(error.message || 'Anlegen fehlgeschlagen.', 'error')
			}
		})

		document.getElementById('mf-pick-path').addEventListener('click', () => {
			pickTargetFolder(setStatus)
		})

		bindUserPicker()

		document.getElementById('maildrop-form').addEventListener('submit', async (event) => {
			event.preventDefault()
			if (!selectedId) {
				return
			}
			setStatus('Speichere Mapping…', 'info')
			try {
				const saved = await api('PUT', '/apps/maildrop/api/mappings/' + encodeURIComponent(selectedId), collectPayload())
				mappings = mappings.map((m) => (m.id === saved.id ? saved : m))
				render()
				setStatus('Mapping gespeichert.', 'ok')
			} catch (error) {
				setStatus(error.message || 'Speichern fehlgeschlagen.', 'error')
			}
		})

		document.getElementById('mf-test').addEventListener('click', async () => {
			if (!selectedId) {
				return
			}
			setStatus('Teste Verbindung…', 'info')
			try {
				await api('PUT', '/apps/maildrop/api/mappings/' + encodeURIComponent(selectedId), collectPayload())
				const result = await api('POST', '/apps/maildrop/api/test', { id: selectedId })
				setStatus(result.message, result.success ? 'ok' : 'error')
			} catch (error) {
				setStatus(error.message || 'Test fehlgeschlagen.', 'error')
			}
		})

		document.getElementById('mf-fetch').addEventListener('click', async () => {
			if (!selectedId) {
				return
			}
			setStatus('Rufe Mapping ab…', 'info')
			try {
				await api('PUT', '/apps/maildrop/api/mappings/' + encodeURIComponent(selectedId), collectPayload())
				const result = await api('POST', '/apps/maildrop/api/fetch', { id: selectedId })
				await reload()
				setStatus(result.message, result.success ? 'ok' : 'error')
			} catch (error) {
				setStatus(error.message || 'Abruf fehlgeschlagen.', 'error')
			}
		})

		document.getElementById('mf-fetch-all').addEventListener('click', async () => {
			setStatus('Rufe alle aktiven Mappings ab…', 'info')
			try {
				const result = await api('POST', '/apps/maildrop/api/fetch', {})
				await reload()
				setStatus(result.message, result.success ? 'ok' : 'error')
			} catch (error) {
				setStatus(error.message || 'Abruf fehlgeschlagen.', 'error')
			}
		})

		document.getElementById('mf-delete-mapping').addEventListener('click', async () => {
			if (!selectedId || mappings.length <= 1) {
				return
			}
			if (!window.confirm('Dieses Mapping wirklich löschen?')) {
				return
			}
			setStatus('Lösche Mapping…', 'info')
			try {
				const result = await api('DELETE', '/apps/maildrop/api/mappings/' + encodeURIComponent(selectedId))
				mappings = result.mappings || []
				selectedId = mappings[0] ? mappings[0].id : null
				render()
				setStatus('Mapping gelöscht.', 'ok')
			} catch (error) {
				setStatus(error.message || 'Löschen fehlgeschlagen.', 'error')
			}
		})

		function setStatus(message, type) {
			statusEl.textContent = message
			statusEl.className = 'maildrop-status maildrop-status--' + type
		}
	}

	function currentUserId() {
		if (typeof OC.getCurrentUser === 'function') {
			const user = OC.getCurrentUser()
			if (user && user.uid) {
				return String(user.uid)
			}
		}
		return typeof OC.currentUser === 'string' ? OC.currentUser : ''
	}

	function formatUserLabel(user) {
		if (!user) {
			return ''
		}
		const id = user.id || ''
		const name = user.displayName || id
		return name === id ? id : (name + ' (' + id + ')')
	}

	function bindUserPicker() {
		const hidden = document.getElementById('mf-target-user')
		const input = document.getElementById('mf-target-user-input')
		const menu = document.getElementById('mf-user-results')
		const hint = document.getElementById('mf-target-user-hint')
		if (!hidden || !input || !menu || !hint) {
			return
		}

		let allUsers = []
		let visibleUsers = []
		let activeIndex = -1
		let open = false

		// Menü an body hängen – sonst schneidet das Settings-Layout die Liste ab
		if (menu.parentElement !== document.body) {
			document.body.appendChild(menu)
		}

		const positionMenu = () => {
			const rect = input.getBoundingClientRect()
			menu.style.position = 'fixed'
			menu.style.left = Math.round(rect.left) + 'px'
			menu.style.top = Math.round(rect.bottom + 4) + 'px'
			menu.style.width = Math.round(rect.width) + 'px'
			menu.style.right = 'auto'
		}

		const setOpen = (next) => {
			open = next
			menu.hidden = !next
			input.setAttribute('aria-expanded', next ? 'true' : 'false')
			if (next) {
				positionMenu()
			}
			if (!next) {
				activeIndex = -1
			}
		}

		const matchesQuery = (user, query) => {
			if (!query) {
				return true
			}
			const q = query.toLocaleLowerCase()
			const id = String(user.id || '').toLocaleLowerCase()
			const name = String(user.displayName || '').toLocaleLowerCase()
			return id.includes(q) || name.includes(q)
		}

		const selectUser = (user) => {
			hidden.value = user.id
			input.value = formatUserLabel(user)
			hint.textContent = ''
			setOpen(false)
		}

		const renderMenu = (users) => {
			visibleUsers = users
			if (!users.length) {
				menu.innerHTML = '<li class="maildrop-user-picker__empty">Keine Treffer</li>'
				setOpen(true)
				return
			}
			menu.innerHTML = users.map((user, index) => (
				'<li role="option" class="maildrop-user-picker__option'
				+ (index === activeIndex ? ' is-active' : '')
				+ '" data-index="' + index + '" data-id="' + escapeAttr(user.id) + '">'
				+ '<span class="maildrop-user-picker__name">' + escapeHtml(user.displayName || user.id) + '</span>'
				+ '<span class="maildrop-user-picker__id">' + escapeHtml(user.id) + '</span>'
				+ '</li>'
			)).join('')
			menu.querySelectorAll('.maildrop-user-picker__option').forEach((item) => {
				item.addEventListener('mousedown', (event) => {
					event.preventDefault()
					const id = item.getAttribute('data-id')
					const user = visibleUsers.find((u) => u.id === id)
					if (user) {
						selectUser(user)
					}
				})
			})
			setOpen(true)
		}

		const applyFilter = (query) => {
			const filtered = allUsers.filter((user) => matchesQuery(user, query))
			activeIndex = filtered.length ? 0 : -1
			renderMenu(filtered)
			hint.textContent = allUsers.length
				? (filtered.length + ' von ' + allUsers.length)
				: ''
		}

		const syncLabelFromHidden = () => {
			const uid = hidden.value.trim()
			if (!uid) {
				return
			}
			const match = allUsers.find((u) => u.id === uid)
			if (match) {
				input.value = formatUserLabel(match)
			}
		}

		input.addEventListener('focus', () => {
			input.value = ''
			if (!allUsers.length) {
				hint.textContent = 'Lade Benutzer…'
				menu.innerHTML = '<li class="maildrop-user-picker__empty">Lade Benutzer…</li>'
				setOpen(true)
				return
			}
			applyFilter('')
		})

		input.addEventListener('input', () => {
			applyFilter(input.value.trim())
			if (open) {
				positionMenu()
			}
		})

		window.addEventListener('resize', () => {
			if (open) {
				positionMenu()
			}
		})
		window.addEventListener('scroll', () => {
			if (open) {
				positionMenu()
			}
		}, true)

		input.addEventListener('keydown', (event) => {
			if (event.key === 'ArrowDown') {
				event.preventDefault()
				if (!open) {
					applyFilter(input.value.trim())
				}
				if (!visibleUsers.length) {
					return
				}
				activeIndex = (activeIndex + 1) % visibleUsers.length
				renderMenu(visibleUsers)
			} else if (event.key === 'ArrowUp') {
				event.preventDefault()
				if (!visibleUsers.length) {
					return
				}
				activeIndex = (activeIndex - 1 + visibleUsers.length) % visibleUsers.length
				renderMenu(visibleUsers)
			} else if (event.key === 'Enter') {
				if (open && activeIndex >= 0 && visibleUsers[activeIndex]) {
					event.preventDefault()
					selectUser(visibleUsers[activeIndex])
				}
			} else if (event.key === 'Escape') {
				setOpen(false)
			}
		})

		input.addEventListener('blur', () => {
			window.setTimeout(() => {
				setOpen(false)
				const typed = input.value.trim()
				if (!typed) {
					// Abbruch der Suche: bisherigen Zielbenutzer behalten
					syncLabelFromHidden()
					hint.textContent = ''
					return
				}
				const byId = allUsers.find((u) => u.id === typed)
				const byLabel = allUsers.find((u) => formatUserLabel(u) === typed)
				const byName = allUsers.find((u) => (u.displayName || '') === typed)
				const match = byId || byLabel || byName
				if (match) {
					selectUser(match)
					return
				}
				if (typed.includes('(') && typed.endsWith(')')) {
					const id = typed.slice(typed.lastIndexOf('(') + 1, -1).trim()
					const known = allUsers.find((u) => u.id === id)
					if (known) {
						selectUser(known)
						return
					}
				}
				const partial = allUsers.filter((u) => matchesQuery(u, typed))
				if (partial.length === 1) {
					selectUser(partial[0])
					return
				}
				// Freitext-ID erlauben
				hidden.value = typed
				hint.textContent = allUsers.some((u) => u.id === typed)
					? ''
					: 'Unbekannte User-ID – speichern möglich, Abruf prüft Existenz.'
			}, 120)
		})

		hint.textContent = 'Lade Benutzer…'
		api('GET', '/apps/maildrop/api/users?search=&limit=200')
			.then((data) => {
				allUsers = Array.isArray(data.users) ? data.users : []
				syncLabelFromHidden()
				hint.textContent = allUsers.length ? '' : 'Keine Benutzer gefunden'
			})
			.catch((error) => {
				hint.textContent = 'Benutzerliste nicht ladbar: ' + (error.message || 'Fehler')
			})
	}

	/**
	 * Nativer Nextcloud-Ordnerdialog (OC.dialogs.filepicker → @nextcloud/dialogs).
	 * Zeigt die Dateien des angemeldeten Users – nicht zwingend von target_user.
	 */
	function pickTargetFolder(setStatus) {
		if (typeof OC.dialogs === 'undefined' || typeof OC.dialogs.filepicker !== 'function') {
			setStatus('Ordner-Auswahl ist in dieser Nextcloud-Version nicht verfügbar. Bitte Pfad manuell eintragen.', 'error')
			return
		}

		const pathInput = document.getElementById('mf-target-path')
		const targetUser = document.getElementById('mf-target-user').value.trim()
		const me = currentUserId()
		if (targetUser && me && targetUser !== me) {
			setStatus(
				'Hinweis: Der Dialog zeigt die Dateien von „' + me + '“, Zielbenutzer ist „' + targetUser + '“. '
				+ 'Pfad ggf. manuell setzen oder Zielbenutzer auf den angemeldeten Admin stellen.',
				'info',
			)
		}

		let startPath = (pathInput.value || '/').trim() || '/'
		if (!startPath.startsWith('/')) {
			startPath = '/' + startPath
		}

		const type = OC.dialogs.FILEPICKER_TYPE_CHOOSE || 1
		OC.dialogs.filepicker(
			'Zielordner wählen',
			(path) => {
				let chosen = path || '/'
				if (!chosen.startsWith('/')) {
					chosen = '/' + chosen
				}
				pathInput.value = chosen
			},
			false,
			['httpd/unix-directory'],
			true,
			type,
			startPath,
			{ allowDirectoryChooser: true },
		)
	}

	function collectPayload() {
		return {
			id: selectedId,
			name: document.getElementById('mf-name').value.trim() || 'Mapping',
			fetch_enabled: document.getElementById('mf-enabled').checked,
			imap_host: document.getElementById('mf-host').value.trim(),
			imap_port: Number(document.getElementById('mf-port').value),
			imap_encryption: document.getElementById('mf-enc').value,
			imap_user: document.getElementById('mf-user').value.trim(),
			imap_password: document.getElementById('mf-pass').value,
			imap_folder: document.getElementById('mf-folder').value.trim() || 'INBOX',
			target_user: document.getElementById('mf-target-user').value.trim(),
			target_path: document.getElementById('mf-target-path').value.trim(),
			mark_as_seen: document.getElementById('mf-seen').checked,
			delete_after_import: document.getElementById('mf-delete').checked,
			subject_filter: document.getElementById('mf-subject').value.trim(),
			sender_filter: document.getElementById('mf-sender').value.trim(),
		}
	}

	async function reload() {
		const data = await api('GET', '/apps/maildrop/api/config')
		mappings = Array.isArray(data.mappings) ? data.mappings : []
		if (!mappings.find((m) => m.id === selectedId)) {
			selectedId = mappings[0] ? mappings[0].id : null
		}
		render()
	}

	async function api(method, url, body) {
		const q = url.indexOf('?')
		const path = q === -1 ? url : url.slice(0, q)
		const query = q === -1 ? '' : url.slice(q)
		const response = await fetch(OC.generateUrl(path) + query, {
			method,
			headers: {
				'Content-Type': 'application/json',
				requesttoken: OC.requestToken,
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
		})

		let data = {}
		try {
			data = await response.json()
		} catch (e) {
			// ignore
		}

		if (!response.ok) {
			throw new Error(data.message || data.error || ('HTTP ' + response.status))
		}
		return data
	}

	function escapeHtml(value) {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
	}

	function escapeAttr(value) {
		return escapeHtml(value)
	}

	render()
})()
