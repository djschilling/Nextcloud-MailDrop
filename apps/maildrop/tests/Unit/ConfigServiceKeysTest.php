<?php

declare(strict_types=1);

namespace OCA\MailDrop\Tests\Unit;

use OCA\MailDrop\Service\ConfigService;

require dirname(__DIR__, 2) . '/vendor/autoload.php';

function assert_true(bool $cond, string $msg): void {
	if (!$cond) {
		fwrite(STDERR, "FAIL: $msg\n");
		exit(1);
	}
	echo "OK: $msg\n";
}

$purged = ConfigService::keysToPurge(['enabled', 'installed_version', 'types', 'mappings', 'imap_host']);
assert_true(
	$purged === ['mappings', 'imap_host'],
	'purge keeps Nextcloud-managed keys and drops mappings plus leftovers',
);

assert_true(
	ConfigService::keysToPurge(['enabled', 'types']) === [],
	'purge is a no-op when only Nextcloud-managed keys are present',
);

$legacy = ConfigService::leftoverLegacyKeys(['mappings', 'imap_password', 'enabled', 'imap_host']);
assert_true(
	$legacy === ['imap_password', 'imap_host'],
	'legacy cleanup never treats mappings as leftover',
);

assert_true(
	!in_array('mappings', ConfigService::LEGACY_FLAT_KEYS, true),
	'mappings JSON is not a legacy flat key',
);

assert_true(
	in_array('imap_password', ConfigService::LEGACY_FLAT_KEYS, true),
	'legacy IMAP password is cleaned after migration',
);

echo "All ConfigService key tests passed.\n";
exit(0);
