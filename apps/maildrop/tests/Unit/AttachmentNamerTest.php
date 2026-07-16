<?php

declare(strict_types=1);

namespace OCA\MailDrop\Tests\Unit;

use OCA\MailDrop\Service\AttachmentNamer;

require dirname(__DIR__, 2) . '/vendor/autoload.php';

function assert_true(bool $cond, string $msg): void {
	if (!$cond) {
		fwrite(STDERR, "FAIL: $msg\n");
		exit(1);
	}
	echo "OK: $msg\n";
}

assert_true(
	AttachmentNamer::sanitizeFilename('rechnung/2024.pdf') === 'rechnung-2024.pdf',
	'sanitize replaces path separators',
);

assert_true(
	AttachmentNamer::sanitizeFilename('') === 'anhang',
	'empty name becomes anhang',
);

$date = new \DateTimeImmutable('2026-07-16 20:30:45');
$name = AttachmentNamer::buildPrefixedName('Rechnung Final.pdf', 42, $date);
assert_true(
	$name === '20260716_203045_uid42_Rechnung Final.pdf',
	'prefixed name includes stamp, uid and original',
);

$name2 = AttachmentNamer::buildPrefixedName('', 7, $date);
assert_true(
	str_starts_with($name2, '20260716_203045_uid7_'),
	'empty original still gets prefix',
);

echo "All AttachmentNamer tests passed.\n";
exit(0);
