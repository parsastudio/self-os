import { getAppDatabase, type LocalAuthRecord } from '~/composables/useAppDatabase';

const PBKDF2_V2_PREFIX = 'pbkdf2_v2:';
const PBKDF2_V2_ITERATIONS = 600000;
const PBKDF2_LEGACY_ITERATIONS = 100000;
const CLIENT_SALT_BYTES = 32;

function generateRandomSalt(length = CLIENT_SALT_BYTES): Uint8Array {
	const salt = new Uint8Array(length);
	crypto.getRandomValues(salt);
	return salt;
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
	}
	return bytes;
}

async function deriveVerifierHex(
	password: string,
	salt: Uint8Array,
	iterations = PBKDF2_V2_ITERATIONS
): Promise<string> {
	const enc = new TextEncoder();
	const normalizedPassword = password.normalize('NFKC');
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		enc.encode(normalizedPassword),
		{ name: 'PBKDF2' },
		false,
		['deriveBits']
	);

	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt: salt as BufferSource,
			iterations,
			hash: 'SHA-256'
		},
		keyMaterial,
		256
	);

	return bytesToHex(new Uint8Array(derivedBits));
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

async function computeSessionSignatureHex(params: {
	verifierHexWithPrefix: string;
	verifierSaltHex: string;
	expiresAtIso: string;
}): Promise<string> {
	const enc = new TextEncoder();
	const rawVerifier = params.verifierHexWithPrefix.startsWith(PBKDF2_V2_PREFIX)
		? params.verifierHexWithPrefix.slice(PBKDF2_V2_PREFIX.length)
		: params.verifierHexWithPrefix;

	const hmacKey = await crypto.subtle.importKey(
		'raw',
		enc.encode(rawVerifier),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const payload = `session:v2:${params.verifierSaltHex}:${params.expiresAtIso}`;
	const sigBuffer = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(payload));
	return bytesToHex(new Uint8Array(sigBuffer));
}

async function verifyOfflineRecordIntegrity(record: LocalAuthRecord): Promise<boolean> {
	if (
		!record.isAuthenticated ||
		!record.passwordVerifierHex ||
		!record.verifierSaltHex ||
		record.verifierSaltHex.length < 32
	) {
		return false;
	}
	if (!record.sessionSignatureHex) {
		return false;
	}
	const expectedSig = await computeSessionSignatureHex({
		verifierHexWithPrefix: record.passwordVerifierHex,
		verifierSaltHex: record.verifierSaltHex,
		expiresAtIso: record.expiresAtIso
	});
	return timingSafeEqual(record.sessionSignatureHex, expectedSig);
}

const isAuthenticated = ref(false);
const isPasswordConfigured = ref(true);
const isInitialized = ref(false);
let hasVerifiedWithServerInSession = false;

