import { defineEventHandler, getCookie, createError } from 'h3';
import { validateAndExtendSession, SESSION_COOKIE_NAME } from '../../repositories/auth.repo';
import { exportDatabaseToJson } from '../../repositories/backup.repo';

export default defineEventHandler((event) => {
	const token = getCookie(event, SESSION_COOKIE_NAME);
	if (!token || !validateAndExtendSession(token).valid) {
		throw createError({ statusCode: 401, statusMessage: 'غیرمجاز' });
	}

	return exportDatabaseToJson();
});
