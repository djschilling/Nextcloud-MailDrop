<?php

declare(strict_types=1);

namespace OCA\MailDrop\Command;

use OCA\MailDrop\Service\MailFetchService;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

class FetchCommand extends Command {
	public function __construct(
		private MailFetchService $mailFetchService,
	) {
		parent::__construct();
	}

	protected function configure(): void {
		$this
			->setName('maildrop:fetch')
			->setDescription('Fetch emails via IMAP and store attachments in Nextcloud')
			->addOption(
				'mapping',
				'm',
				InputOption::VALUE_REQUIRED,
				'Only fetch this mapping ID (default: all active mappings)',
			);
	}

	protected function execute(InputInterface $input, OutputInterface $output): int {
		$mappingId = $input->getOption('mapping');
		$mappingId = is_string($mappingId) && $mappingId !== '' ? $mappingId : null;

		$result = $this->mailFetchService->fetchAndStore($mappingId);
		$output->writeln($result['message']);
		if (!empty($result['imported']) || !empty($result['skipped'])) {
			$output->writeln(sprintf('imported=%d skipped=%d', $result['imported'], $result['skipped'] ?? 0));
		}
		return $result['success'] ? Command::SUCCESS : Command::FAILURE;
	}
}
