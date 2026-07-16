<?php

declare(strict_types=1);

namespace OCA\MailDrop\BackgroundJob;

use OCA\MailDrop\Service\MailFetchService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;

class FetchMailJob extends TimedJob {
	public function __construct(
		ITimeFactory $time,
		private MailFetchService $mailFetchService,
	) {
		parent::__construct($time);
		// Alle 5 Minuten
		$this->setInterval(300);
	}

	protected function run($argument): void {
		$this->mailFetchService->fetchAndStore();
	}
}
