import { defineEventHandler, readBody, getCookie, createError } from 'h3';
import { ChangePasswordInputSchema } from '~/domain/schemas';
import {
	validateAndExtendSession,
	changeMasterPassword,
	SESSION_COOKIE_NAME
} from '../../repositories/auth.repo';

export default defineEventHandler(async (event) => {
	const token = getCookie(event, SESSION_COOKIE_NAME);
	if (!token || !validateAndExtendSession(token).valid) {
		throw createError({ statusCode: 401, statusMessage: 'ابتدا وارد حساب کاربری شوید' });
	}

	const body = await readBody(event);
	const parsed = ChangePasswordInputSchema.safeParse(body);
	if (!parsed.success) {
		throw createError({
			statusCode: 400,
			statusMessage: parsed.error.issues[0]?.message ?? 'اطلاعات وارد شده نامعتبر است'
		});
	}

	const ok = await changeMasterPassword(parsed.data.currentPassword, parsed.data.newPassword);
	if (!ok) {
		throw createError({ statusCode: 400, statusMessage: 'رمز عبور فعلی نادرست است' });
	}

	return { success: true };
});
