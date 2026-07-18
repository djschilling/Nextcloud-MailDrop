<?php

declare(strict_types=1);

namespace OCA\MailDrop\Tests\Unit;

use OCA\MailDrop\Service\UserFolderBrowser;

require dirname(__DIR__, 2) . '/vendor/autoload.php';

function assert_true(bool $cond, string $msg): void {
	if (!$cond) {
		fwrite(STDERR, "FAIL: $msg\n");
		exit(1);
	}
	echo "OK: $msg\n";
}

assert_true(UserFolderBrowser::normalizePath('') === '/', 'empty path becomes /');
assert_true(UserFolderBrowser::normalizePath('/') === '/', 'root stays /');
assert_true(UserFolderBrowser::normalizePath('Mail/Inbox') === '/Mail/Inbox', 'relative path gets leading slash');
assert_true(UserFolderBrowser::normalizePath('/Mail//Inbox/') === '/Mail/Inbox', 'duplicate slashes collapse');
assert_true(UserFolderBrowser::normalizePath('/Mail/../Other/.') === '/Other', 'dot segments resolve');
assert_true(UserFolderBrowser::normalizePath('/a/b/../../..') === '/', 'parent beyond root stays /');

assert_true(UserFolderBrowser::parentPath('/') === null, 'root has no parent');
assert_true(UserFolderBrowser::parentPath('/Mail') === '/', 'single segment parent is root');
assert_true(UserFolderBrowser::parentPath('/Mail/Inbox') === '/Mail', 'nested parent');

assert_true(UserFolderBrowser::joinPath('/', 'Docs') === '/Docs', 'join root + name');
assert_true(UserFolderBrowser::joinPath('/Mail', 'Inbox') === '/Mail/Inbox', 'join nested');
assert_true(UserFolderBrowser::joinPath('/Mail', '../x') === '/Mail', 'join rejects path separators in name');

echo "All UserFolderBrowser path tests passed.\n";
