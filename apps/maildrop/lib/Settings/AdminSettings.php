<?php

declare(strict_types=1);

namespace OCA\MailDrop\Settings;

use OCA\MailDrop\AppInfo\Application;
use OCA\MailDrop\Service\ConfigService;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IInitialStateService;
use OCP\Settings\ISettings;
use OCP\Util;

class AdminSettings implements ISettings {
	public function __construct(
		private ConfigService $configService,
		private IInitialStateService $initialState,
	) {
	}

	public function getForm(): TemplateResponse {
		$config = $this->configService->getAll();
		$config['imap_password'] = '';
		$this->initialState->provideInitialState(Application::APP_ID, 'config', $config);

		Util::addScript(Application::APP_ID, 'admin');
		Util::addStyle(Application::APP_ID, 'admin');

		return new TemplateResponse(Application::APP_ID, 'admin');
	}

	public function getSection(): string {
		return 'maildrop';
	}

	public function getPriority(): int {
		return 50;
	}
}
