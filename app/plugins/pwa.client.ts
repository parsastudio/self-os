export default defineNuxtPlugin(() => {
	if (import.meta.client && 'serviceWorker' in navigator) {
		window.addEventListener('load', () => {
			navigator.serviceWorker.register('/sw.js').catch((err) => {
				console.warn('[PWA] Service worker registration failed:', err);
			});
		});
	}
});
