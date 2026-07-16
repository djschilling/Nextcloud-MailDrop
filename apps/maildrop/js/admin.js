/**
 * MailDrop – Admin-Einstellungen
 */
(function () {
	const state = OCP.InitialState.loadState('maildrop', 'config')

	const el = document.getElementById('maildrop-admin')
	if (!el) {
		return
	}

	el.innerHTML = `
		<h2>MailDrop</h2>
		<p class="settings-hint">
			E-Mails per IMAP abrufen und Anhänge automatisch in Nextcloud speichern.
		</p>

		<form id="maildrop-form" class="maildrop-form">
			<p>
				<input type="checkbox" id="mf-enabled" class="checkbox" ${state.fetch_enabled ? 'checked' : ''}>
				<label for="mf-enabled">Abruf aktivieren</label>
			</p>

			<h3>IMAP-Zugang</h3>
			<p>
				<label for="mf-host">Host</label>
				<input type="text" id="mf-host" value="${escapeAttr(state.imap_host)}" placeholder="mail">
			</p>
			<p>
				<label for="mf-port">Port</label>
				<input type="number" id="mf-port" value="${escapeAttr(String(state.imap_port))}" min="1" max="65535">
			</p>
			<p>
				<label for="mf-enc">Verschlüsselung</label>
				<select id="mf-enc">
					<option value="none" ${state.imap_encryption === 'none' ? 'selected' : ''}>Keine</option>
					<option value="tls" ${state.imap_encryption === 'tls' ? 'selected' : ''}>STARTTLS</option>
					<option value="ssl" ${state.imap_encryption === 'ssl' ? 'selected' : ''}>SSL/TLS</option>
				</select>
			</p>
			<p>
				<label for="mf-user">Benutzer</label>
				<input type="text" id="mf-user" value="${escapeAttr(state.imap_user)}" autocomplete="off">
			</p>
			<p>
				<label for="mf-pass">Passwort ${state.imap_password_set ? '(gesetzt – leer lassen zum Behalten)' : ''}</label>
				<input type="password" id="mf-pass" value="" autocomplete="new-password" placeholder="${state.imap_password_set ? '••••••••' : ''}">
			</p>
			<p>
				<label for="mf-folder">IMAP-Ordner</label>
				<input type="text" id="mf-folder" value="${escapeAttr(state.imap_folder)}" placeholder="INBOX">
			</p>

			<h3>Ziel in Nextcloud</h3>
			<p>
				<label for="mf-target-user">Benutzer</label>
				<input type="text" id="mf-target-user" value="${escapeAttr(state.target_user)}" placeholder="admin">
			</p>
			<p>
				<label for="mf-target-path">Zielordner</label>
				<input type="text" id="mf-target-path" value="${escapeAttr(state.target_path)}" placeholder="/Mail-Anhänge">
			</p>

			<h3>Filter &amp; Verhalten</h3>
			<p>
				<label for="mf-subject">Betreff enthält (optional)</label>
				<input type="text" id="mf-subject" value="${escapeAttr(state.subject_filter)}">
			</p>
			<p>
				<label for="mf-sender">Absender enthält (optional)</label>
				<input type="text" id="mf-sender" value="${escapeAttr(state.sender_filter)}">
			</p>
			<p>
				<input type="checkbox" id="mf-seen" class="checkbox" ${state.mark_as_seen ? 'checked' : ''}>
				<label for="mf-seen">Nachrichten nach Import als gelesen markieren</label>
			</p>
			<p>
				<input type="checkbox" id="mf-delete" class="checkbox" ${state.delete_after_import ? 'checked' : ''}>
				<label for="mf-delete">Nachrichten nach Import löschen</label>
			</p>

			<p class="maildrop-actions">
				<button type="submit" class="primary">Speichern</button>
				<button type="button" id="mf-test">Verbindung testen</button>
				<button type="button" id="mf-fetch">Jetzt abrufen</button>
			</p>
		</form>

		<div id="maildrop-status" class="maildrop-status" aria-live="polite"></div>

		<div class="maildrop-meta">
			<p><strong>Letzter Lauf:</strong> <span id="mf-last-run">${escapeHtml(state.last_run || '–')}</span></p>
			<p><strong>Status:</strong> <span id="mf-last-status">${escapeHtml(state.last_status || '–')}</span></p>
			<p><strong>Meldung:</strong> <span id="mf-last-error">${escapeHtml(state.last_error || '–')}</span></p>
		</div>
	`

	const form = document.getElementById('maildrop-form')
	const statusEl = document.getElementById('maildrop-status')

	form.addEventListener('submit', async (event) => {
		event.preventDefault()
		setStatus('Speichere…', 'info')
		try {
			const result = await api('PUT', '/apps/maildrop/api/config', collectPayload())
			updateMeta(result)
			setStatus('Einstellungen gespeichert.', 'ok')
		} catch (error) {
			setStatus(error.message || 'Speichern fehlgeschlagen.', 'error')
		}
	})

	document.getElementById('mf-test').addEventListener('click', async () => {
		setStatus('Teste Verbindung…', 'info')
		try {
			await api('PUT', '/apps/maildrop/api/config', collectPayload())
			const result = await api('POST', '/apps/maildrop/api/test')
			setStatus(result.message, result.success ? 'ok' : 'error')
		} catch (error) {
			setStatus(error.message || 'Test fehlgeschlagen.', 'error')
		}
	})

	document.getElementById('mf-fetch').addEventListener('click', async () => {
		setStatus('Rufe Mails ab…', 'info')
		try {
			await api('PUT', '/apps/maildrop/api/config', collectPayload())
			const result = await api('POST', '/apps/maildrop/api/fetch')
			updateMeta({
				last_run: new Date().toISOString(),
				last_status: result.success ? 'ok' : 'error',
				last_error: result.message,
			})
			setStatus(result.message, result.success ? 'ok' : 'error')
		} catch (error) {
			setStatus(error.message || 'Abruf fehlgeschlagen.', 'error')
		}
	})

	function collectPayload() {
		return {
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

	function updateMeta(data) {
		if (data.last_run !== undefined) {
			document.getElementById('mf-last-run').textContent = data.last_run || '–'
		}
		if (data.last_status !== undefined) {
			document.getElementById('mf-last-status').textContent = data.last_status || '–'
		}
		if (data.last_error !== undefined) {
			document.getElementById('mf-last-error').textContent = data.last_error || '–'
		}
	}

	function setStatus(message, type) {
		statusEl.textContent = message
		statusEl.className = 'maildrop-status maildrop-status--' + type
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
})()