export function useClientAuth() {

	async function checkAuth(
		serverAuthenticated?: boolean,
		serverPasswordConfigured?: boolean
	): Promise<{ isAuthenticated: boolean; isPasswordConfigured: boolean }> {
		if (!import.meta.client) {
			return {
				isAuthenticated: serverAuthenticated ?? false,
				isPasswordConfigured: serverPasswordConfigured ?? true
			};
		}

		const db = getAppDatabase();
		if (!db) {
			return { isAuthenticated: false, isPasswordConfigured: true };
		}

		const record = await db.localAuth.get('auth:session');
		const nowIso = new Date().toISOString();

		if (serverAuthenticated === true) {
			isAuthenticated.value = true;
			isPasswordConfigured.value = serverPasswordConfigured ?? true;
			if (record && record.passwordVerifierHex && record.verifierSaltHex) {
				const newExpiresIso = new Date(
					Date.now() + 365 * 24 * 60 * 60 * 1000
				).toISOString();
				const sig = await computeSessionSignatureHex({
					verifierHexWithPrefix: record.passwordVerifierHex,
					verifierSaltHex: record.verifierSaltHex,
					expiresAtIso: newExpiresIso
				});
				await db.localAuth.put({
					...record,
					isAuthenticated: true,
					expiresAtIso: newExpiresIso,
					sessionSignatureHex: sig,
					updatedAtIso: nowIso
				});
			}
			isInitialized.value = true;
			return {
				isAuthenticated: true,
				isPasswordConfigured: isPasswordConfigured.value
			};
		}

		if (serverAuthenticated === false && navigator.onLine) {
			isAuthenticated.value = false;
			isPasswordConfigured.value =
				serverPasswordConfigured ?? (record?.isPasswordConfigured ?? true);
			if (record) {
				await db.localAuth.put({
					...record,
					isAuthenticated: false,
					isPasswordConfigured: isPasswordConfigured.value,
					sessionSignatureHex: undefined,
					updatedAtIso: nowIso
				});
			}
			isInitialized.value = true;
			return {
				isAuthenticated: false,
				isPasswordConfigured: isPasswordConfigured.value
			};
		}

		if (
			record &&
			record.isAuthenticated &&
			record.expiresAtIso > nowIso &&
			(await verifyOfflineRecordIntegrity(record))
		) {
			const newExpiresIso = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
			const sig = await computeSessionSignatureHex({
				verifierHexWithPrefix: record.passwordVerifierHex,
				verifierSaltHex: record.verifierSaltHex,
				expiresAtIso: newExpiresIso
			});
			await db.localAuth.put({
				...record,
				expiresAtIso: newExpiresIso,
				sessionSignatureHex: sig,
				updatedAtIso: nowIso
			});

			isAuthenticated.value = true;
			isPasswordConfigured.value = record.isPasswordConfigured;
			isInitialized.value = true;
			return {
				isAuthenticated: true,
				isPasswordConfigured: record.isPasswordConfigured
			};
		}

		isAuthenticated.value = false;
		isPasswordConfigured.value = record?.isPasswordConfigured ?? (serverPasswordConfigured ?? true);
		isInitialized.value = true;
		return {
			isAuthenticated: false,
			isPasswordConfigured: isPasswordConfigured.value
		};
	}

	async function saveClientCredential(password: string): Promise<void> {
		if (!import.meta.client || !password.trim()) return;

		const db = getAppDatabase();
		if (!db) return;

		const salt = generateRandomSalt(CLIENT_SALT_BYTES);
		const saltHex = bytesToHex(salt);
		const verifierHex = await deriveVerifierHex(password, salt, PBKDF2_V2_ITERATIONS);
		const now = new Date();
		const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

		const expiresAtIso = expiresAt.toISOString();
		const passwordVerifierHex = `${PBKDF2_V2_PREFIX}${verifierHex}`;
		const sessionSignatureHex = await computeSessionSignatureHex({
			verifierHexWithPrefix: passwordVerifierHex,
			verifierSaltHex: saltHex,
			expiresAtIso
		});

		const record: LocalAuthRecord = {
			key: 'auth:session',
			isAuthenticated: true,
			isPasswordConfigured: true,
			expiresAtIso,
			verifierSaltHex: saltHex,
			passwordVerifierHex,
			sessionSignatureHex,
			updatedAtIso: now.toISOString()
		};

		await db.localAuth.put(record);
		isAuthenticated.value = true;
		isPasswordConfigured.value = true;
		isInitialized.value = true;
		hasVerifiedWithServerInSession = true;
	}

	async function loginOffline(password: string): Promise<{ success: boolean; error?: string }> {
		if (!import.meta.client) return { success: false, error: 'محیط نامعتبر است' };

		const db = getAppDatabase();
		if (!db) return { success: false, error: 'پایگاه داده در دسترس نیست' };

		const record = await db.localAuth.get('auth:session');
		if (!record || !record.passwordVerifierHex || !record.verifierSaltHex) {
			return {
				success: false,
				error: 'اطلاعات ورود محلی در این دستگاه یافت نشد. لطفاً یک‌بار در حالت آنلاین وارد شوید.'
			};
		}

		const isV2 = record.passwordVerifierHex.startsWith(PBKDF2_V2_PREFIX);
		const expectedHex = isV2
			? record.passwordVerifierHex.slice(PBKDF2_V2_PREFIX.length)
			: record.passwordVerifierHex;
		const iterations = isV2 ? PBKDF2_V2_ITERATIONS : PBKDF2_LEGACY_ITERATIONS;

		const salt = hexToBytes(record.verifierSaltHex);
		const candidateVerifier = await deriveVerifierHex(password, salt, iterations);

		if (!timingSafeEqual(candidateVerifier, expectedHex)) {
			return { success: false, error: 'رمز عبور وارد شده نادرست است' };
		}

		const now = new Date();
		const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

		if (!isV2) {
			const upgradedSalt = generateRandomSalt(CLIENT_SALT_BYTES);
			const upgradedVerifier = await deriveVerifierHex(
				password,
				upgradedSalt,
				PBKDF2_V2_ITERATIONS
			);
			record.verifierSaltHex = bytesToHex(upgradedSalt);
			record.passwordVerifierHex = `${PBKDF2_V2_PREFIX}${upgradedVerifier}`;
		}

		const expiresAtIso = expiresAt.toISOString();
		const sessionSignatureHex = await computeSessionSignatureHex({
			verifierHexWithPrefix: record.passwordVerifierHex,
			verifierSaltHex: record.verifierSaltHex,
			expiresAtIso
		});

		record.isAuthenticated = true;
		record.expiresAtIso = expiresAtIso;
		record.sessionSignatureHex = sessionSignatureHex;
		record.updatedAtIso = now.toISOString();

		await db.localAuth.put(record);
		isAuthenticated.value = true;
		isInitialized.value = true;

		return { success: true };
	}

	async function ensureSessionChecked(): Promise<{
		isAuthenticated: boolean;
		isPasswordConfigured: boolean;
	}> {
		if (!import.meta.client) {
			return {
				isAuthenticated: isAuthenticated.value,
				isPasswordConfigured: isPasswordConfigured.value
			};
		}

		if (isInitialized.value && (hasVerifiedWithServerInSession || !navigator.onLine)) {
			return {
				isAuthenticated: isAuthenticated.value,
				isPasswordConfigured: isPasswordConfigured.value
			};
		}

		let serverAuth: boolean | undefined;
		let serverPasswordConfigured: boolean | undefined;

		try {
			if (navigator.onLine) {
				const data = await $fetch<{
					isAuthenticated: boolean;
					isPasswordConfigured: boolean;
				}>('/api/auth/status');
				serverAuth = data.isAuthenticated;
				serverPasswordConfigured = data.isPasswordConfigured;
				hasVerifiedWithServerInSession = true;
			}
		} catch {
			// Fallback to local IndexedDB session when offline or unreachable
		}

		return checkAuth(serverAuth, serverPasswordConfigured);
	}

	async function logout(): Promise<void> {
		if (!import.meta.client) return;
		const db = getAppDatabase();
		if (db) {
			await db.localAuth.delete('auth:session');
		}
		isAuthenticated.value = false;
		hasVerifiedWithServerInSession = false;
	}

	return {
		isAuthenticated,
		isPasswordConfigured,
		isInitialized,
		checkAuth,
		ensureSessionChecked,
		saveClientCredential,
		loginOffline,
		logout
	};
}
