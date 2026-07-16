<?php

declare(strict_types=1);

namespace OCA\MailDrop\Service;

use OCP\IConfig;
use OCP\Security\ICrypto;

class ConfigService {
	private const MAPPINGS_KEY = 'mappings';

	public function __construct(
		private IConfig $config,
		private ICrypto $crypto,
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
		$this->migrateLegacyIfNeeded();
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
		$existingById = [];
		foreach ($this->getMappings() as $existing) {
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

		$this->persistMappings($normalized);
		return $this->getMappingsForClient();
	}

	/**
	 * @param array<string, mixed> $data
	 * @return array<string, mixed>
	 */
	public function saveMapping(array $data): array {
		$mappings = $this->getMappings();
		$id = trim((string)($data['id'] ?? ''));

		foreach ($mappings as $index => $existing) {
			if ($id !== '' && $existing['id'] === $id) {
				$mappings[$index] = $this->normalizeMapping($data, $existing);
				$this->persistMappings($mappings);
				return $this->forClient($mappings[$index]);
			}
		}

		$created = $this->normalizeMapping($data, null);
		$mappings[] = $created;
		$this->persistMappings($mappings);
		return $this->forClient($created);
	}

	public function deleteMapping(string $id): void {
		$mappings = array_values(array_filter(
			$this->getMappings(),
			static fn (array $m) => $m['id'] !== $id,
		));
		$this->persistMappings($mappings);
	}

	/**
	 * @param array<string, mixed> $mapping
	 */
	public function updateMappingRuntimeState(string $id, array $updates): void {
		$mappings = $this->getMappings();
		foreach ($mappings as $index => $mapping) {
			if ($mapping['id'] !== $id) {
				continue;
			}
			foreach (['last_uid', 'last_run', 'last_status', 'last_error'] as $key) {
				if (array_key_exists($key, $updates)) {
					$mappings[$index][$key] = $updates[$key];
				}
			}
			$this->persistMappings($mappings);
			return;
		}
	}

	public function setMappingLastRunStatus(string $id, string $status, string $error = ''): void {
		$this->updateMappingRuntimeState($id, [
			'last_run' => (new \DateTimeImmutable('now'))->format(\DateTimeInterface::ATOM),
			'last_status' => $status,
			'last_error' => $error,
		]);
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
		return $this->config->getAppValue('maildrop', $key, $default);
	}

	public function set(string $key, string $value): void {
		$this->config->setAppValue('maildrop', $key, $value);
	}

	/**
	 * @param list<array<string, mixed>> $mappings
	 */
	private function persistMappings(array $mappings): void {
		$encoded = json_encode(array_values($mappings), JSON_UNESCAPED_UNICODE);
		if ($encoded === false) {
			throw new \RuntimeException('Mappings konnten nicht serialisiert werden.');
		}
		$this->set(self::MAPPINGS_KEY, $encoded);
	}

	/**
	 * Mapping aus gespeichertem JSON laden (Passwort bereits verschlüsselt).
	 *
	 * @param array<string, mixed> $item
	 * @return array<string, mixed>
	 */
	private function hydrateMapping(array $item): array {
		return [
			'id' => (string)($item['id'] ?? $this->newId()),
			'name' => (string)($item['name'] ?? 'Mapping'),
			'fetch_enabled' => $this->toBool($item['fetch_enabled'] ?? false),
			'imap_host' => (string)($item['imap_host'] ?? 'mail'),
			'imap_port' => (int)($item['imap_port'] ?? 3143),
			'imap_encryption' => (string)($item['imap_encryption'] ?? 'none'),
			'imap_user' => (string)($item['imap_user'] ?? 'maildrop'),
			'imap_password' => (string)($item['imap_password'] ?? ''),
			'imap_folder' => ((string)($item['imap_folder'] ?? 'INBOX')) ?: 'INBOX',
			'target_user' => (string)($item['target_user'] ?? 'admin'),
			'target_path' => (string)($item['target_path'] ?? '/Mail-Anhänge'),
			'mark_as_seen' => $this->toBool($item['mark_as_seen'] ?? true),
			'delete_after_import' => $this->toBool($item['delete_after_import'] ?? false),
			'subject_filter' => (string)($item['subject_filter'] ?? ''),
			'sender_filter' => (string)($item['sender_filter'] ?? ''),
			'last_uid' => (int)($item['last_uid'] ?? 0),
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

		return [
			'id' => $id,
			'name' => mb_substr($name, 0, 120),
			'fetch_enabled' => $this->toBool($item['fetch_enabled'] ?? ($previous['fetch_enabled'] ?? false)),
			'imap_host' => (string)($item['imap_host'] ?? ($previous['imap_host'] ?? 'mail')),
			'imap_port' => (int)($item['imap_port'] ?? ($previous['imap_port'] ?? 3143)),
			'imap_encryption' => (string)($item['imap_encryption'] ?? ($previous['imap_encryption'] ?? 'none')),
			'imap_user' => (string)($item['imap_user'] ?? ($previous['imap_user'] ?? 'maildrop')),
			'imap_password' => $password,
			'imap_folder' => (string)($item['imap_folder'] ?? ($previous['imap_folder'] ?? 'INBOX')) ?: 'INBOX',
			'target_user' => (string)($item['target_user'] ?? ($previous['target_user'] ?? 'admin')),
			'target_path' => $targetPath === '/' ? '/' : $targetPath,
			'mark_as_seen' => $this->toBool($item['mark_as_seen'] ?? ($previous['mark_as_seen'] ?? true)),
			'delete_after_import' => $this->toBool($item['delete_after_import'] ?? ($previous['delete_after_import'] ?? false)),
			'subject_filter' => (string)($item['subject_filter'] ?? ($previous['subject_filter'] ?? '')),
			'sender_filter' => (string)($item['sender_filter'] ?? ($previous['sender_filter'] ?? '')),
			'last_uid' => (int)($previous['last_uid'] ?? ($item['last_uid'] ?? 0)),
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

	private function migrateLegacyIfNeeded(): void {
		$existing = $this->get(self::MAPPINGS_KEY, '');
		if ($existing !== '' && $existing !== '[]') {
			return;
		}

		$host = $this->get('imap_host', '');
		$user = $this->get('imap_user', '');
		if ($host === '' && $user === '' && $this->get('imap_password', '') === '') {
			// Defaults for fresh installs: one ready-to-edit mapping
			$mapping = $this->normalizeMapping([
				'id' => $this->newId(),
				'name' => 'Standard',
				'fetch_enabled' => false,
				'imap_host' => 'mail',
				'imap_port' => 3143,
				'imap_encryption' => 'none',
				'imap_user' => 'maildrop',
				'imap_folder' => 'INBOX',
				'target_user' => 'admin',
				'target_path' => '/Mail-Anhänge',
				'mark_as_seen' => true,
				'delete_after_import' => false,
			]);
			$this->persistMappings([$mapping]);
			return;
		}

		$mapping = $this->normalizeMapping([
			'id' => $this->newId(),
			'name' => 'Standard',
			'fetch_enabled' => $this->get('fetch_enabled', '0') === '1',
			'imap_host' => $this->get('imap_host', 'mail'),
			'imap_port' => (int)$this->get('imap_port', '3143'),
			'imap_encryption' => $this->get('imap_encryption', 'none'),
			'imap_user' => $this->get('imap_user', 'maildrop'),
			'imap_folder' => $this->get('imap_folder', 'INBOX'),
			'target_user' => $this->get('target_user', 'admin'),
			'target_path' => $this->get('target_path', '/Mail-Anhänge'),
			'mark_as_seen' => $this->get('mark_as_seen', '1') === '1',
			'delete_after_import' => $this->get('delete_after_import', '0') === '1',
			'subject_filter' => $this->get('subject_filter', ''),
			'sender_filter' => $this->get('sender_filter', ''),
			'last_uid' => (int)$this->get('last_uid', '0'),
			'last_run' => $this->get('last_run', ''),
			'last_status' => $this->get('last_status', ''),
			'last_error' => $this->get('last_error', ''),
		]);
		// Passwort aus Legacy-Key übernehmen (bereits verschlüsselt)
		$legacyPassword = $this->get('imap_password', '');
		if ($legacyPassword !== '') {
			$mapping['imap_password'] = $legacyPassword;
		}
		$this->persistMappings([$mapping]);
	}

	private function toBool(mixed $value): bool {
		return $value === true || $value === 1 || $value === '1' || $value === 'true';
	}

	private function newId(): string {
		return bin2hex(random_bytes(8));
	}
}
