import crypto from 'node:crypto';
import util from 'node:util';
import { db } from '../database/index';
import { appAuth, authSessions } from '../database/schema';
import { eq, lt, ne } from 'drizzle-orm';

const scryptAsync = util.promisify(crypto.scrypt);

const AUTH_SINGLETON_ID = 'singleton';
const SESSION_DURATION_DAYS = 365;
const SESSION_DURATION_MS = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE_NAME = 'newlife_session';
export const SESSION_MAX_AGE_SECONDS = SESSION_DURATION_DAYS * 24 * 60 * 60;

export function getSessionCookieOptions(isSecureCookie: boolean) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: isSecureCookie,
		maxAge: SESSION_MAX_AGE_SECONDS
	};
}

async function hashPasswordWithSalt(password: string, saltHex: string): Promise<string> {
	const derivedKey = (await scryptAsync(password, Buffer.from(saltHex, 'hex'), 64)) as Buffer;
	return derivedKey.toString('hex');
}

function hashSessionToken(rawToken: string): string {
	return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function isPasswordConfigured(): boolean {
	const record = db
		.select()
		.from(appAuth)
		.where(eq(appAuth.id, AUTH_SINGLETON_ID))
		.get();
	return Boolean(record);
}

export async function setupInitialPassword(password: string): Promise<void> {
	const saltHex = crypto.randomBytes(16).toString('hex');
	const passwordHash = await hashPasswordWithSalt(password, saltHex);
	const nowIso = new Date().toISOString();

	db.transaction((tx) => {
		const existing = tx
			.select()
			.from(appAuth)
			.where(eq(appAuth.id, AUTH_SINGLETON_ID))
			.get();
		if (existing) {
			throw new Error('رمز عبور قبلاً تنظیم شده است');
		}
		tx.insert(appAuth)
			.values({
				id: AUTH_SINGLETON_ID,
				passwordHash,
				passwordSalt: saltHex,
				updatedAtIso: nowIso
			})
			.run();
	});
}

export async function verifyPassword(password: string): Promise<boolean> {
	const record = db
		.select()
		.from(appAuth)
		.where(eq(appAuth.id, AUTH_SINGLETON_ID))
		.get();

	if (!record) return false;

	const candidateHash = await hashPasswordWithSalt(password, record.passwordSalt);
	const expectedBuf = Buffer.from(record.passwordHash, 'hex');
	const candidateBuf = Buffer.from(candidateHash, 'hex');

	if (expectedBuf.length !== candidateBuf.length) return false;
	return crypto.timingSafeEqual(expectedBuf, candidateBuf);
}

export async function changeMasterPassword(
	newPassword: string,
	keepRawToken?: string | null
): Promise<void> {
	const saltHex = crypto.randomBytes(16).toString('hex');
	const passwordHash = await hashPasswordWithSalt(newPassword, saltHex);
	const nowIso = new Date().toISOString();

	db.transaction((tx) => {
		tx.update(appAuth)
			.set({
				passwordHash,
				passwordSalt: saltHex,
				updatedAtIso: nowIso
			})
			.where(eq(appAuth.id, AUTH_SINGLETON_ID))
			.run();

		if (keepRawToken) {
			const currentSessionId = hashSessionToken(keepRawToken);
			tx.delete(authSessions).where(ne(authSessions.id, currentSessionId)).run();
		} else {
			tx.delete(authSessions).run();
		}
	});
}

export function createAuthSession(): {
	token: string;
	expiresAt: Date;
} {
	const now = new Date();
	const nowIso = now.toISOString();
	const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
	const expiresAtIso = expiresAt.toISOString();

	db.delete(authSessions).where(lt(authSessions.expiresAtIso, nowIso)).run();

	const rawToken = crypto.randomBytes(32).toString('hex');
	const sessionId = hashSessionToken(rawToken);

	db.insert(authSessions)
		.values({
			id: sessionId,
			createdAtIso: nowIso,
			expiresAtIso,
			lastSeenAtIso: nowIso
		})
		.run();

	return { token: rawToken, expiresAt };
}

export function validateAndExtendSession(
	rawToken: string,
	forceRefresh = false
): {
	valid: boolean;
	shouldRefreshCookie: boolean;
	expiresAt: Date;
} {
	const now = new Date();
	const nowIso = now.toISOString();
	const sessionId = hashSessionToken(rawToken);

	const session = db
		.select()
		.from(authSessions)
		.where(eq(authSessions.id, sessionId))
		.get();

	if (!session) {
		return { valid: false, shouldRefreshCookie: false, expiresAt: now };
	}

	if (session.expiresAtIso <= nowIso) {
		db.delete(authSessions).where(eq(authSessions.id, sessionId)).run();
		return { valid: false, shouldRefreshCookie: false, expiresAt: now };
	}

	const newExpiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
	const lastSeenMs = new Date(session.lastSeenAtIso).getTime();
	const hoursSinceLastSeen = (now.getTime() - lastSeenMs) / (1000 * 60 * 60);

	const shouldRefreshCookie = forceRefresh || hoursSinceLastSeen >= 1;
	if (shouldRefreshCookie) {
		db.update(authSessions)
			.set({
				expiresAtIso: newExpiresAt.toISOString(),
				lastSeenAtIso: nowIso
			})
			.where(eq(authSessions.id, sessionId))
			.run();
	}

	return {
		valid: true,
		shouldRefreshCookie,
		expiresAt: newExpiresAt
	};
}

export function revokeAuthSession(rawToken: string): void {
	const sessionId = hashSessionToken(rawToken);
	db.delete(authSessions).where(eq(authSessions.id, sessionId)).run();
}
