<?php

declare(strict_types=1);

namespace OCA\MailDrop\Service;

use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IUserManager;
use Psr\Log\LoggerInterface;
use Webklex\PHPIMAP\Client;
use Webklex\PHPIMAP\ClientManager;
use Webklex\PHPIMAP\Exceptions\ConnectionFailedException;
use Webklex\PHPIMAP\Message;

class MailFetchService {
	public function __construct(
		private ConfigService $configService,
		private IRootFolder $rootFolder,
		private IUserManager $userManager,
		private LoggerInterface $logger,
	) {
	}

	/**
	 * @return array{success: bool, message: string, imported?: int}
	 */
	public function testConnection(?string $mappingId = null): array {
		$mapping = $this->resolveMapping($mappingId);
		if ($mapping === null) {
			return ['success' => false, 'message' => 'Kein Mapping gefunden.'];
		}

		$client = null;
		try {
			$client = $this->createClient($mapping);
			$client->connect();
			$folder = $client->getFolder((string)$mapping['imap_folder']);
			$count = 0;
			if ($folder !== null) {
				$count = $folder->messages()->all()->leaveUnread()->get()->count();
			}
			return [
				'success' => true,
				'message' => sprintf(
					'[%s] Verbindung OK. %d Nachricht(en) im Ordner.',
					$mapping['name'],
					$count,
				),
			];
		} catch (\Throwable $e) {
			return [
				'success' => false,
				'message' => sprintf('[%s] %s', $mapping['name'], $this->friendlyError($e)),
			];
		} finally {
			if ($client !== null) {
				try {
					$client->disconnect();
				} catch (\Throwable) {
					// ignore
				}
			}
		}
	}

	/**
	 * @return array{success: bool, message: string, imported: int, skipped: int, results?: list<array<string, mixed>>}
	 */
	public function fetchAndStore(?string $mappingId = null): array {
		if ($mappingId !== null) {
			$mapping = $this->configService->getMapping($mappingId);
			if ($mapping === null) {
				return [
					'success' => false,
					'message' => 'Mapping nicht gefunden.',
					'imported' => 0,
					'skipped' => 0,
				];
			}
			return $this->fetchMapping($mapping);
		}

		$mappings = array_values(array_filter(
			$this->configService->getMappings(),
			static fn (array $m) => !empty($m['fetch_enabled']),
		));

		if ($mappings === []) {
			return [
				'success' => false,
				'message' => 'Kein aktives Mapping konfiguriert.',
				'imported' => 0,
				'skipped' => 0,
			];
		}

		$imported = 0;
		$skipped = 0;
		$ok = true;
		$messages = [];
		$results = [];

		foreach ($mappings as $mapping) {
			$result = $this->fetchMapping($mapping);
			$imported += $result['imported'];
			$skipped += $result['skipped'];
			$ok = $ok && $result['success'];
			$messages[] = sprintf('%s: %s', $mapping['name'], $result['message']);
			$results[] = [
				'id' => $mapping['id'],
				'name' => $mapping['name'],
				'success' => $result['success'],
				'message' => $result['message'],
				'imported' => $result['imported'],
				'skipped' => $result['skipped'],
			];
		}

		return [
			'success' => $ok,
			'message' => implode(' | ', $messages),
			'imported' => $imported,
			'skipped' => $skipped,
			'results' => $results,
		];
	}

