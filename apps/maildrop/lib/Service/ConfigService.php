<?php

declare(strict_types=1);

namespace OCA\MailDrop\Service;

use OCP\IConfig;
use OCP\Security\ICrypto;

class ConfigService {
	public function __construct(
		private IConfig $config,
		private ICrypto $crypto,
	) {
	}

	public function getAll(): array {
		return [
			// Wichtig: NICHT den Key "enabled" nutzen – der steuert bei Nextcloud die App selbst.
			'fetch_enabled' => $this->getBool('fetch_enabled', false),
			'imap_host' => $this->get('imap_host', 'mail'),
			'imap_port' => (int)$this->get('imap_port', '3143'),
			'imap_encryption' => $this->get('imap_encryption', 'none'),
			'imap_user' => $this->get('imap_user', 'maildrop'),
			'imap_password' => $this->getPassword(),
			'imap_password_set' => $this->get('imap_password', '') !== '',
			'imap_folder' => $this->get('imap_folder', 'INBOX'),
			'target_user' => $this->get('target_user', 'admin'),
			'target_path' => $this->get('target_path', '/Mail-Anhänge'),
			'mark_as_seen' => $this->getBool('mark_as_seen', true),
			'delete_after_import' => $this->getBool('delete_after_import', false),
			'subject_filter' => $this->get('subject_filter', ''),
			'sender_filter' => $this->get('sender_filter', ''),
			'last_uid' => (int)$this->get('last_uid', '0'),
			'last_run' => $this->get('last_run', ''),
			'last_status' => $this->get('last_status', ''),
			'last_error' => $this->get('last_error', ''),
		];
	}

	/**
	 * @param array<string, mixed> $data
	 */
	public function save(array $data): array {
		$allowed = [
			'fetch_enabled',
			'imap_host',
			'imap_port',
			'imap_encryption',
			'imap_user',
			'imap_password',
			'imap_folder',
			'target_user',
			'target_path',
			'mark_as_seen',
			'delete_after_import',
			'subject_filter',
			'sender_filter',
		];

		foreach ($allowed as $key) {
			if (!array_key_exists($key, $data)) {
				continue;
			}

			$value = $data[$key];
			if (in_array($key, ['fetch_enabled', 'mark_as_seen', 'delete_after_import'], true)) {
				$this->set($key, $value ? '1' : '0');
				continue;
			}

			if ($key === 'imap_password') {
				if (is_string($value) && $value !== '') {
					$this->setPassword($value);
				}
				continue;
			}

			if ($key === 'imap_port') {
				$this->set($key, (string)(int)$value);
				continue;
			}

			if ($key === 'target_path') {
				$path = '/' . trim((string)$value, '/');
				$this->set($key, $path === '/' ? '/' : $path);
				continue;
			}

			$this->set($key, (string)$value);
		}

		return $this->getAll();
	}

	public function get(string $key, string $default = ''): string {
		return $this->config->getAppValue('maildrop', $key, $default);
	}

	public function set(string $key, string $value): void {
		$this->config->setAppValue('maildrop', $key, $value);
	}

	public function getBool(string $key, bool $default = false): bool {
		$value = $this->config->getAppValue('maildrop', $key, $default ? '1' : '0');
		return $value === '1' || $value === 'true';
	}

	public function getPassword(): string {
		$encrypted = $this->get('imap_password', '');
		if ($encrypted === '') {
			return '';
		}

		try {
			return $this->crypto->decrypt($encrypted);
		} catch (\Throwable) {
			return '';
		}
	}

	public function setPassword(string $password): void {
		$this->set('imap_password', $this->crypto->encrypt($password));
	}

	public function setLastRunStatus(string $status, string $error = ''): void {
		$this->set('last_run', (new \DateTimeImmutable('now'))->format(\DateTimeInterface::ATOM));
		$this->set('last_status', $status);
		$this->set('last_error', $error);
	}

	public function getLastUid(): int {
		return (int)$this->get('last_uid', '0');
	}

	public function setLastUid(int $uid): void {
		$this->set('last_uid', (string)$uid);
	}
}
