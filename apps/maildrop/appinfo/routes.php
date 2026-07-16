<?php

declare(strict_types=1);

return [
	'routes' => [
		[
			'name' => 'config#get',
			'url' => '/api/config',
			'verb' => 'GET',
		],
		[
			'name' => 'config#searchUsers',
			'url' => '/api/users',
			'verb' => 'GET',
		],
		[
			'name' => 'config#save',
			'url' => '/api/config',
			'verb' => 'PUT',
		],
		[
			'name' => 'config#create',
			'url' => '/api/mappings',
			'verb' => 'POST',
		],
		[
			'name' => 'config#saveOne',
			'url' => '/api/mappings/{id}',
			'verb' => 'PUT',
		],
		[
			'name' => 'config#destroy',
			'url' => '/api/mappings/{id}',
			'verb' => 'DELETE',
		],
		[
			'name' => 'config#testConnection',
			'url' => '/api/test',
			'verb' => 'POST',
		],
		[
			'name' => 'config#fetchNow',
			'url' => '/api/fetch',
			'verb' => 'POST',
		],
	],
];
