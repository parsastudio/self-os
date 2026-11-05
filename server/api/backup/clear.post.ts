import { defineEventHandler } from 'h3';
import { clearAllDatabaseRecords } from '../../repositories/backup.repo';

export default defineEventHandler(async () => {
	await clearAllDatabaseRecords();
	return { ok: true };
});
