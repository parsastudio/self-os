import { defineEventHandler, readBody, setCookie, createError } from 'h3';
import { SetupPasswordInputSchema } from '~/domain/schemas';
import {
	isPasswordConfigured,
	setupInitialPassword,
	createAuthSession,
	getSessionCookieOptions,
	SESSION_COOKIE_NAME
} from '../../repositories/auth.repo';

export default defineEventHandler(async (event) => {
	if (isPasswordConfigured()) {
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

	await setupInitialPassword(parsed.data.password);
	const session = createAuthSession();
	const isSecure = process.env.NODE_ENV === 'production';

	setCookie(event, SESSION_COOKIE_NAME, session.token, getSessionCookieOptions(isSecure));

	return { success: true };
});
