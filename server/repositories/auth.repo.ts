import crypto from 'node:crypto';
import util from 'node:util';
import { eq, lt, ne } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '../database/index';
import { appAuth, authSessions } from '../database/schema';

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

export async function isPasswordConfigured(): Promise<boolean> {
	await ensureDatabaseReady();
	const rows = await db
		.select()
		.from(appAuth)
		.where(eq(appAuth.id, AUTH_SINGLETON_ID))
		.limit(1);
	return Boolean(rows[0]);
}

export async function setupInitialPassword(password: string): Promise<void> {
	await ensureDatabaseReady();
	const saltHex = crypto.randomBytes(16).toString('hex');
	const passwordHash = await hashPasswordWithSalt(password, saltHex);
	const nowIso = new Date().toISOString();

	await db.transaction(async (tx) => {
		const existing = await tx
			.select()
			.from(appAuth)
			.where(eq(appAuth.id, AUTH_SINGLETON_ID))
			.limit(1);

		if (existing[0]) {
			throw new Error('رمز عبور قبلاً تنظیم شده است');
		}

		await tx.insert(appAuth).values({
			id: AUTH_SINGLETON_ID,
			passwordHash,
			passwordSalt: saltHex,
			updatedAtIso: nowIso
		});
	});
}

export async function verifyPassword(password: string): Promise<boolean> {
	await ensureDatabaseReady();
	const rows = await db
		.select()
		.from(appAuth)
		.where(eq(appAuth.id, AUTH_SINGLETON_ID))
		.limit(1);

	const record = rows[0];
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
	await ensureDatabaseReady();
	const saltHex = crypto.randomBytes(16).toString('hex');
	const passwordHash = await hashPasswordWithSalt(newPassword, saltHex);
	const nowIso = new Date().toISOString();

	await db.transaction(async (tx) => {
		await tx
			.update(appAuth)
			.set({
				passwordHash,
				passwordSalt: saltHex,
				updatedAtIso: nowIso
			})
			.where(eq(appAuth.id, AUTH_SINGLETON_ID));

		if (keepRawToken) {
			const currentSessionId = hashSessionToken(keepRawToken);
			await tx.delete(authSessions).where(ne(authSessions.id, currentSessionId));
		} else {
			await tx.delete(authSessions);
		}
	});
}

export async function createAuthSession(): Promise<{
	token: string;
	expiresAt: Date;
}> {
	await ensureDatabaseReady();
	const now = new Date();
	const nowIso = now.toISOString();
	const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
	const expiresAtIso = expiresAt.toISOString();

	await db.delete(authSessions).where(lt(authSessions.expiresAtIso, nowIso));

	const rawToken = crypto.randomBytes(32).toString('hex');
	const sessionId = hashSessionToken(rawToken);

	await db.insert(authSessions).values({
		id: sessionId,
		createdAtIso: nowIso,
		expiresAtIso,
		lastSeenAtIso: nowIso
	});

	return { token: rawToken, expiresAt };
}

export async function validateAndExtendSession(
	rawToken: string,
	forceRefresh = false
): Promise<{
	valid: boolean;
	shouldRefreshCookie: boolean;
	expiresAt: Date;
}> {
	await ensureDatabaseReady();
	const now = new Date();
	const nowIso = now.toISOString();
	const sessionId = hashSessionToken(rawToken);

	const rows = await db
		.select()
		.from(authSessions)
		.where(eq(authSessions.id, sessionId))
		.limit(1);

	const session = rows[0];
	if (!session) {
		return { valid: false, shouldRefreshCookie: false, expiresAt: now };
	}

	if (session.expiresAtIso <= nowIso) {
		await db.delete(authSessions).where(eq(authSessions.id, sessionId));
		return { valid: false, shouldRefreshCookie: false, expiresAt: now };
	}

	const newExpiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
	const lastSeenMs = new Date(session.lastSeenAtIso).getTime();
	const hoursSinceLastSeen = (now.getTime() - lastSeenMs) / (1000 * 60 * 60);

	const shouldRefreshCookie = forceRefresh || hoursSinceLastSeen >= 1;
	if (shouldRefreshCookie) {
		await db
			.update(authSessions)
			.set({
				expiresAtIso: newExpiresAt.toISOString(),
				lastSeenAtIso: nowIso
			})
			.where(eq(authSessions.id, sessionId));
	}

	return {
		valid: true,
		shouldRefreshCookie,
		expiresAt: newExpiresAt
	};
}

export async function revokeAuthSession(rawToken: string): Promise<void> {
	await ensureDatabaseReady();
	const sessionId = hashSessionToken(rawToken);
	await db.delete(authSessions).where(eq(authSessions.id, sessionId));
}
