import { defineEventHandler } from 'h3';
import { clearAllDatabaseRecords } from '../../repositories/backup.repo';

export default defineEventHandler(() => {
	clearAllDatabaseRecords();
	return { ok: true };
});
