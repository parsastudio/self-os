import { defineEventHandler, getCookie, deleteCookie } from 'h3';
import { revokeAuthSession, SESSION_COOKIE_NAME } from '../../repositories/auth.repo';

export default defineEventHandler(async (event) => {
	const token = getCookie(event, SESSION_COOKIE_NAME);
	if (token) {
		await revokeAuthSession(token);
	}
	deleteCookie(event, SESSION_COOKIE_NAME, { path: '/' });
	return { success: true };
});
