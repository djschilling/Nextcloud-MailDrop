<?php

declare(strict_types=1);

namespace OCA\MailDrop\Migration;

use OCA\MailDrop\Service\ConfigService;
use OCP\IL10N;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;

/**
 * Drops leftover single-config keys after the mappings JSON migration.
 *
 * Not registered as an uninstall step: Nextcloud also runs those when the app
 * is merely disabled, which would wipe IMAP passwords on a temporary disable.
 */
class CleanupLegacyConfig implements IRepairStep {
	public function __construct(
		private ConfigService $configService,
		private IL10N $l10n,
	) {
	}

	public function getName(): string {
		return $this->l10n->t('Remove leftover MailDrop single-config keys after mappings migration');
	}

	public function run(IOutput $output): void {
		$removed = $this->configService->deleteLegacyFlatKeys();
		if ($removed > 0) {
			$output->info($this->l10n->t('Removed %1$d leftover MailDrop config key(s).', [$removed]));
		}
	}
}
