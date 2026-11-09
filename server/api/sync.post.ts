import { defineEventHandler, readBody, createError } from 'h3';
import { extractApiErrorInfo, SyncRequestPayloadSchema } from '~/domain/schemas';
import { processClientSyncRequest } from '../repositories/sync.repo';

export default defineEventHandler(async (event) => {
	try {
		const rawBody = await readBody(event);
		const parsed = SyncRequestPayloadSchema.safeParse(rawBody);

		if (!parsed.success) {
			throw createError({
				statusCode: 400,
				statusMessage: parsed.error.issues[0]?.message ?? 'فرمت بسته همگام‌سازی نامعتبر است'
			});
		}

		const config = useRuntimeConfig();
		const appVersion = (config.public?.appVersion as string) || '0.0.1';

		return await processClientSyncRequest(parsed.data, appVersion);
	} catch (err: unknown) {
		const info = extractApiErrorInfo(err, 'خطا در پردازش همگام‌سازی با سرور');
		throw createError({
			statusCode: info.statusCode,
			statusMessage: info.message
		});
	}
});
