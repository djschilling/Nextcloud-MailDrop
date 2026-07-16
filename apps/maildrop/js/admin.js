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
							<label for="mf-user">Benutzer</label>
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
						<p>
							<label for="mf-target-user">Benutzer</label>
							<input type="text" id="mf-target-user" value="${escapeAttr(mapping.target_user)}" placeholder="admin">
						</p>
						<p>
							<label for="mf-target-path">Zielordner</label>
							<input type="text" id="mf-target-path" value="${escapeAttr(mapping.target_path)}" placeholder="/Mail-Anhänge">
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
		const response = await fetch(OC.generateUrl(url), {
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
