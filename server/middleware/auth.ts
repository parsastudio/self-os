import { defineEventHandler, getCookie, setCookie, deleteCookie, createError } from 'h3';
import {
	isPasswordConfigured,
	validateAndExtendSession,
	getSessionCookieOptions,
	SESSION_COOKIE_NAME
} from '../repositories/auth.repo';

export default defineEventHandler((event) => {
	const pathname = event.path || '';

	const isPublicAuthApi =
		pathname === '/api/auth/login' ||
		pathname === '/api/auth/setup' ||
		pathname === '/api/auth/status' ||
		pathname === '/api/auth/logout';

	if (
		pathname.startsWith('/_nuxt') ||
		isPublicAuthApi ||
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
	event.context.sessionToken = rawToken;

	if (pathname.startsWith('/api/') && passwordConfigured && !isAuthenticated) {
		throw createError({
			statusCode: 401,
			statusMessage: 'ابتدا وارد حساب کاربری شوید'
		});
	}
});
