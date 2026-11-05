import { defineEventHandler, readBody, setCookie, createError } from 'h3';
import { LoginInputSchema } from '~/domain/schemas';
import {
	verifyPassword,
	createAuthSession,
	getSessionCookieOptions,
	SESSION_COOKIE_NAME
} from '../../repositories/auth.repo';

export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	const parsed = LoginInputSchema.safeParse(body);
	if (!parsed.success) {
		throw createError({
			statusCode: 400,
			statusMessage: parsed.error.issues[0]?.message ?? 'رمز عبور الزامی است'
		});
	}

	const isValid = await verifyPassword(parsed.data.password);
	if (!isValid) {
		throw createError({ statusCode: 401, statusMessage: 'رمز عبور وارد شده نادرست است' });
	}

	const session = createAuthSession();
	const isSecure = process.env.NODE_ENV === 'production';

	setCookie(event, SESSION_COOKIE_NAME, session.token, getSessionCookieOptions(isSecure));

	return { success: true };
});
