import { defineEventHandler, getCookie, deleteCookie } from 'h3';
import { revokeAuthSession, SESSION_COOKIE_NAME } from '../../repositories/auth.repo';

export default defineEventHandler((event) => {
	const token = getCookie(event, SESSION_COOKIE_NAME);
	if (token) {
		revokeAuthSession(token);
	}
	deleteCookie(event, SESSION_COOKIE_NAME, { path: '/' });
	return { success: true };
});
