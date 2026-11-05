import { defineEventHandler, getCookie, setCookie, deleteCookie, createError } from 'h3';
import {
	isPasswordConfigured,
	validateAndExtendSession,
	getSessionCookieOptions,
	SESSION_COOKIE_NAME
} from '../repositories/auth.repo';

export default defineEventHandler((event) => {
	const pathname = event.path || '';

	if (
		pathname.startsWith('/_nuxt') ||
		pathname.startsWith('/api/version') ||
		pathname.startsWith('/api/auth/') ||
		pathname.endsWith('.woff2') ||
		pathname.endsWith('.svg') ||
		pathname.endsWith('.webmanifest')
	) {
		return;
	}

	const passwordConfigured = isPasswordConfigured();
	const rawToken = getCookie(event, SESSION_COOKIE_NAME) || null;
	let isAuthenticated = false;

	const isSecure = process.env.NODE_ENV === 'production';

	if (passwordConfigured && rawToken) {
		const sessionStatus = validateAndExtendSession(rawToken);
		isAuthenticated = sessionStatus.valid;

		if (sessionStatus.valid && sessionStatus.shouldRefreshCookie) {
			setCookie(event, SESSION_COOKIE_NAME, rawToken, getSessionCookieOptions(isSecure));
		} else if (!sessionStatus.valid) {
			deleteCookie(event, SESSION_COOKIE_NAME, { path: '/' });
		}
	}

	event.context.isAuthenticated = isAuthenticated;
	event.context.isPasswordConfigured = passwordConfigured;

	if (pathname.startsWith('/api/sync') && passwordConfigured && !isAuthenticated) {
		throw createError({
			statusCode: 401,
			statusMessage: 'Unauthorized'
		});
	}
});
