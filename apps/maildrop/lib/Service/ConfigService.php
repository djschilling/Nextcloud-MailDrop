<?php

declare(strict_types=1);

namespace OCA\MailDrop\Service;

use OCA\MailDrop\AppInfo\Application;
use OCP\IConfig;
use OCP\IL10N;
use OCP\Lock\ILockingProvider;
use OCP\Lock\LockedException;
use OCP\Security\ICrypto;

class ConfigService {
	private const MAPPINGS_KEY = 'mappings';
	private const LOCK_KEY = 'maildrop/mappings';

	/** Nextcloud-managed keys that must survive `purgeStoredConfig()`. */
	public const PRESERVED_APP_KEYS = ['enabled', 'installed_version', 'types'];

	public function __construct(
		private IConfig $config,
		private ICrypto $crypto,
		private ILockingProvider $lockingProvider,
		private IL10N $l10n,
	) {
	}

	/**
	 * @return array{mappings: list<array<string, mixed>>}
	 */
	public function getAll(): array {
		return [
			'mappings' => $this->getMappingsForClient(),
		];
	}

	/**
	 * @return list<array<string, mixed>>
	 */
	public function getMappings(): array {
		return $this->withLock(function (): array {
			return $this->readMappingsUnlocked();
		});
	}

	/**
	 * @return list<array<string, mixed>>
	 */
	public function getMappingsForClient(): array {
		return array_map(fn (array $m) => $this->forClient($m), $this->getMappings());
	}

	/**
	 * @return array<string, mixed>|null
	 */
	public function getMapping(string $id): ?array {
		foreach ($this->getMappings() as $mapping) {
			if ($mapping['id'] === $id) {
				return $mapping;
			}
		}
		return null;
	}

	/**
	 * @param list<array<string, mixed>> $mappings
	 * @return list<array<string, mixed>>
	 */
	public function saveMappings(array $mappings): array {
		return $this->withLock(function () use ($mappings): array {
			$existingById = [];
			foreach ($this->readMappingsUnlocked() as $existing) {
				$existingById[$existing['id']] = $existing;
			}

			$normalized = [];
			foreach ($mappings as $item) {
				if (!is_array($item)) {
					continue;
				}
				$id = (string)($item['id'] ?? '');
				$previous = $id !== '' && isset($existingById[$id]) ? $existingById[$id] : null;
				$normalized[] = $this->normalizeMapping($item, $previous);
			}

			$this->persistMappingsUnlocked($normalized);
			return array_map(fn (array $m) => $this->forClient($m), $this->readMappingsUnlocked());
		});
	}

	/**
	 * @param array<string, mixed> $data
	 * @return array<string, mixed>
	 */
	public function saveMapping(array $data): array {
		return $this->withLock(function () use ($data): array {
			$mappings = $this->readMappingsUnlocked();
			$id = trim((string)($data['id'] ?? ''));

			foreach ($mappings as $index => $existing) {
				if ($id !== '' && $existing['id'] === $id) {
					$mappings[$index] = $this->normalizeMapping($data, $existing);
					$this->persistMappingsUnlocked($mappings);
					return $this->forClient($mappings[$index]);
				}
			}

			$created = $this->normalizeMapping($data, null);
			$mappings[] = $created;
			$this->persistMappingsUnlocked($mappings);
			return $this->forClient($created);
		});
	}

	public function deleteMapping(string $id): void {
		$this->withLock(function () use ($id): void {
			$mappings = array_values(array_filter(
				$this->readMappingsUnlocked(),
				static fn (array $m) => $m['id'] !== $id,
			));
			$this->persistMappingsUnlocked($mappings);
		});
	}

	/**
	 * Runtime-Felder patchen (unter Lock, frisch gelesen – kein Lost Update gegen Admin-Saves).
	 *
	 * @param array<string, mixed> $updates
	 */
	public function updateMappingRuntimeState(string $id, array $updates): void {
		$this->withLock(function () use ($id, $updates): void {
			$mappings = $this->readMappingsUnlocked();
			foreach ($mappings as $index => $mapping) {
				if ($mapping['id'] !== $id) {
					continue;
				}
				foreach (['last_uid', 'uidvalidity', 'last_run', 'last_status', 'last_error'] as $key) {
					if (array_key_exists($key, $updates)) {
						$mappings[$index][$key] = $updates[$key];
					}
				}
				$this->persistMappingsUnlocked($mappings);
				return;
			}
		});
	}