	/**
	 * @param array<string, mixed> $mapping
	 * @return array{success: bool, message: string, imported: int, skipped: int}
	 */
	private function fetchMapping(array $mapping): array {
		if (empty($mapping['fetch_enabled'])) {
			$message = 'Abruf ist deaktiviert.';
			$this->configService->setMappingLastRunStatus((string)$mapping['id'], 'disabled', $message);
			return ['success' => false, 'message' => $message, 'imported' => 0, 'skipped' => 0];
		}

		$imported = 0;
		$skipped = 0;
		$client = null;

		try {
			$targetFolder = $this->ensureTargetFolder(
				(string)$mapping['target_user'],
				(string)$mapping['target_path'],
			);

			$client = $this->createClient($mapping);
			$client->connect();
			$mailbox = $client->getFolder((string)$mapping['imap_folder']);
			if ($mailbox === null) {
				throw new \RuntimeException(sprintf('IMAP-Ordner "%s" nicht gefunden.', $mapping['imap_folder']));
			}

			$lastUid = (int)$mapping['last_uid'];
			$messages = $mailbox->messages()->all()->setFetchOrder('asc')->leaveUnread()->get();
			$maxUid = $lastUid;

			/** @var Message $message */
			foreach ($messages as $message) {
				$uid = (int)$message->getUid();
				if ($uid <= $lastUid) {
					continue;
				}
				$maxUid = max($maxUid, $uid);

				$subject = (string)$message->getSubject();
				$from = $this->formatFrom($message);

				if (!$this->matchesFilters($subject, $from, $mapping)) {
					$skipped++;
					continue;
				}

				$attachments = $message->getAttachments();
				if ($attachments->count() === 0) {
					$skipped++;
					if (!empty($mapping['mark_as_seen'])) {
						$message->setFlag('Seen');
					}
					continue;
				}

				$safeSubject = $this->sanitizeFilename($subject !== '' ? $subject : 'ohne-betreff');
				$dateAttr = $message->getDate();
				$date = $dateAttr !== null ? $dateAttr->toDate() : null;
				$dateStr = $date ? $date->format('Y-m-d_His') : date('Y-m-d_His');
				$mailFolderName = sprintf('%s_%s_uid%d', $dateStr, $safeSubject, $uid);
				$mailFolder = $this->getOrCreateSubFolder($targetFolder, $mailFolderName);

				$savedNames = [];
				foreach ($attachments as $attachment) {
					$name = (string)$attachment->getName();
					$filename = $this->sanitizeFilename($name !== '' ? $name : 'anhang');
					$filename = $this->uniqueFilename($mailFolder, $filename);
					$mailFolder->newFile($filename, $attachment->getContent());
					$savedNames[] = $filename;
					$imported++;
				}

				$meta = [
					'mapping_id' => $mapping['id'],
					'mapping_name' => $mapping['name'],
					'uid' => $uid,
					'subject' => $subject,
					'from' => $from,
					'date' => $date ? $date->toIso8601String() : '',
					'attachments' => $savedNames,
				];
				$mailFolder->newFile('email.json', json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

				if (!empty($mapping['mark_as_seen'])) {
					$message->setFlag('Seen');
				}
				if (!empty($mapping['delete_after_import'])) {
					$message->delete();
				}
			}

			$updates = [
				'last_run' => (new \DateTimeImmutable('now'))->format(\DateTimeInterface::ATOM),
				'last_status' => 'ok',
				'last_error' => sprintf('%d Anhang/Anhänge importiert, %d übersprungen.', $imported, $skipped),
			];
			if ($maxUid > $lastUid) {
				$updates['last_uid'] = $maxUid;
			}
			$this->configService->updateMappingRuntimeState((string)$mapping['id'], $updates);

			$messageText = $updates['last_error'];
			$this->logger->info('MailDrop [' . $mapping['name'] . ']: ' . $messageText, ['app' => 'maildrop']);

			return [
				'success' => true,
				'message' => $messageText,
				'imported' => $imported,
				'skipped' => $skipped,
			];
		} catch (\Throwable $e) {
			$error = $this->friendlyError($e);
			$this->logger->error('MailDrop [' . $mapping['name'] . '] failed: ' . $error, ['app' => 'maildrop']);
			$this->configService->setMappingLastRunStatus((string)$mapping['id'], 'error', $error);
			return [
				'success' => false,
				'message' => $error,
				'imported' => $imported,
				'skipped' => $skipped,
			];
		} finally {
			if ($client !== null) {
				try {
					$client->disconnect();
				} catch (\Throwable) {
					// ignore
				}
			}
		}
	}

	/**
	 * @return array<string, mixed>|null
	 */
	private function resolveMapping(?string $mappingId): ?array {
		if ($mappingId !== null && $mappingId !== '') {
			return $this->configService->getMapping($mappingId);
		}
		$mappings = $this->configService->getMappings();
		return $mappings[0] ?? null;
	}

	/**
	 * @param array<string, mixed> $mapping
	 */
	private function createClient(array $mapping): Client {
		$host = (string)$mapping['imap_host'];
		$user = (string)$mapping['imap_user'];
		$password = $this->configService->getPasswordFromMapping($mapping);

		if ($host === '' || $user === '' || $password === '') {
			throw new \RuntimeException('IMAP-Host, Benutzer und Passwort müssen gesetzt sein.');
		}

		$encryption = match ((string)$mapping['imap_encryption']) {
			'ssl' => 'ssl',
			'tls' => 'tls',
			default => false,
		};

		$cm = new ClientManager();
		return $cm->make([
			'host' => $host,
			'port' => (int)$mapping['imap_port'],
			'encryption' => $encryption,
			'validate_cert' => false,
			'username' => $user,
			'password' => $password,
			'protocol' => 'imap',
		]);
	}

	private function formatFrom(Message $message): string {
		$from = $message->getFrom();
		if ($from === null || $from->count() === 0) {
			return '';
		}
		$address = $from->first();
		if ($address === null) {
			return '';
		}
		$mail = (string)$address->mail;
		$personal = (string)($address->personal ?? '');
		return $personal !== '' ? sprintf('%s <%s>', $personal, $mail) : $mail;
	}

	private function ensureTargetFolder(string $uid, string $path): Folder {
		if (!$this->userManager->userExists($uid)) {
			throw new \RuntimeException(sprintf('Zielbenutzer "%s" existiert nicht.', $uid));
		}

		$userFolder = $this->rootFolder->getUserFolder($uid);
		$relative = trim($path, '/');
		if ($relative === '') {
			return $userFolder;
		}

		try {
			$node = $userFolder->get($relative);
			if ($node instanceof Folder) {
				return $node;
			}
			throw new \RuntimeException(sprintf('Zielpfad "%s" ist keine Ordner.', $path));
		} catch (NotFoundException) {
			return $userFolder->newFolder($relative);
		}
	}

	private function getOrCreateSubFolder(Folder $parent, string $name): Folder {
		$name = $this->sanitizeFilename($name);
		try {
			$node = $parent->get($name);
			if ($node instanceof Folder) {
				return $node;
			}
			$name .= '_' . bin2hex(random_bytes(2));
			return $parent->newFolder($name);
		} catch (NotFoundException) {
			return $parent->newFolder($name);
		}
	}

	/**
	 * @param array<string, mixed> $mapping
	 */
	private function matchesFilters(string $subject, string $from, array $mapping): bool {
		$subjectFilter = trim((string)$mapping['subject_filter']);
		$senderFilter = trim((string)$mapping['sender_filter']);

		if ($subjectFilter !== '' && stripos($subject, $subjectFilter) === false) {
			return false;
		}
		if ($senderFilter !== '' && stripos($from, $senderFilter) === false) {
			return false;
		}

		return true;
	}

	private function sanitizeFilename(string $name): string {
		$name = str_replace(["\0", '/', '\\'], '-', $name);
		$name = preg_replace('/[^\p{L}\p{N}\.\-_ ]+/u', '_', $name) ?? 'file';
		$name = trim($name);
		if ($name === '' || $name === '.' || $name === '..') {
			$name = 'anhang';
		}
		return mb_substr($name, 0, 180);
	}

	private function uniqueFilename(Folder $folder, string $filename): string {
		if (!$folder->nodeExists($filename)) {
			return $filename;
		}

		$dot = strrpos($filename, '.');
		$base = $dot === false ? $filename : substr($filename, 0, $dot);
		$ext = $dot === false ? '' : substr($filename, $dot);
		$i = 1;
		do {
			$candidate = sprintf('%s_%d%s', $base, $i, $ext);
			$i++;
		} while ($folder->nodeExists($candidate));

		return $candidate;
	}

	private function friendlyError(\Throwable $e): string {
		if ($e instanceof ConnectionFailedException) {
			return 'IMAP-Verbindung fehlgeschlagen: ' . $e->getMessage();
		}
		return $e->getMessage();
	}
}
