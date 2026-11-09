import crypto from 'node:crypto';
import { eq, inArray, lt, notInArray } from 'drizzle-orm';
import {
	deleteCookie,
	getCookie,
	getRequestHeader,
	getRequestProtocol,
	setCookie,
	type H3Event
} from 'h3';
import { db, ensureDatabaseReady } from '~~/server/database/index';
import { appAuth, authSessions } from '~~/server/database/schema';

const AUTH_SINGLETON_ID = 'singleton';
const SESSION_DURATION_DAYS = 365;
const SESSION_DURATION_MS = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

const SCRYPT_V2_PREFIX = 'scrypt$v2$';
const SCRYPT_V2_PARAMS = {
	N: 65536,
	r: 8,
	p: 1,
	maxmem: 128 * 1024 * 1024
} as const;
const SCRYPT_KEYLEN = 64;
const PASSWORD_SALT_BYTES = 32;
const SESSION_TOKEN_HEX_REGEX = /^[a-f0-9]{64}$/i;
const DEFAULT_SESSION_HMAC_DOMAIN_KEY = 'newlife-personal-os-session-v2-domain-key';

function getActiveSessionHmacKey(): string {
	const envSecret = process.env.SESSION_HMAC_SECRET?.trim();
	if (envSecret && envSecret.length >= 16) {
		return envSecret;
	}
	const dbUrlFallback = process.env.DATABASE_URL?.trim();
	if (dbUrlFallback && dbUrlFallback.length >= 16) {
		return crypto
			.createHmac('sha256', DEFAULT_SESSION_HMAC_DOMAIN_KEY)
			.update(dbUrlFallback)
			.digest('hex');
	}
	return DEFAULT_SESSION_HMAC_DOMAIN_KEY;
}

export const SESSION_COOKIE_NAME = 'newlife_session';
export const SESSION_MAX_AGE_SECONDS = SESSION_DURATION_DAYS * 24 * 60 * 60;

export function resolveIsSecureCookie(event: H3Event): boolean {
	if (process.env.COOKIE_SECURE === 'false') return false;
	if (process.env.COOKIE_SECURE === 'true') return true;
	const proto = getRequestProtocol(event, { xForwardedProto: true });
	if (proto === 'https') return true;
	const forwardedProto = getRequestHeader(event, 'x-forwarded-proto');
	if (forwardedProto?.split(',')[0]?.trim().toLowerCase() === 'https') return true;
	return false;
}

export function getSessionCookieOptions(isSecureCookie: boolean) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: isSecureCookie,
		maxAge: SESSION_MAX_AGE_SECONDS
	};
}

function runScryptAsync(
	password: string,
	saltBuffer: Buffer,
	keylen: number,
	options: crypto.ScryptOptions = {}
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		crypto.scrypt(password, saltBuffer, keylen, options, (err, derivedKey) => {
			if (err) reject(err);
			else resolve(derivedKey);
		});
	});
}

async function hashPasswordV2(password: string, saltHex: string): Promise<string> {
	const normalizedPassword = password.normalize('NFKC');
	const derivedKey = await runScryptAsync(
		normalizedPassword,
		Buffer.from(saltHex, 'hex'),
		SCRYPT_KEYLEN,
		SCRYPT_V2_PARAMS
	);
	return `${SCRYPT_V2_PREFIX}${derivedKey.toString('hex')}`;
}

async function hashPasswordLegacyV1(password: string, saltHex: string): Promise<string> {
	const derivedKey = await runScryptAsync(password, Buffer.from(saltHex, 'hex'), SCRYPT_KEYLEN);
	return derivedKey.toString('hex');
}

function isWellFormedSessionToken(rawToken: string): boolean {
	return SESSION_TOKEN_HEX_REGEX.test(rawToken);
}

function hashSessionTokenV2(rawToken: string, hmacKey = getActiveSessionHmacKey()): string {
	return crypto
		.createHmac('sha256', hmacKey)
		.update(rawToken.toLowerCase())
		.digest('hex');
}

