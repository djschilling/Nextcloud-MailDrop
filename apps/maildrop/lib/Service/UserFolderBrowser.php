<?php

declare(strict_types=1);

namespace OCA\MailDrop\Service;

use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IL10N;
use OCP\IUserManager;

/**
 * Lists folders in a target user's Nextcloud home (admin settings picker).
 */
class UserFolderBrowser {
	public function __construct(
		private IRootFolder $rootFolder,
		private IUserManager $userManager,
		private IL10N $l10n,
	) {
	}

	/**
	 * @return array{
	 *   user: string,
	 *   path: string,
	 *   parent: ?string,
	 *   folders: list<array{name: string, path: string}>
	 * }
	 */
	public function listFolders(string $userId, string $path): array {
		$userId = trim($userId);
		if ($userId === '') {
			throw new \InvalidArgumentException($this->l10n->t('Target user is required.'));
		}
		if (!$this->userManager->userExists($userId)) {
			throw new \InvalidArgumentException($this->l10n->t('Target user "%1$s" does not exist.', [$userId]));
		}

		$normalized = self::normalizePath($path);
		$userFolder = $this->rootFolder->getUserFolder($userId);

		try {
			$folder = $this->resolveFolder($userFolder, $normalized);
		} catch (NotFoundException) {
			throw new \InvalidArgumentException($this->l10n->t('Folder "%1$s" not found for user "%2$s".', [$normalized, $userId]));
		} catch (\InvalidArgumentException $e) {
			throw $e;
		}

		/** @var list<array{name: string, path: string}> $folders */
		$folders = [];
		foreach ($folder->getDirectoryListing() as $child) {
			if (!$child instanceof Folder) {
				continue;
			}
			$name = $child->getName();
			$folders[] = [
				'name' => $name,
				'path' => self::joinPath($normalized, $name),
			];
		}

		usort(
			$folders,
			static fn (array $a, array $b): int => strcasecmp($a['name'], $b['name']),
		);

		return [
			'user' => $userId,
			'path' => $normalized,
			'parent' => self::parentPath($normalized),
			'folders' => $folders,
		];
	}

	public static function normalizePath(string $path): string {
		$path = str_replace('\\', '/', $path);
		$path = trim($path);
		if ($path === '' || $path === '/') {
			return '/';
		}
		$parts = [];
		foreach (explode('/', $path) as $segment) {
			if ($segment === '' || $segment === '.') {
				continue;
			}
			if ($segment === '..') {
				array_pop($parts);
				continue;
			}
			$parts[] = $segment;
		}
		return $parts === [] ? '/' : '/' . implode('/', $parts);
	}

	public static function parentPath(string $path): ?string {
		$normalized = self::normalizePath($path);
		if ($normalized === '/') {
			return null;
		}
		$parent = dirname($normalized);
		return $parent === '\\' || $parent === '.' ? '/' : self::normalizePath($parent);
	}

	public static function joinPath(string $parent, string $name): string {
		$parent = self::normalizePath($parent);
		$name = trim($name);
		if ($name === '' || $name === '.' || $name === '..'
			|| str_contains($name, '/') || str_contains($name, '\\')) {
			return $parent;
		}
		return $parent === '/' ? '/' . $name : $parent . '/' . $name;
	}

	/**
	 * @throws NotFoundException
	 */
	private function resolveFolder(Folder $userFolder, string $normalized): Folder {
		if ($normalized === '/') {
			return $userFolder;
		}

		$relative = ltrim($normalized, '/');
		$node = $userFolder->get($relative);
		if (!$node instanceof Folder) {
			throw new \InvalidArgumentException($this->l10n->t('Target path "%1$s" is not a folder.', [$normalized]));
		}
		return $node;
	}
}
