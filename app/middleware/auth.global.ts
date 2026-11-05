import { defineNuxtRouteMiddleware, navigateTo } from '#app';
import { useClientAuth } from '~/composables/useClientAuth';

export default defineNuxtRouteMiddleware(async (to) => {
	if (import.meta.server) return;

	const clientAuth = useClientAuth();
	const isLoginPage = to.path.startsWith('/login');

	let serverAuth: boolean | undefined;
	let serverPasswordConfigured: boolean | undefined;

	try {
		if (navigator.onLine) {
			const res = await fetch('/api/auth/status');
			if (res.ok) {
				const data = await res.json();
				serverAuth = data.isAuthenticated;
				serverPasswordConfigured = data.isPasswordConfigured;
			}
		}
	} catch {
		// ignore network error
	}

	const authState = await clientAuth.checkAuth(serverAuth, serverPasswordConfigured);

	if (!authState.isAuthenticated && !isLoginPage) {
		const redirectTarget = to.fullPath;
		const query = redirectTarget && redirectTarget !== '/' ? { redirectTo: redirectTarget } : undefined;
		return navigateTo({ path: '/login', query });
	}

	if (authState.isAuthenticated && isLoginPage) {
		return navigateTo('/');
	}
});
