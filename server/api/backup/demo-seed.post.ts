import { defineEventHandler, readBody, createError } from 'h3';
import { z } from 'zod';
import { importDatabaseFromJson, removeDemoSeedFromServer } from '../../repositories/backup.repo';
import { buildDemoSeedDataset } from '~/domain/demo-seed';

const DemoSeedActionSchema = z.object({
	action: z.enum(['inject', 'remove'])
});

export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	const parsed = DemoSeedActionSchema.safeParse(body);
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: 'عملیات نامعتبر است' });
	}

	if (parsed.data.action === 'inject') {
		const dataset = buildDemoSeedDataset();
		const res = importDatabaseFromJson(dataset, 'merge');
		return { ok: true, count: res.importedRecordsCount };
	}

	const res = removeDemoSeedFromServer();
	return { ok: true, count: res.removedRecordsCount };
});