	public function setMappingLastRunStatus(string $id, string $status, string $error = ''): void {
		$this->updateMappingRuntimeState($id, [
			'last_run' => (new \DateTimeImmutable('now'))->format(\DateTimeInterface::ATOM),
			'last_status' => $status,
			'last_error' => $error,
		]);
	}

	/**
	 * Cursor zurücksetzen (last_uid + uidvalidity), damit Mails erneut geprüft werden.
	 *
	 * @return array<string, mixed>|null
	 */
	public function resetMappingCursor(string $id): ?array {
		return $this->withLock(function () use ($id): ?array {
			$mappings = $this->readMappingsUnlocked();
			foreach ($mappings as $index => $mapping) {
				if ($mapping['id'] !== $id) {
					continue;
				}
				$mappings[$index]['last_uid'] = 0;
				$mappings[$index]['uidvalidity'] = 0;
				$mappings[$index]['last_status'] = 'reset';
				$mappings[$index]['last_error'] = $this->l10n->t('Cursor reset – next fetch will start from UID 1.');
				$mappings[$index]['last_run'] = (new \DateTimeImmutable('now'))->format(\DateTimeInterface::ATOM);
				$this->persistMappingsUnlocked($mappings);
				return $this->forClient($mappings[$index]);
			}
			return null;
		});
	}

	public function getPasswordFromMapping(array $mapping): string {
		$encrypted = (string)($mapping['imap_password'] ?? '');
		if ($encrypted === '') {
			return '';
		}
		try {
			return $this->crypto->decrypt($encrypted);
		} catch (\Throwable) {
			return '';
		}
	}

	public function get(string $key, string $default = ''): string {
		return $this->config->getAppValue(Application::APP_ID, $key, $default);
	}

	public function set(string $key, string $value): void {
		$this->config->setAppValue(Application::APP_ID, $key, $value);
	}

	/**
	 * App-config keys that a purge would delete (everything except Nextcloud-managed keys).
	 *
	 * @param list<string> $existingKeys
	 * @return list<string>
	 */
	public static function keysToPurge(array $existingKeys): array {
		$deleted = [];
		foreach ($existingKeys as $key) {
			if (!in_array($key, self::PRESERVED_APP_KEYS, true)) {
				$deleted[] = $key;
			}
		}
		return $deleted;
	}

	/**
	 * @return list<string>
	 */
	public function listPurgeableKeys(): array {
		return self::keysToPurge($this->config->getAppKeys(Application::APP_ID));
	}

	/**
	 * Delete mappings. Does not remove imported files and does not touch
	 * Nextcloud's `enabled` / `installed_version` / `types` keys.
	 *
	 * @return list<string> deleted keys
	 */
	public function purgeStoredConfig(): array {
		$deleted = self::keysToPurge($this->config->getAppKeys(Application::APP_ID));
		foreach ($deleted as $key) {
			$this->config->deleteAppValue(Application::APP_ID, $key);
		}
		return $deleted;
	}

	/**
	 * @template T
	 * @param callable(): T $callback
	 * @return T
	 */
	private function withLock(callable $callback): mixed {
		$attempts = 0;
		while (true) {
			try {
				$this->lockingProvider->acquireLock(self::LOCK_KEY, ILockingProvider::LOCK_EXCLUSIVE);
				break;
			} catch (LockedException $e) {
				$attempts++;
				if ($attempts >= 25) {
					throw new \RuntimeException('MailDrop-Config ist gesperrt. Bitte erneut versuchen.', 0, $e);
				}
				usleep(100000);
			}
		}

		try {
			return $callback();
		} finally {
			$this->lockingProvider->releaseLock(self::LOCK_KEY, ILockingProvider::LOCK_EXCLUSIVE);
		}
	}

