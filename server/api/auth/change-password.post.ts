import { defineEventHandler, readBody, setCookie, createError } from 'h3';
import { ChangePasswordInputSchema } from '~/domain/schemas';
import {
	changeMasterPassword,
	getSessionCookieOptions,
	SESSION_COOKIE_NAME
} from '../../repositories/auth.repo';

export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	const parsed = ChangePasswordInputSchema.safeParse(body);
	if (!parsed.success) {
		throw createError({
			statusCode: 400,
			statusMessage: parsed.error.issues[0]?.message ?? 'اطلاعات وارد شده نامعتبر است'
		});
	}

	const currentToken = (event.context.sessionToken as string | null) ?? null;
	await changeMasterPassword(parsed.data.newPassword, currentToken);

	if (currentToken) {
		const isSecure = process.env.NODE_ENV === 'production';
		setCookie(event, SESSION_COOKIE_NAME, currentToken, getSessionCookieOptions(isSecure));
	}

	return { success: true };
});
