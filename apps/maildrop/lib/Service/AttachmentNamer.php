<?php

declare(strict_types=1);

namespace OCA\MailDrop\Service;

/**
 * Reine Hilfsfunktionen für Attachment-Dateinamen (unit-testbar).
 */
class AttachmentNamer {
	public static function sanitizeFilename(string $name): string {
		$name = str_replace(["\0", '/', '\\'], '-', $name);
		$name = preg_replace('/[^\p{L}\p{N}\.\-_ ]+/u', '_', $name) ?? 'file';
		$name = trim($name);
		if ($name === '' || $name === '.' || $name === '..') {
			$name = 'anhang';
		}
		return mb_substr($name, 0, 160);
	}

	/**
	 * Flache Ablage: Zeitstempel + UID + Originalname.
	 * Beispiel: 20260716_203045_uid42_rechnung.pdf
	 */
	public static function buildPrefixedName(
		string $originalName,
		int $uid,
		?\DateTimeInterface $messageDate = null,
		?\DateTimeInterface $now = null,
	): string {
		$stampSource = $messageDate ?? $now ?? new \DateTimeImmutable('now');
		$stamp = $stampSource->format('Ymd_His');
		$safe = self::sanitizeFilename($originalName !== '' ? $originalName : 'anhang');
		return sprintf('%s_uid%d_%s', $stamp, $uid, $safe);
	}
}