	/**
	 * @return list<array<string, mixed>>
	 */
	private function readMappingsUnlocked(): array {
		$this->ensureDefaultMappingUnlocked();
		$raw = $this->get(self::MAPPINGS_KEY, '[]');
		$decoded = json_decode($raw, true);
		if (!is_array($decoded)) {
			return [];
		}

		$mappings = [];
		foreach ($decoded as $item) {
			if (!is_array($item)) {
				continue;
			}
			$mappings[] = $this->hydrateMapping($item);
		}
		return $mappings;
	}

	/**
	 * @param list<array<string, mixed>> $mappings
	 */
	private function persistMappingsUnlocked(array $mappings): void {
		$encoded = json_encode(array_values($mappings), JSON_UNESCAPED_UNICODE);
		if ($encoded === false) {
			throw new \RuntimeException($this->l10n->t('Could not serialize mappings.'));
		}
		$this->set(self::MAPPINGS_KEY, $encoded);
	}

	/**
	 * @param array<string, mixed> $item
	 * @return array<string, mixed>
	 */
	private function hydrateMapping(array $item): array {
		return [
			'id' => (string)($item['id'] ?? $this->newId()),
			'name' => (string)($item['name'] ?? 'Mapping'),
			'fetch_enabled' => $this->toBool($item['fetch_enabled'] ?? false),
			'imap_host' => (string)($item['imap_host'] ?? ''),
			'imap_port' => (int)($item['imap_port'] ?? 993),
			'imap_encryption' => (string)($item['imap_encryption'] ?? 'ssl'),
			'imap_validate_cert' => $this->toBool($item['imap_validate_cert'] ?? true),
			'imap_user' => (string)($item['imap_user'] ?? ''),
			'imap_password' => (string)($item['imap_password'] ?? ''),
			'imap_folder' => ((string)($item['imap_folder'] ?? 'INBOX')) ?: 'INBOX',
			'target_user' => (string)($item['target_user'] ?? 'admin'),
			'target_path' => (string)($item['target_path'] ?? '/Mail-Anhänge'),
			'mark_as_seen' => $this->toBool($item['mark_as_seen'] ?? true),
			'delete_after_import' => $this->toBool($item['delete_after_import'] ?? false),
			'subject_filter' => (string)($item['subject_filter'] ?? ''),
			'sender_filter' => (string)($item['sender_filter'] ?? ''),
			'max_attachment_bytes' => (int)($item['max_attachment_bytes'] ?? 26214400),
			'create_mail_folder' => $this->toBool($item['create_mail_folder'] ?? false),
			'save_mail_file' => $this->toBool($item['save_mail_file'] ?? false),
			'last_uid' => (int)($item['last_uid'] ?? 0),
			'uidvalidity' => (int)($item['uidvalidity'] ?? 0),
			'last_run' => (string)($item['last_run'] ?? ''),
			'last_status' => (string)($item['last_status'] ?? ''),
			'last_error' => (string)($item['last_error'] ?? ''),
		];
	}

