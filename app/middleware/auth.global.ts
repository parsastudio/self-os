import { defineNuxtRouteMiddleware, navigateTo } from '#app';
import { useClientAuth } from '~/composables/useClientAuth';

export default defineNuxtRouteMiddleware(async (to) => {
	if (import.meta.server) return;

	const clientAuth = useClientAuth();
	const isLoginPage = to.path.startsWith('/login');

	const authState = await clientAuth.ensureSessionChecked();

	if (!authState.isAuthenticated && !isLoginPage) {
		const redirectTarget = to.fullPath;
		const query = redirectTarget && redirectTarget !== '/' ? { redirectTo: redirectTarget } : undefined;
		return navigateTo({ path: '/login', query });
	}

	if (authState.isAuthenticated && isLoginPage) {
		return navigateTo('/');
	}
});
