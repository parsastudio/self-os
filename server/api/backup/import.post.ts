import { defineEventHandler, readBody, getCookie, createError } from 'h3';
import { DatabaseBackupPayloadSchema } from '~/domain/schemas';
import { validateAndExtendSession, SESSION_COOKIE_NAME } from '../../repositories/auth.repo';
import { importDatabaseFromJson } from '../../repositories/backup.repo';

export default defineEventHandler(async (event) => {
	const token = getCookie(event, SESSION_COOKIE_NAME);
	if (!token || !validateAndExtendSession(token).valid) {
		throw createError({ statusCode: 401, statusMessage: 'غیرمجاز' });
	}

	const body = await readBody(event);
	const parsed = DatabaseBackupPayloadSchema.safeParse(body);
	if (!parsed.success) {
		throw createError({
			statusCode: 400,
			statusMessage: `فایل بکاپ نامعتبر است: ${parsed.error.issues[0]?.message ?? ''}`
		});
	}

	const result = importDatabaseFromJson(parsed.data, 'replace');
	return { success: true, importedCount: result.importedRecordsCount };
});
