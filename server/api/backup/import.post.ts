import { defineEventHandler, readBody, createError } from 'h3';
import { DatabaseBackupPayloadSchema } from '~/domain/schemas';
import { importDatabaseFromJson } from '~~/server/repositories/backup.repo';

export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	const parsed = DatabaseBackupPayloadSchema.safeParse(body);
	if (!parsed.success) {
		throw createError({
			statusCode: 400,
			statusMessage: `فایل بکاپ نامعتبر است: ${parsed.error.issues[0]?.message ?? ''}`
		});
	}

	const result = await importDatabaseFromJson(parsed.data, 'merge');
	return {
		success: true,
		importedCount: result.importedRecordsCount,
		skippedCount: result.skippedDuplicatesCount
	};
});
