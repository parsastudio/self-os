import { defineEventHandler, readBody, setCookie, createError } from 'h3';
import { LoginInputSchema } from '~/domain/schemas';
import {
	verifyPassword,
	createAuthSession,
	getSessionCookieOptions,
	SESSION_COOKIE_NAME
} from '../../repositories/auth.repo';

const failedLoginAttemptsByIp = new Map<string, { failedCount: number; lastAttemptMs: number }>();
const RESET_WINDOW_MS = 30 * 60 * 1000;

function resolveProgressiveDelayMs(attemptNumber: number): number {
	if (attemptNumber <= 1) return 0;
	if (attemptNumber === 2) return 2000;
	if (attemptNumber === 3) return 3000;
	return 5000;
}

function sleep(ms: number): Promise<void> {
	if (ms <= 0) return Promise.resolve();
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function pruneExpiredLoginAttempts(now: number): void {
	if (failedLoginAttemptsByIp.size < 100) return;
	for (const [key, entry] of failedLoginAttemptsByIp.entries()) {
		if (now - entry.lastAttemptMs >= RESET_WINDOW_MS) {
			failedLoginAttemptsByIp.delete(key);
		}
	}
}

export default defineEventHandler(async (event) => {
	const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown';
	const now = Date.now();
	pruneExpiredLoginAttempts(now);

	const existingRecord = failedLoginAttemptsByIp.get(ip);
	if (existingRecord && now - existingRecord.lastAttemptMs >= RESET_WINDOW_MS) {
		failedLoginAttemptsByIp.delete(ip);
	}

	const body = await readBody(event);
	const parsed = LoginInputSchema.safeParse(body);
	if (!parsed.success) {
		throw createError({
			statusCode: 400,
			statusMessage: parsed.error.issues[0]?.message ?? 'رمز عبور الزامی است'
		});
	}

	// Honeypot check: reject bots that fill the hidden field
	if (parsed.data.website && parsed.data.website.trim().length > 0) {
		await sleep(3000);
		throw createError({
			statusCode: 401,
			statusMessage: 'رمز عبور وارد شده نادرست است'
		});
	}

	const previousFailures = failedLoginAttemptsByIp.get(ip)?.failedCount ?? 0;
	const currentAttemptNumber = previousFailures + 1;
	const requiredDelayMs = resolveProgressiveDelayMs(currentAttemptNumber);

	const startedAt = Date.now();
	const isValid = await verifyPassword(parsed.data.password);
	const elapsedMs = Date.now() - startedAt;

	if (requiredDelayMs > elapsedMs) {
		await sleep(requiredDelayMs - elapsedMs);
	}

	if (!isValid) {
		const updatedFailures = previousFailures + 1;
		failedLoginAttemptsByIp.set(ip, {
			failedCount: updatedFailures,
			lastAttemptMs: Date.now()
		});

		throw createError({
			statusCode: 401,
			statusMessage: 'رمز عبور وارد شده نادرست است',
			data: {
				failedAttempts: updatedFailures,
				nextDelaySeconds: resolveProgressiveDelayMs(updatedFailures + 1) / 1000
			}
		});
	}

	failedLoginAttemptsByIp.delete(ip);
	const session = createAuthSession();
	const isSecure = process.env.NODE_ENV === 'production';

	setCookie(event, SESSION_COOKIE_NAME, session.token, getSessionCookieOptions(isSecure));

	return { success: true };
});