	/**
	 * @param array<string, mixed> $item
	 * @param array<string, mixed>|null $previous
	 * @return array<string, mixed>
	 */
	private function normalizeMapping(array $item, ?array $previous = null): array {
		$id = trim((string)($item['id'] ?? ''));
		if ($id === '') {
			$id = $previous['id'] ?? $this->newId();
		}

		$name = trim((string)($item['name'] ?? ''));
		if ($name === '') {
			$name = $previous['name'] ?? 'Mapping';
		}

		$password = '';
		if (isset($item['imap_password']) && is_string($item['imap_password']) && $item['imap_password'] !== '') {
			$password = $this->crypto->encrypt($item['imap_password']);
		} elseif ($previous !== null) {
			$password = (string)($previous['imap_password'] ?? '');
		}

		$targetPath = '/' . trim((string)($item['target_path'] ?? ($previous['target_path'] ?? '/Mail-Anhänge')), '/');
		if ($targetPath === '/') {
			$targetPath = '/';
		}

		$maxBytes = (int)($item['max_attachment_bytes'] ?? ($previous['max_attachment_bytes'] ?? 26214400));
		if ($maxBytes < 0) {
			$maxBytes = 0;
		}
		if ($maxBytes > 524288000) {
			$maxBytes = 524288000; // 500 MiB hard cap
		}

		return [
			'id' => $id,
			'name' => mb_substr($name, 0, 120),
			'fetch_enabled' => $this->toBool($item['fetch_enabled'] ?? ($previous['fetch_enabled'] ?? false)),
			'imap_host' => (string)($item['imap_host'] ?? ($previous['imap_host'] ?? '')),
			'imap_port' => (int)($item['imap_port'] ?? ($previous['imap_port'] ?? 993)),
			'imap_encryption' => (string)($item['imap_encryption'] ?? ($previous['imap_encryption'] ?? 'ssl')),
			'imap_validate_cert' => $this->toBool($item['imap_validate_cert'] ?? ($previous['imap_validate_cert'] ?? true)),
			'imap_user' => (string)($item['imap_user'] ?? ($previous['imap_user'] ?? '')),
			'imap_password' => $password,
			'imap_folder' => (string)($item['imap_folder'] ?? ($previous['imap_folder'] ?? 'INBOX')) ?: 'INBOX',
			'target_user' => (string)($item['target_user'] ?? ($previous['target_user'] ?? 'admin')),
			'target_path' => $targetPath === '/' ? '/' : $targetPath,
			'mark_as_seen' => $this->toBool($item['mark_as_seen'] ?? ($previous['mark_as_seen'] ?? true)),
			'delete_after_import' => $this->toBool($item['delete_after_import'] ?? ($previous['delete_after_import'] ?? false)),
			'subject_filter' => (string)($item['subject_filter'] ?? ($previous['subject_filter'] ?? '')),
			'sender_filter' => (string)($item['sender_filter'] ?? ($previous['sender_filter'] ?? '')),
			'max_attachment_bytes' => $maxBytes,
			'create_mail_folder' => $this->toBool($item['create_mail_folder'] ?? ($previous['create_mail_folder'] ?? false)),
			'save_mail_file' => $this->toBool($item['save_mail_file'] ?? ($previous['save_mail_file'] ?? false)),
			'last_uid' => (int)($previous['last_uid'] ?? ($item['last_uid'] ?? 0)),
			'uidvalidity' => (int)($previous['uidvalidity'] ?? ($item['uidvalidity'] ?? 0)),
			'last_run' => (string)($previous['last_run'] ?? ($item['last_run'] ?? '')),
			'last_status' => (string)($previous['last_status'] ?? ($item['last_status'] ?? '')),
			'last_error' => (string)($previous['last_error'] ?? ($item['last_error'] ?? '')),
		];
	}

	/**
	 * @param array<string, mixed> $mapping
	 * @return array<string, mixed>
	 */
	private function forClient(array $mapping): array {
		$mapping['imap_password_set'] = ($mapping['imap_password'] ?? '') !== '';
		$mapping['imap_password'] = '';
		return $mapping;
	}

	private function ensureDefaultMappingUnlocked(): void {
		$existing = $this->get(self::MAPPINGS_KEY, '');
		if ($existing !== '' && $existing !== '[]') {
			return;
		}

		$this->persistMappingsUnlocked([
			$this->normalizeMapping([
				'id' => $this->newId(),
				'name' => $this->l10n->t('Default'),
				'fetch_enabled' => false,
				'imap_host' => '',
				'imap_port' => 993,
				'imap_encryption' => 'ssl',
				'imap_validate_cert' => true,
				'imap_user' => '',
				'imap_folder' => 'INBOX',
				'target_user' => 'admin',
				'target_path' => '/Mail-Anhänge',
				'mark_as_seen' => true,
				'delete_after_import' => false,
				'max_attachment_bytes' => 26214400,
			]),
		]);
	}

	private function toBool(mixed $value): bool {
		return $value === true || $value === 1 || $value === '1' || $value === 'true';
	}

	private function newId(): string {
		return bin2hex(random_bytes(8));
	}
}
