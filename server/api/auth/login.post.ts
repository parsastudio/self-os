import { defineEventHandler, readBody, setCookie, createError } from 'h3';
import { LoginInputSchema } from '~/domain/schemas';
import {
	verifyPassword,
	createAuthSession,
	getSessionCookieOptions,
	SESSION_COOKIE_NAME
} from '../../repositories/auth.repo';

const failedLoginAttemptsByIp = new Map<string, { count: number; firstAttemptMs: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

function pruneExpiredLoginAttempts(now: number): void {
	if (failedLoginAttemptsByIp.size < 100) return;
	for (const [key, entry] of failedLoginAttemptsByIp.entries()) {
		if (now - entry.firstAttemptMs >= WINDOW_MS) {
			failedLoginAttemptsByIp.delete(key);
		}
	}
}

export default defineEventHandler(async (event) => {
	const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown';
	const now = Date.now();
	pruneExpiredLoginAttempts(now);
	const record = failedLoginAttemptsByIp.get(ip);

	if (record) {
		if (now - record.firstAttemptMs < WINDOW_MS && record.count >= MAX_ATTEMPTS) {
			const remainingMinutes = Math.max(1, Math.ceil((WINDOW_MS - (now - record.firstAttemptMs)) / 60000));
			throw createError({
				statusCode: 429,
				statusMessage: `تلاش‌های ناموفق بیش از حد مجاز است. لطفاً ${remainingMinutes} دقیقه دیگر تلاش کنید.`
			});
		}
		if (now - record.firstAttemptMs >= WINDOW_MS) {
			failedLoginAttemptsByIp.delete(ip);
		}
	}

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
		const cur = failedLoginAttemptsByIp.get(ip);
		if (!cur || now - cur.firstAttemptMs >= WINDOW_MS) {
			failedLoginAttemptsByIp.set(ip, { count: 1, firstAttemptMs: now });
		} else {
			cur.count++;
		}
		throw createError({ statusCode: 401, statusMessage: 'رمز عبور وارد شده نادرست است' });
	}

	failedLoginAttemptsByIp.delete(ip);
	const session = createAuthSession();
	const isSecure = process.env.NODE_ENV === 'production';

	setCookie(event, SESSION_COOKIE_NAME, session.token, getSessionCookieOptions(isSecure));

	return { success: true };
});
