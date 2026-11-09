import {
	defineEventHandler,
	getRequestHeader,
	getRequestHost,
	setResponseHeaders,
	createError,
	type H3Event
} from 'h3';
import { resolveEventAuthSession } from '~~/server/repositories/auth.repo';

function verifyCsrfProtection(event: H3Event): void {
	const secFetchSite = getRequestHeader(event, 'sec-fetch-site')?.trim().toLowerCase();
	if (secFetchSite === 'cross-site') {
		throw createError({
			statusCode: 403,
			statusMessage: 'درخواست غیرمجاز از دامنه خارجی مسدود شد'
		});
	}

	const originHeader = getRequestHeader(event, 'origin')?.trim();
	if (originHeader && originHeader !== 'null') {
		try {
			const originUrl = new URL(originHeader);
			const requestHost = getRequestHost(event, { xForwardedHost: true })
				?.split(',')[0]
				?.trim()
				.toLowerCase();
			if (requestHost && originUrl.host.toLowerCase() !== requestHost) {
				throw createError({
					statusCode: 403,
					statusMessage: 'عدم تطابق دامنه مبدا درخواست (CSRF Protection)'
				});
			}
		} catch (err) {
			if (err && typeof err === 'object' && 'statusCode' in err) {
				throw err;
			}
			throw createError({
				statusCode: 403,
				statusMessage: 'هدر Origin درخواست نامعتبر است'
			});
		}
	}
}

export default defineEventHandler(async (event) => {
	setResponseHeaders(event, {
		'X-Content-Type-Options': 'nosniff',
		'X-Frame-Options': 'DENY',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
	});

	const pathname = event.path || '';

	if (!pathname.startsWith('/api/')) {
		return;
	}

	const method = (event.method || 'GET').toUpperCase();
	if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
		verifyCsrfProtection(event);
	}

	const isPublicAuthApi =
		pathname === '/api/auth/login' ||
		pathname === '/api/auth/setup' ||
		pathname === '/api/auth/status' ||
		pathname === '/api/auth/logout';

	if (isPublicAuthApi) {
		return;
	}

	const { isPasswordConfigured, isAuthenticated, sessionToken } =
		await resolveEventAuthSession(event, false);

	event.context.isAuthenticated = isAuthenticated;
	event.context.isPasswordConfigured = isPasswordConfigured;
	event.context.sessionToken = sessionToken;

	if (!isPasswordConfigured || !isAuthenticated) {
		throw createError({
			statusCode: 401,
			statusMessage: isPasswordConfigured
				? 'ابتدا وارد حساب کاربری شوید'
				: 'ابتدا رمز عبور اولیه سیستم را تنظیم کنید'
		});
	}
});
