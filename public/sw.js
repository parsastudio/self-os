const CACHE_NAME = 'personal-os-v1';
const STATIC_ASSETS = [
	'/',
	'/favicon.svg',
	'/manifest.webmanifest',
	'/Vazirmatn.woff2'
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return cache.addAll(STATIC_ASSETS);
		})
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => {
			return Promise.all(
				keys.map((key) => {
					if (key !== CACHE_NAME) {
						return caches.delete(key);
					}
				})
			);
		})
	);
	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	if (url.origin !== self.location.origin) return;
	if (event.request.method !== 'GET') return;
	if (url.pathname.startsWith('/api/')) return;

	event.respondWith(
		caches.match(event.request).then((cached) => {
			if (cached) return cached;
			return fetch(event.request).then((response) => {
				if (response.ok && (url.pathname.startsWith('/_nuxt/') || url.pathname.endsWith('.woff2') || url.pathname.endsWith('.svg'))) {
					const clone = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
				}
				return response;
			}).catch(() => {
				if (event.request.mode === 'navigate') {
					return caches.match('/');
				}
			});
		})
	);
});
