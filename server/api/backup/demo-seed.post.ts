import { defineEventHandler, readBody, createError } from 'h3';
import { importDatabaseFromJson, removeDemoSeedFromServer } from '~~/server/repositories/backup.repo';
import { buildDemoSeedDataset } from '~/core/demo-seed';
import { DemoSeedActionSchema } from '~/domain/schemas';

export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	const parsed = DemoSeedActionSchema.safeParse(body);
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: 'عملیات نامعتبر است' });
	}

	if (parsed.data.action === 'inject') {
		const dataset = buildDemoSeedDataset();
		const res = await importDatabaseFromJson(dataset, 'merge');
		return { ok: true, count: res.importedRecordsCount };
	}

	const res = await removeDemoSeedFromServer();
	return { ok: true, count: res.removedRecordsCount };
});
