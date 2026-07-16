<?php

declare(strict_types=1);

namespace OCA\MailDrop\Controller;

use OCA\MailDrop\Service\ConfigService;
use OCA\MailDrop\Service\MailFetchService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;

class ConfigController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private ConfigService $configService,
		private MailFetchService $mailFetchService,
	) {
		parent::__construct($appName, $request);
	}

	public function get(): DataResponse {
		$config = $this->configService->getAll();
		// Passwort nie an den Client zurückgeben
		$config['imap_password'] = '';
		return new DataResponse($config);
	}

	public function save(): DataResponse {
		$data = [
			'fetch_enabled' => $this->request->getParam('fetch_enabled'),
			'imap_host' => $this->request->getParam('imap_host'),
			'imap_port' => $this->request->getParam('imap_port'),
			'imap_encryption' => $this->request->getParam('imap_encryption'),
			'imap_user' => $this->request->getParam('imap_user'),
			'imap_password' => $this->request->getParam('imap_password'),
			'imap_folder' => $this->request->getParam('imap_folder'),
			'target_user' => $this->request->getParam('target_user'),
			'target_path' => $this->request->getParam('target_path'),
			'mark_as_seen' => $this->request->getParam('mark_as_seen'),
			'delete_after_import' => $this->request->getParam('delete_after_import'),
			'subject_filter' => $this->request->getParam('subject_filter'),
			'sender_filter' => $this->request->getParam('sender_filter'),
		];

		$config = $this->configService->save($data);
		$config['imap_password'] = '';
		return new DataResponse($config);
	}

	public function testConnection(): DataResponse {
		$result = $this->mailFetchService->testConnection();
		$status = $result['success'] ? Http::STATUS_OK : Http::STATUS_BAD_REQUEST;
		return new DataResponse($result, $status);
	}

	public function fetchNow(): DataResponse {
		$result = $this->mailFetchService->fetchAndStore();
		$status = $result['success'] ? Http::STATUS_OK : Http::STATUS_BAD_REQUEST;
		return new DataResponse($result, $status);
	}
}
