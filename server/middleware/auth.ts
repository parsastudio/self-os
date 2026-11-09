import { defineEventHandler, getCookie, setCookie, deleteCookie, createError } from 'h3';
import {
	isPasswordConfigured,
	validateAndExtendSession,
	getSessionCookieOptions,
	SESSION_COOKIE_NAME
} from '../repositories/auth.repo';

export default defineEventHandler(async (event) => {
	const pathname = event.path || '';

	if (!pathname.startsWith('/api/')) {
		return;
	}

	const isPublicAuthApi =
		pathname === '/api/auth/login' ||
		pathname === '/api/auth/setup' ||
		pathname === '/api/auth/status' ||
		pathname === '/api/auth/logout';

	if (isPublicAuthApi) {
		return;
	}

	const passwordConfigured = await isPasswordConfigured();
	const rawToken = getCookie(event, SESSION_COOKIE_NAME) || null;
	let isAuthenticated = false;

	const isSecure = process.env.NODE_ENV === 'production';

	if (passwordConfigured && rawToken) {
		const sessionStatus = await validateAndExtendSession(rawToken);
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

	if (!passwordConfigured || !isAuthenticated) {
		throw createError({
			statusCode: 401,
			statusMessage: passwordConfigured
				? 'ابتدا وارد حساب کاربری شوید'
				: 'ابتدا رمز عبور اولیه سیستم را تنظیم کنید'
		});
	}
});
