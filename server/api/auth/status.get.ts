import { defineEventHandler, getCookie, setCookie, deleteCookie } from 'h3';
import {
	isPasswordConfigured,
	validateAndExtendSession,
	getSessionCookieOptions,
	SESSION_COOKIE_NAME
} from '../../repositories/auth.repo';

export default defineEventHandler(async (event) => {
	const configured = await isPasswordConfigured();
	const token = getCookie(event, SESSION_COOKIE_NAME);
	let isAuthenticated = false;
	const isSecure = process.env.NODE_ENV === 'production';

	if (configured && token) {
		const status = await validateAndExtendSession(token, true);
		isAuthenticated = status.valid;

		if (status.valid) {
			setCookie(event, SESSION_COOKIE_NAME, token, getSessionCookieOptions(isSecure));
		} else {
			deleteCookie(event, SESSION_COOKIE_NAME, { path: '/' });
		}
	}

	return {
		isPasswordConfigured: configured,
		isAuthenticated
	};
});
