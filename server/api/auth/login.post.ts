import { defineEventHandler, readBody, setCookie, createError, getRequestHeader, type H3Event } from 'h3';
import { LoginInputSchema } from '~/domain/schemas';
import {
	verifyPassword,
	createAuthSession,
	getSessionCookieOptions,
	resolveIsSecureCookie,
	SESSION_COOKIE_NAME
} from '~~/server/repositories/auth.repo';

const failedLoginAttemptsByIp = new Map<
	string,
	{ failedCount: number; lastAttemptMs: number; lockedUntilMs: number }
>();
const RESET_WINDOW_MS = 30 * 60 * 1000;
const LOCKOUT_THRESHOLD_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

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

const MAX_TRACKED_IPS = 1000;

function pruneExpiredLoginAttempts(now: number): void {
	if (failedLoginAttemptsByIp.size < 100) return;
	for (const [key, entry] of failedLoginAttemptsByIp.entries()) {
		if (entry.lockedUntilMs <= now && now - entry.lastAttemptMs >= RESET_WINDOW_MS) {
			failedLoginAttemptsByIp.delete(key);
		}
	}
	if (failedLoginAttemptsByIp.size > MAX_TRACKED_IPS) {
		let oldestKey: string | null = null;
		let oldestTimestamp = Infinity;
		for (const [key, entry] of failedLoginAttemptsByIp.entries()) {
			if (entry.lockedUntilMs <= now && entry.lastAttemptMs < oldestTimestamp) {
				oldestTimestamp = entry.lastAttemptMs;
				oldestKey = key;
			}
		}
		if (oldestKey) {
			failedLoginAttemptsByIp.delete(oldestKey);
		}
	}
}

function isPrivateOrLoopbackIp(ip: string): boolean {
	const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
	if (
		normalized === '127.0.0.1' ||
		normalized === '::1' ||
		normalized === 'local' ||
		normalized.startsWith('127.') ||
		normalized.startsWith('10.') ||
		normalized.startsWith('192.168.') ||
		normalized.startsWith('fc') ||
		normalized.startsWith('fd') ||
		normalized.startsWith('fe80:')
	) {
		return true;
	}
	const match172 = normalized.match(/^172\.(\d{1,3})\./);
	if (match172) {
		const secondOctet = Number(match172[1]);
		if (secondOctet >= 16 && secondOctet <= 31) {
			return true;
		}
	}
	return false;
}

function resolveClientRateLimitKey(event: H3Event): string {
	const socketIp = (event.node.req.socket?.remoteAddress || 'local').trim().slice(0, 45);
	if (!isPrivateOrLoopbackIp(socketIp)) {
		return socketIp;
	}

	const cfConnectingIp = getRequestHeader(event, 'cf-connecting-ip')?.trim().slice(0, 45);
	const realIpHeader = getRequestHeader(event, 'x-real-ip')?.trim().slice(0, 45);
	const forwardedParts = getRequestHeader(event, 'x-forwarded-for')
		?.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
	const firstPublicForwardedIp =
		forwardedParts?.find((ip) => !isPrivateOrLoopbackIp(ip))?.slice(0, 45) ??
		forwardedParts?.[0]?.slice(0, 45);

	const resolvedClientIp = cfConnectingIp || realIpHeader || firstPublicForwardedIp;
	if (resolvedClientIp) {
		return `proxy:${resolvedClientIp}`;
	}
	return socketIp;
}

export default defineEventHandler(async (event) => {
	const ip = resolveClientRateLimitKey(event);
	const now = Date.now();
	pruneExpiredLoginAttempts(now);

	const existingRecord = failedLoginAttemptsByIp.get(ip);
	if (existingRecord && existingRecord.lockedUntilMs > now) {
		const remainingMinutes = Math.max(
			1,
			Math.ceil((existingRecord.lockedUntilMs - now) / (60 * 1000))
		);
		throw createError({
			statusCode: 429,
			statusMessage: `به دلیل تلاش‌های ناموفق متوالی، ورود به مدت ${remainingMinutes} دقیقه مسدود شده است`
		});
	}
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
		const isNowLocked = updatedFailures >= LOCKOUT_THRESHOLD_ATTEMPTS;
		failedLoginAttemptsByIp.set(ip, {
			failedCount: updatedFailures,
			lastAttemptMs: Date.now(),
			lockedUntilMs: isNowLocked ? Date.now() + LOCKOUT_DURATION_MS : 0
		});

		throw createError({
			statusCode: isNowLocked ? 429 : 401,
			statusMessage: isNowLocked
				? 'تعداد تلاش‌های ناموفق بیش از حد مجاز است. لطفاً ۱۵ دقیقه دیگر تلاش کنید.'
				: 'رمز عبور وارد شده نادرست است',
			data: {
				failedAttempts: updatedFailures,
				nextDelaySeconds: resolveProgressiveDelayMs(updatedFailures + 1) / 1000
			}
		});
	}

	failedLoginAttemptsByIp.delete(ip);
	const session = await createAuthSession();
	const isSecure = resolveIsSecureCookie(event);

	setCookie(event, SESSION_COOKIE_NAME, session.token, getSessionCookieOptions(isSecure));

	return { success: true };
});
