import { defineEventHandler, readBody, createError } from 'h3';
import { ChangePasswordInputSchema } from '~/domain/schemas';
import { changeMasterPassword } from '../../repositories/auth.repo';

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
	const ok = await changeMasterPassword(
		parsed.data.currentPassword,
		parsed.data.newPassword,
		currentToken
	);
	if (!ok) {
		throw createError({ statusCode: 400, statusMessage: 'رمز عبور فعلی نادرست است' });
	}

	return { success: true };
});
