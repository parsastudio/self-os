import { defineEventHandler, getCookie } from 'h3';
import { isPasswordConfigured, validateAndExtendSession, SESSION_COOKIE_NAME } from '../../repositories/auth.repo';

export default defineEventHandler((event) => {
	const configured = isPasswordConfigured();
	const token = getCookie(event, SESSION_COOKIE_NAME);
	let isAuthenticated = false;

	if (configured && token) {
		const status = validateAndExtendSession(token);
		isAuthenticated = status.valid;
	}

	return {
		isPasswordConfigured: configured,
		isAuthenticated
	};
});
