<?php

declare(strict_types=1);

namespace OCA\MailDrop\Controller;

use OCA\MailDrop\Service\ConfigService;
use OCA\MailDrop\Service\MailFetchService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserManager;

class ConfigController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private ConfigService $configService,
		private MailFetchService $mailFetchService,
		private IUserManager $userManager,
	) {
		parent::__construct($appName, $request);
	}

	public function get(): DataResponse {
		return new DataResponse($this->configService->getAll());
	}

	/**
	 * Benutzer für Zielbenutzer-Auswahl (Admin-Settings).
	 */
	public function searchUsers(): DataResponse {
		$search = trim((string)$this->request->getParam('search', ''));
		$limit = (int)$this->request->getParam('limit', 50);
		if ($limit < 1) {
			$limit = 50;
		}
		if ($limit > 200) {
			$limit = 200;
		}

		/** @var array<string, array{id: string, displayName: string}> $byId */
		$byId = [];
		$add = static function (IUser $user) use (&$byId): void {
			$uid = $user->getUID();
			$byId[$uid] = [
				'id' => $uid,
				'displayName' => $user->getDisplayName(),
			];
		};

		foreach ($this->userManager->search($search, $limit) as $user) {
			$add($user);
		}
		if ($search !== '') {
			foreach ($this->userManager->searchDisplayName($search, $limit) as $user) {
				$add($user);
			}
			$exact = $this->userManager->get($search);
			if ($exact instanceof IUser) {
				$add($exact);
			}
		}

		$users = array_values($byId);
		usort(
			$users,
			static fn (array $a, array $b): int => strcasecmp($a['displayName'], $b['displayName']),
		);

		return new DataResponse(['users' => array_slice($users, 0, $limit)]);
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

	public function resetCursor(string $id): DataResponse {
		$mapping = $this->configService->resetMappingCursor($id);
		if ($mapping === null) {
			return new DataResponse(['message' => 'Mapping nicht gefunden.'], Http::STATUS_NOT_FOUND);
		}
		return new DataResponse($mapping);
	}
}
