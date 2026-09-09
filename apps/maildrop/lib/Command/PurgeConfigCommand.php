<?php

declare(strict_types=1);

namespace OCA\MailDrop\Command;

use OCA\MailDrop\Service\ConfigService;
use OCP\IL10N;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

class PurgeConfigCommand extends Command {
	public function __construct(
		private ConfigService $configService,
		private IL10N $l10n,
	) {
		parent::__construct();
	}

	protected function configure(): void {
		$this
			->setName('maildrop:purge-config')
			->setDescription($this->l10n->t('Remove all MailDrop mappings and leftover IMAP settings from app config. Does not delete imported files.'))
			->addOption(
				'yes',
				null,
				InputOption::VALUE_NONE,
				$this->l10n->t('Actually delete stored configuration (required).'),
			);
	}

	protected function execute(InputInterface $input, OutputInterface $output): int {
		$toDelete = $this->configService->listPurgeableKeys();

		if ($toDelete === []) {
			$output->writeln($this->l10n->t('No MailDrop configuration keys to delete.'));
			return Command::SUCCESS;
		}

		if (!$input->getOption('yes')) {
			$output->writeln($this->l10n->t('Dry run – no configuration was deleted. Pass --yes to delete mappings and leftover IMAP settings.'));
			$output->writeln($this->l10n->t('Would delete: %1$s', [implode(', ', $toDelete)]));
			return Command::SUCCESS;
		}

		$deleted = $this->configService->purgeStoredConfig();
		$output->writeln($this->l10n->t('Deleted MailDrop configuration keys: %1$s', [implode(', ', $deleted)]));
		return Command::SUCCESS;
	}
}