function hashSessionTokenLegacyV1(rawToken: string): string {
	return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function getCandidateSessionIds(rawToken: string): {
	primaryId: string;
	allCandidateIds: string[];
} {
	const activeKey = getActiveSessionHmacKey();
	const primaryId = hashSessionTokenV2(rawToken, activeKey);
	const defaultDomainId = hashSessionTokenV2(rawToken, DEFAULT_SESSION_HMAC_DOMAIN_KEY);
	const legacyV1Id = hashSessionTokenLegacyV1(rawToken);
	const allCandidateIds = Array.from(new Set([primaryId, defaultDomainId, legacyV1Id]));
	return { primaryId, allCandidateIds };
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
	const saltHex = crypto.randomBytes(PASSWORD_SALT_BYTES).toString('hex');
	const passwordHash = await hashPasswordV2(password, saltHex);
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

	const isV2 = record.passwordHash.startsWith(SCRYPT_V2_PREFIX);

	if (isV2) {
		const storedHex = record.passwordHash.slice(SCRYPT_V2_PREFIX.length);
		const candidateFull = await hashPasswordV2(password, record.passwordSalt);
		const candidateHex = candidateFull.slice(SCRYPT_V2_PREFIX.length);

		const expectedBuf = Buffer.from(storedHex, 'hex');
		const candidateBuf = Buffer.from(candidateHex, 'hex');

		if (expectedBuf.length !== candidateBuf.length) return false;
		return crypto.timingSafeEqual(expectedBuf, candidateBuf);
	}

	// Legacy v1 verification + seamless background upgrade to scrypt$v2
	const legacyCandidateHex = await hashPasswordLegacyV1(password, record.passwordSalt);
	const expectedBuf = Buffer.from(record.passwordHash, 'hex');
	const candidateBuf = Buffer.from(legacyCandidateHex, 'hex');

	if (expectedBuf.length !== candidateBuf.length) return false;
	const isLegacyMatch = crypto.timingSafeEqual(expectedBuf, candidateBuf);

	if (isLegacyMatch) {
		try {
			const newSaltHex = crypto.randomBytes(PASSWORD_SALT_BYTES).toString('hex');
			const upgradedHash = await hashPasswordV2(password, newSaltHex);
			await db
				.update(appAuth)
				.set({
					passwordHash: upgradedHash,
					passwordSalt: newSaltHex,
					updatedAtIso: new Date().toISOString()
				})
				.where(eq(appAuth.id, AUTH_SINGLETON_ID));
		} catch {
			// Ignore non-fatal background rehash errors
		}
	}

	return isLegacyMatch;
}

export async function changeMasterPassword(
	newPassword: string,
	keepRawToken?: string | null
): Promise<void> {
	await ensureDatabaseReady();
	const saltHex = crypto.randomBytes(PASSWORD_SALT_BYTES).toString('hex');
	const passwordHash = await hashPasswordV2(newPassword, saltHex);
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

		if (keepRawToken && isWellFormedSessionToken(keepRawToken)) {
			const { allCandidateIds } = getCandidateSessionIds(keepRawToken);
			await tx.delete(authSessions).where(notInArray(authSessions.id, allCandidateIds));
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
	const sessionId = hashSessionTokenV2(rawToken);

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
	if (!isWellFormedSessionToken(rawToken)) {
		return { valid: false, shouldRefreshCookie: false, expiresAt: now };
	}
	const nowIso = now.toISOString();
	const { primaryId, allCandidateIds } = getCandidateSessionIds(rawToken);

	const rows = await db
		.select()
		.from(authSessions)
		.where(inArray(authSessions.id, allCandidateIds))
		.limit(1);

	const session = rows[0];
	if (!session) {
		return { valid: false, shouldRefreshCookie: false, expiresAt: now };
	}

	if (session.expiresAtIso <= nowIso) {
		await db.delete(authSessions).where(lt(authSessions.expiresAtIso, nowIso));
		return { valid: false, shouldRefreshCookie: false, expiresAt: now };
	}

	const newExpiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
	const lastSeenMs = new Date(session.lastSeenAtIso).getTime();
	const hoursSinceLastSeen = (now.getTime() - lastSeenMs) / (1000 * 60 * 60);

	const needsKeyUpgrade = session.id !== primaryId;
	const shouldRefreshCookie = forceRefresh || hoursSinceLastSeen >= 1 || needsKeyUpgrade;

	if (needsKeyUpgrade) {
		await db.transaction(async (tx) => {
			await tx.delete(authSessions).where(eq(authSessions.id, session.id));
			await tx
				.insert(authSessions)
				.values({
					id: primaryId,
					createdAtIso: session.createdAtIso,
					expiresAtIso: newExpiresAt.toISOString(),
					lastSeenAtIso: nowIso
				})
				.onConflictDoNothing();
		});
	} else if (shouldRefreshCookie) {
		await db
			.update(authSessions)
			.set({
				expiresAtIso: newExpiresAt.toISOString(),
				lastSeenAtIso: nowIso
			})
			.where(eq(authSessions.id, session.id));
		await db.delete(authSessions).where(lt(authSessions.expiresAtIso, nowIso));
	}

	return {
		valid: true,
		shouldRefreshCookie,
		expiresAt: newExpiresAt
	};
}

export async function revokeAuthSession(rawToken: string): Promise<void> {
	if (!isWellFormedSessionToken(rawToken)) return;
	await ensureDatabaseReady();
	const { allCandidateIds } = getCandidateSessionIds(rawToken);
	await db.delete(authSessions).where(inArray(authSessions.id, allCandidateIds));
}

export async function resolveEventAuthSession(
	event: H3Event,
	forceRefreshCookie = false
): Promise<{
	isPasswordConfigured: boolean;
	isAuthenticated: boolean;
	sessionToken: string | null;
}> {
	const passwordConfigured = await isPasswordConfigured();
	const rawToken = getCookie(event, SESSION_COOKIE_NAME) || null;
	let isAuthenticated = false;
	const isSecure = resolveIsSecureCookie(event);

	if (passwordConfigured && rawToken) {
		const sessionStatus = await validateAndExtendSession(rawToken, forceRefreshCookie);
		isAuthenticated = sessionStatus.valid;

		if (sessionStatus.valid && (forceRefreshCookie || sessionStatus.shouldRefreshCookie)) {
			setCookie(event, SESSION_COOKIE_NAME, rawToken, getSessionCookieOptions(isSecure));
		} else if (!sessionStatus.valid) {
			deleteCookie(event, SESSION_COOKIE_NAME, { path: '/' });
		}
	}

	return {
		isPasswordConfigured: passwordConfigured,
		isAuthenticated,
		sessionToken: rawToken
	};
}
