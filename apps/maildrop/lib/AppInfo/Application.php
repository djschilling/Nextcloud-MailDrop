<?php

declare(strict_types=1);

namespace OCA\MailDrop\AppInfo;

use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

class Application extends App implements IBootstrap {
	public const APP_ID = 'maildrop';

	public function __construct() {
		parent::__construct(self::APP_ID);

		$autoload = dirname(__DIR__, 2) . '/vendor/autoload.php';
		if (is_readable($autoload)) {
			require_once $autoload;
		}
	}

	public function register(IRegistrationContext $context): void {
	}

	public function boot(IBootContext $context): void {
	}
}
