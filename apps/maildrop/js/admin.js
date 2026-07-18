/**
 * MailDrop – admin settings (multiple mappings)
 */
(function () {
	const APP = 'maildrop'
	const initial = OCP.InitialState.loadState(APP, 'config')
	let mappings = Array.isArray(initial.mappings) ? initial.mappings.slice() : []
	let selectedId = mappings[0] ? mappings[0].id : null

	const el = document.getElementById('maildrop-admin')
	if (!el) {
		return
	}

	function tr(text, vars) {
		return t(APP, text, vars)
	}

	function selectedMapping() {
		return mappings.find((m) => m.id === selectedId) || null
	}

	function emptyMapping() {
		return {
			id: '',
			name: tr('New mapping'),
			fetch_enabled: false,
			imap_host: '',
			imap_port: 993,
			imap_encryption: 'ssl',
			imap_validate_cert: true,
			imap_user: '',
			imap_password: '',
			imap_password_set: false,
			imap_folder: 'INBOX',
			target_user: 'admin',
			target_path: '/Mail-Anhänge',
			mark_as_seen: true,
			delete_after_import: false,
			subject_filter: '',
			sender_filter: '',
			max_attachment_bytes: 26214400,
			create_mail_folder: false,
			save_mail_file: false,
			last_uid: 0,
			uidvalidity: 0,
			last_run: '',
			last_status: '',
			last_error: '',
		}
	}

	function render() {
		const mapping = selectedMapping() || emptyMapping()
		const passwordHint = mapping.imap_password_set
			? tr('(set – leave empty to keep)')
			: ''
		el.innerHTML = `
			<h2>MailDrop</h2>
			<p class="settings-hint">
				${escapeHtml(tr('Multiple mapping configurations: each mapping connects an IMAP mailbox (optionally filtered) to a target folder in Nextcloud.'))}
			</p>

			<div class="maildrop-layout">
				<aside class="maildrop-sidebar">
					<div class="maildrop-sidebar__header">
						<strong>${escapeHtml(tr('Mappings'))}</strong>
						<button type="button" id="mf-add" class="primary">${escapeHtml(tr('Add'))}</button>
					</div>
					<ul class="maildrop-list" id="mf-list">
						${mappings.map((m) => `
							<li class="maildrop-list__item ${m.id === selectedId ? 'is-active' : ''}" data-id="${escapeAttr(m.id)}">
								<span class="maildrop-list__name">${escapeHtml(m.name || tr('Untitled'))}</span>
								<span class="maildrop-list__meta">${m.fetch_enabled ? escapeHtml(tr('active')) : escapeHtml(tr('paused'))} · ${escapeHtml(m.target_path || '/')}</span>
							</li>
						`).join('') || `<li class="maildrop-list__empty">${escapeHtml(tr('No mappings yet'))}</li>`}
					</ul>
					<p class="maildrop-actions maildrop-actions--stack">
						<button type="button" id="mf-fetch-all">${escapeHtml(tr('Fetch all active'))}</button>
					</p>
				</aside>

				<section class="maildrop-editor">
					<form id="maildrop-form" class="maildrop-form">
						<p>
							<label for="mf-name">${escapeHtml(tr('Name'))}</label>
							<input type="text" id="mf-name" value="${escapeAttr(mapping.name)}" required>
						</p>
						<p>
							<input type="checkbox" id="mf-enabled" class="checkbox" ${mapping.fetch_enabled ? 'checked' : ''}>
							<label for="mf-enabled">${escapeHtml(tr('Enable fetch for this mapping'))}</label>
						</p>

						<h3>${escapeHtml(tr('IMAP access'))}</h3>
						<p>
							<label for="mf-host">${escapeHtml(tr('Host'))}</label>
							<input type="text" id="mf-host" value="${escapeAttr(mapping.imap_host)}" placeholder="mail">
						</p>
						<p>
							<label for="mf-port">${escapeHtml(tr('Port'))}</label>
							<input type="number" id="mf-port" value="${escapeAttr(String(mapping.imap_port))}" min="1" max="65535">
						</p>
						<p>
							<label for="mf-enc">${escapeHtml(tr('Encryption'))}</label>
							<select id="mf-enc">
								<option value="none" ${mapping.imap_encryption === 'none' ? 'selected' : ''}>${escapeHtml(tr('None'))}</option>
								<option value="tls" ${mapping.imap_encryption === 'tls' ? 'selected' : ''}>STARTTLS</option>
								<option value="ssl" ${mapping.imap_encryption === 'ssl' ? 'selected' : ''}>SSL/TLS</option>
							</select>
						</p>
						<p>
							<input type="checkbox" id="mf-validate-cert" class="checkbox" ${mapping.imap_validate_cert !== false ? 'checked' : ''}>
							<label for="mf-validate-cert">${escapeHtml(tr('Verify TLS certificate (recommended)'))}</label>
						</p>
						<p>
							<label for="mf-user">${escapeHtml(tr('IMAP user'))}</label>
							<input type="text" id="mf-user" value="${escapeAttr(mapping.imap_user)}" autocomplete="off">
						</p>
						<p>
							<label for="mf-pass">${escapeHtml(tr('Password'))} ${escapeHtml(passwordHint)}</label>
							<input type="password" id="mf-pass" value="" autocomplete="new-password" placeholder="${mapping.imap_password_set ? '••••••••' : ''}">
						</p>
						<p>
							<label for="mf-folder">${escapeHtml(tr('IMAP folder'))}</label>
							<input type="text" id="mf-folder" value="${escapeAttr(mapping.imap_folder)}" placeholder="INBOX">
						</p>

						<h3>${escapeHtml(tr('Target in Nextcloud'))}</h3>
						<p class="maildrop-user-picker">
							<label for="mf-target-user-input">${escapeHtml(tr('Target user'))}</label>
							<input type="hidden" id="mf-target-user" value="${escapeAttr(mapping.target_user)}" required>
							<input
								type="text"
								id="mf-target-user-input"
								class="maildrop-user-picker__input"
								value="${escapeAttr(mapping.target_user)}"
								placeholder="${escapeAttr(tr('Enter name or user ID…'))}"
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
							<label for="mf-target-path">${escapeHtml(tr('Target folder'))}</label>
							<span class="maildrop-path-row">
								<input type="text" id="mf-target-path" value="${escapeAttr(mapping.target_path)}" placeholder="/Mail-Anhänge">
								<button type="button" id="mf-pick-path" title="${escapeAttr(tr('Browse folders of the selected target user'))}">${escapeHtml(tr('Choose folder…'))}</button>
							</span>
							<em class="maildrop-hint">${escapeHtml(tr('Default: store attachments flat here (prefix date_uid…). Optional per-mail subfolder / save .eml (see below). The folder dialog browses the selected target user.'))}</em>
						</p>

						<h3>${escapeHtml(tr('Filters & behaviour'))}</h3>
						<p>
							<label for="mf-subject">${escapeHtml(tr('Subject contains (optional)'))}</label>
							<input type="text" id="mf-subject" value="${escapeAttr(mapping.subject_filter || '')}">
						</p>
						<p>
							<label for="mf-sender">${escapeHtml(tr('Sender contains (optional)'))}</label>
							<input type="text" id="mf-sender" value="${escapeAttr(mapping.sender_filter || '')}">
						</p>
						<p>
							<label for="mf-max-bytes">${escapeHtml(tr('Max. attachment size in bytes (0 = unlimited)'))}</label>
							<input type="number" id="mf-max-bytes" value="${escapeAttr(String(mapping.max_attachment_bytes ?? 26214400))}" min="0" step="1">
						</p>
						<p>
							<input type="checkbox" id="mf-mail-folder" class="checkbox" ${mapping.create_mail_folder ? 'checked' : ''}>
							<label for="mf-mail-folder">${escapeHtml(tr('Create a subfolder per email'))}</label>
						</p>
						<p>
							<input type="checkbox" id="mf-save-mail" class="checkbox" ${mapping.save_mail_file ? 'checked' : ''}>
							<label for="mf-save-mail">${escapeHtml(tr('Save email file (.eml) next to attachments'))}</label>
						</p>
						<p>
							<input type="checkbox" id="mf-seen" class="checkbox" ${mapping.mark_as_seen ? 'checked' : ''}>
							<label for="mf-seen">${escapeHtml(tr('Mark messages as read after import'))}</label>
						</p>
						<p>
							<input type="checkbox" id="mf-delete" class="checkbox" ${mapping.delete_after_import ? 'checked' : ''}>
							<label for="mf-delete">${escapeHtml(tr('Delete messages after import'))}</label>
						</p>

						<p class="maildrop-actions">
							<button type="submit" class="primary">${escapeHtml(tr('Save mapping'))}</button>
							<button type="button" id="mf-test">${escapeHtml(tr('Test connection'))}</button>
							<button type="button" id="mf-fetch">${escapeHtml(tr('Fetch this mapping'))}</button>
							<button type="button" id="mf-reset-cursor">${escapeHtml(tr('Reset cursor'))}</button>
							<button type="button" id="mf-delete-mapping" ${mappings.length <= 1 ? 'disabled' : ''}>${escapeHtml(tr('Delete'))}</button>
						</p>
					</form>

					<div id="maildrop-status" class="maildrop-status" aria-live="polite"></div>

					<div class="maildrop-meta">
						<p><strong>${escapeHtml(tr('Last run:'))}</strong> <span id="mf-last-run">${escapeHtml(mapping.last_run || '–')}</span></p>
						<p><strong>${escapeHtml(tr('Status:'))}</strong> <span id="mf-last-status">${escapeHtml(mapping.last_status || '–')}</span></p>
						<p><strong>${escapeHtml(tr('Message:'))}</strong> <span id="mf-last-error">${escapeHtml(mapping.last_error || '–')}</span></p>
						<p><strong>${escapeHtml(tr('Cursor:'))}</strong> UID ${escapeHtml(String(mapping.last_uid ?? 0))} · UIDVALIDITY ${escapeHtml(String(mapping.uidvalidity ?? 0))}</p>
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
			setStatus(tr('Creating mapping…'), 'info')
			try {
				const created = await api('POST', '/apps/maildrop/api/mappings', emptyMapping())
				mappings.push(created)
				selectedId = created.id
				render()
				setStatus(tr('New mapping created – please configure and save.'), 'ok')
			} catch (error) {
				setStatus(error.message || tr('Could not create mapping.'), 'error')
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
			setStatus(tr('Saving mapping…'), 'info')
			try {
				const saved = await api('PUT', '/apps/maildrop/api/mappings/' + encodeURIComponent(selectedId), collectPayload())
				mappings = mappings.map((m) => (m.id === saved.id ? saved : m))
				render()
				setStatus(tr('Mapping saved.'), 'ok')
			} catch (error) {
				setStatus(error.message || tr('Could not save.'), 'error')
			}
		})

		document.getElementById('mf-test').addEventListener('click', async () => {
			if (!selectedId) {
				return
			}
			setStatus(tr('Testing connection…'), 'info')
			try {
				await api('PUT', '/apps/maildrop/api/mappings/' + encodeURIComponent(selectedId), collectPayload())
				const result = await api('POST', '/apps/maildrop/api/test', { id: selectedId })
				setStatus(result.message, result.success ? 'ok' : 'error')
			} catch (error) {
				setStatus(error.message || tr('Test failed.'), 'error')
			}
		})

		document.getElementById('mf-fetch').addEventListener('click', async () => {
			if (!selectedId) {
				return
			}
			setStatus(tr('Fetching mapping…'), 'info')
			try {
				await api('PUT', '/apps/maildrop/api/mappings/' + encodeURIComponent(selectedId), collectPayload())
				const result = await api('POST', '/apps/maildrop/api/fetch', { id: selectedId })
				await reload()
				setStatus(result.message, result.success ? 'ok' : 'error')
			} catch (error) {
				setStatus(error.message || tr('Fetch failed.'), 'error')
			}
		})

		document.getElementById('mf-fetch-all').addEventListener('click', async () => {
			setStatus(tr('Fetching all active mappings…'), 'info')
			try {
				const result = await api('POST', '/apps/maildrop/api/fetch', {})
				await reload()
				setStatus(result.message, result.success ? 'ok' : 'error')
			} catch (error) {
				setStatus(error.message || tr('Fetch failed.'), 'error')
			}
		})

		document.getElementById('mf-reset-cursor').addEventListener('click', async () => {
			if (!selectedId) {
				return
			}
			if (!window.confirm(tr('Reset IMAP cursor (last_uid / UIDVALIDITY)? Already imported mails may be checked again.'))) {
				return
			}
			setStatus(tr('Resetting cursor…'), 'info')
			try {
				const saved = await api(
					'POST',
					'/apps/maildrop/api/mappings/' + encodeURIComponent(selectedId) + '/reset-cursor',
					{},
				)
				mappings = mappings.map((m) => (m.id === saved.id ? saved : m))
				render()
				setStatus(tr('Cursor reset.'), 'ok')
			} catch (error) {
				setStatus(error.message || tr('Could not reset cursor.'), 'error')
			}
		})

		document.getElementById('mf-delete-mapping').addEventListener('click', async () => {
			if (!selectedId || mappings.length <= 1) {
				return
			}
			if (!window.confirm(tr('Really delete this mapping?'))) {
				return
			}
			setStatus(tr('Deleting mapping…'), 'info')
			try {
				const result = await api('DELETE', '/apps/maildrop/api/mappings/' + encodeURIComponent(selectedId))
				mappings = result.mappings || []
				selectedId = mappings[0] ? mappings[0].id : null
				render()
				setStatus(tr('Mapping deleted.'), 'ok')
			} catch (error) {
				setStatus(error.message || tr('Could not delete.'), 'error')
			}
		})

		function setStatus(message, type) {
			statusEl.textContent = message
			statusEl.className = 'maildrop-status maildrop-status--' + type
		}
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

		// Attach menu to body – otherwise the settings layout clips the list
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
				menu.innerHTML = '<li class="maildrop-user-picker__empty">' + escapeHtml(tr('No matches')) + '</li>'
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
				? tr('{filtered} of {total}', { filtered: String(filtered.length), total: String(allUsers.length) })
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
				hint.textContent = tr('Loading users…')
				menu.innerHTML = '<li class="maildrop-user-picker__empty">' + escapeHtml(tr('Loading users…')) + '</li>'
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
					// Cancel search: keep previous target user
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
				// Allow free-text ID
				hidden.value = typed
				hint.textContent = allUsers.some((u) => u.id === typed)
					? ''
					: tr('Unknown user ID – saving is possible, fetch will verify existence.')
			}, 120)
		})

		hint.textContent = tr('Loading users…')
		api('GET', '/apps/maildrop/api/users?search=&limit=200')
			.then((data) => {
				allUsers = Array.isArray(data.users) ? data.users : []
				syncLabelFromHidden()
				hint.textContent = allUsers.length ? '' : tr('No users found')
			})
			.catch((error) => {
				hint.textContent = tr('Could not load user list: {error}', { error: error.message || tr('Error') })
			})
	}

	/**
	 * Folder dialog for the selected target_user (via GET /api/folders).
	 * Unlike OC.dialogs.filepicker, this is not limited to the logged-in admin.
	 */
	function pickTargetFolder(setStatus) {
		const pathInput = document.getElementById('mf-target-path')
		const targetUser = document.getElementById('mf-target-user').value.trim()
		if (!targetUser) {
			setStatus(tr('Please select a target user first.'), 'error')
			return
		}

		let startPath = (pathInput.value || '/').trim() || '/'
		if (!startPath.startsWith('/')) {
			startPath = '/' + startPath
		}

		openFolderPicker({
			userId: targetUser,
			startPath,
			onSelect: (path) => {
				pathInput.value = path || '/'
			},
			onError: (message) => {
				setStatus(message, 'error')
			},
		})
	}

	function openFolderPicker({ userId, startPath, onSelect, onError }) {
		const existing = document.getElementById('maildrop-folder-picker')
		if (existing) {
			existing.remove()
		}

		const overlay = document.createElement('div')
		overlay.id = 'maildrop-folder-picker'
		overlay.className = 'maildrop-folder-picker'
		overlay.setAttribute('role', 'dialog')
		overlay.setAttribute('aria-modal', 'true')
		overlay.setAttribute('aria-labelledby', 'maildrop-folder-picker-title')
		overlay.innerHTML = `
			<div class="maildrop-folder-picker__dialog">
				<header class="maildrop-folder-picker__header">
					<h3 id="maildrop-folder-picker-title">${escapeHtml(tr('Choose target folder'))}</h3>
					<p class="maildrop-folder-picker__user">${escapeHtml(tr('User: {user}', { user: userId }))}</p>
				</header>
				<nav class="maildrop-folder-picker__crumb" id="mf-fp-crumb" aria-label="${escapeAttr(tr('Current path'))}"></nav>
				<div class="maildrop-folder-picker__list" id="mf-fp-list" role="listbox" aria-label="${escapeAttr(tr('Folders'))}">
					<p class="maildrop-folder-picker__empty">${escapeHtml(tr('Loading folders…'))}</p>
				</div>
				<footer class="maildrop-folder-picker__footer">
					<button type="button" id="mf-fp-cancel">${escapeHtml(tr('Cancel'))}</button>
					<button type="button" class="primary" id="mf-fp-select">${escapeHtml(tr('Select this folder'))}</button>
				</footer>
			</div>
		`
		document.body.appendChild(overlay)

		const crumbEl = overlay.querySelector('#mf-fp-crumb')
		const listEl = overlay.querySelector('#mf-fp-list')
		const selectBtn = overlay.querySelector('#mf-fp-select')
		const cancelBtn = overlay.querySelector('#mf-fp-cancel')
		let currentPath = startPath || '/'
		let closed = false

		const close = () => {
			if (closed) {
				return
			}
			closed = true
			document.removeEventListener('keydown', onKeyDown, true)
			overlay.remove()
		}

		const onKeyDown = (event) => {
			if (event.key === 'Escape') {
				event.preventDefault()
				close()
			}
		}
		document.addEventListener('keydown', onKeyDown, true)

		cancelBtn.addEventListener('click', close)
		overlay.addEventListener('click', (event) => {
			if (event.target === overlay) {
				close()
			}
		})
		selectBtn.addEventListener('click', () => {
			onSelect(currentPath)
			close()
		})

		const renderCrumb = (path) => {
			const parts = path === '/' ? [] : path.split('/').filter(Boolean)
			let built = ''
			const items = [{ label: tr('Home'), path: '/' }]
			parts.forEach((part) => {
				built += '/' + part
				items.push({ label: part, path: built })
			})
			crumbEl.innerHTML = items.map((item, index) => {
				const isLast = index === items.length - 1
				if (isLast) {
					return '<span class="maildrop-folder-picker__crumb-current">' + escapeHtml(item.label) + '</span>'
				}
				return '<button type="button" class="maildrop-folder-picker__crumb-link" data-path="'
					+ escapeAttr(item.path) + '">' + escapeHtml(item.label) + '</button>'
					+ '<span class="maildrop-folder-picker__crumb-sep" aria-hidden="true">/</span>'
			}).join('')
			crumbEl.querySelectorAll('.maildrop-folder-picker__crumb-link').forEach((btn) => {
				btn.addEventListener('click', () => {
					loadPath(btn.getAttribute('data-path') || '/')
				})
			})
		}

		const renderFolders = (folders, parent) => {
			const rows = []
			if (parent) {
				rows.push(
					'<button type="button" class="maildrop-folder-picker__item maildrop-folder-picker__item--up" data-path="'
					+ escapeAttr(parent) + '" role="option">'
					+ '<span class="maildrop-folder-picker__icon" aria-hidden="true">↑</span>'
					+ '<span>' + escapeHtml(tr('Parent folder')) + '</span>'
					+ '</button>',
				)
			}
			if (!folders.length && !parent) {
				listEl.innerHTML = '<p class="maildrop-folder-picker__empty">'
					+ escapeHtml(tr('No subfolders in this directory.')) + '</p>'
				return
			}
			if (!folders.length) {
				rows.push('<p class="maildrop-folder-picker__empty">'
					+ escapeHtml(tr('No subfolders in this directory.')) + '</p>')
			} else {
				folders.forEach((folder) => {
					rows.push(
						'<button type="button" class="maildrop-folder-picker__item" data-path="'
						+ escapeAttr(folder.path) + '" role="option">'
						+ '<span class="maildrop-folder-picker__icon" aria-hidden="true"></span>'
						+ '<span>' + escapeHtml(folder.name) + '</span>'
						+ '</button>',
					)
				})
			}
			listEl.innerHTML = rows.join('')
			listEl.querySelectorAll('.maildrop-folder-picker__item').forEach((item) => {
				item.addEventListener('click', () => {
					loadPath(item.getAttribute('data-path') || '/')
				})
			})
		}

		const loadPath = async (path, allowFallback) => {
			const requested = path || '/'
			listEl.innerHTML = '<p class="maildrop-folder-picker__empty">'
				+ escapeHtml(tr('Loading folders…')) + '</p>'
			selectBtn.disabled = true
			try {
				const data = await api(
					'GET',
					'/apps/maildrop/api/folders?user=' + encodeURIComponent(userId)
					+ '&path=' + encodeURIComponent(requested),
				)
				currentPath = data.path || '/'
				renderCrumb(currentPath)
				renderFolders(Array.isArray(data.folders) ? data.folders : [], data.parent || null)
				selectBtn.disabled = false
			} catch (error) {
				if (allowFallback !== false && requested !== '/') {
					await loadPath('/', false)
					return
				}
				close()
				onError(error.message || tr('Could not load folders.'))
			}
		}

		loadPath(startPath, true)
		selectBtn.focus()
	}

	function collectPayload() {
		return {
			id: selectedId,
			name: document.getElementById('mf-name').value.trim() || tr('Mapping'),
			fetch_enabled: document.getElementById('mf-enabled').checked,
			imap_host: document.getElementById('mf-host').value.trim(),
			imap_port: Number(document.getElementById('mf-port').value),
			imap_encryption: document.getElementById('mf-enc').value,
			imap_validate_cert: document.getElementById('mf-validate-cert').checked,
			imap_user: document.getElementById('mf-user').value.trim(),
			imap_password: document.getElementById('mf-pass').value,
			imap_folder: document.getElementById('mf-folder').value.trim() || 'INBOX',
			target_user: document.getElementById('mf-target-user').value.trim(),
			target_path: document.getElementById('mf-target-path').value.trim(),
			mark_as_seen: document.getElementById('mf-seen').checked,
			delete_after_import: document.getElementById('mf-delete').checked,
			subject_filter: document.getElementById('mf-subject').value.trim(),
			sender_filter: document.getElementById('mf-sender').value.trim(),
			max_attachment_bytes: Number(document.getElementById('mf-max-bytes').value),
			create_mail_folder: document.getElementById('mf-mail-folder').checked,
			save_mail_file: document.getElementById('mf-save-mail').checked,
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
