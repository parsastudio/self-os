import { defineEventHandler } from 'h3';
import { clearAllDatabaseRecords } from '~~/server/repositories/backup.repo';

export default defineEventHandler(async () => {
	await clearAllDatabaseRecords();
	return { ok: true };
});
