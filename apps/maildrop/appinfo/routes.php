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
			'name' => 'config#save',
			'url' => '/api/config',
			'verb' => 'PUT',
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
