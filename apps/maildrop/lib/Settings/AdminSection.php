<?php

declare(strict_types=1);

namespace OCA\MailDrop\Settings;

use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\Settings\IIconSection;

class AdminSection implements IIconSection {
	public function __construct(
		private IL10N $l,
		private IURLGenerator $urlGenerator,
	) {
	}

	public function getID(): string {
		return 'maildrop';
	}

	public function getName(): string {
		return $this->l->t('MailDrop');
	}

	public function getPriority(): int {
		return 75;
	}

	public function getIcon(): string {
		return $this->urlGenerator->imagePath('core', 'actions/mail.svg');
	}
}
