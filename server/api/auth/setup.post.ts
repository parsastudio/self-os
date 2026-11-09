import { defineEventHandler, readBody, setCookie, createError } from 'h3';
import { SetupPasswordInputSchema } from '~/domain/schemas';
import {
	isPasswordConfigured,
	setupInitialPassword,
	createAuthSession,
	getSessionCookieOptions,
	resolveIsSecureCookie,
	SESSION_COOKIE_NAME
} from '~~/server/repositories/auth.repo';

export default defineEventHandler(async (event) => {
	if (await isPasswordConfigured()) {
		throw createError({ statusCode: 400, statusMessage: 'رمز عبور قبلاً تنظیم شده است' });
	}

	const body = await readBody(event);
	const parsed = SetupPasswordInputSchema.safeParse(body);
	if (!parsed.success) {
		throw createError({
			statusCode: 400,
			statusMessage: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است'
		});
	}

	if (parsed.data.website && parsed.data.website.trim().length > 0) {
		await new Promise((resolve) => setTimeout(resolve, 2000));
		throw createError({ statusCode: 400, statusMessage: 'درخواست نامعتبر است' });
	}

	await setupInitialPassword(parsed.data.password);
	const session = await createAuthSession();
	const isSecure = resolveIsSecureCookie(event);

	setCookie(event, SESSION_COOKIE_NAME, session.token, getSessionCookieOptions(isSecure));

	return { success: true };
});
