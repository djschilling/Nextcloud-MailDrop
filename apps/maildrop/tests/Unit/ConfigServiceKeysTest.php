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

$purged = ConfigService::keysToPurge(['enabled', 'installed_version', 'types', 'mappings']);
assert_true(
	$purged === ['mappings'],
	'purge keeps Nextcloud-managed keys and drops mappings',
);

assert_true(
	ConfigService::keysToPurge(['enabled', 'types']) === [],
	'purge is a no-op when only Nextcloud-managed keys are present',
);

echo "All ConfigService key tests passed.\n";
exit(0);
