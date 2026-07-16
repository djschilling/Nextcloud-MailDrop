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
		return new DataResponse($this->configService->getAll());
	}

	public function save(): DataResponse {
		$mappings = $this->request->getParam('mappings');
		if (!is_array($mappings)) {
			return new DataResponse(['message' => 'mappings muss ein Array sein.'], Http::STATUS_BAD_REQUEST);
		}

		return new DataResponse([
			'mappings' => $this->configService->saveMappings($mappings),
		]);
	}

	public function saveOne(string $id): DataResponse {
		$data = $this->request->getParams();
		$data['id'] = $id;
		return new DataResponse($this->configService->saveMapping($data));
	}

	public function create(): DataResponse {
		$data = $this->request->getParams();
		unset($data['id']);
		return new DataResponse($this->configService->saveMapping($data), Http::STATUS_CREATED);
	}

	public function destroy(string $id): DataResponse {
		$this->configService->deleteMapping($id);
		return new DataResponse(['mappings' => $this->configService->getMappingsForClient()]);
	}

	public function testConnection(): DataResponse {
		$mappingId = $this->request->getParam('id');
		$result = $this->mailFetchService->testConnection(is_string($mappingId) ? $mappingId : null);
		$status = $result['success'] ? Http::STATUS_OK : Http::STATUS_BAD_REQUEST;
		return new DataResponse($result, $status);
	}

	public function fetchNow(): DataResponse {
		$mappingId = $this->request->getParam('id');
		$result = $this->mailFetchService->fetchAndStore(is_string($mappingId) && $mappingId !== '' ? $mappingId : null);
		$status = $result['success'] ? Http::STATUS_OK : Http::STATUS_BAD_REQUEST;
		return new DataResponse($result, $status);
	}
}
