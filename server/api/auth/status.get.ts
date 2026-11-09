import { defineEventHandler } from 'h3';
import { resolveEventAuthSession } from '~~/server/repositories/auth.repo';

export default defineEventHandler(async (event) => {
	const { isPasswordConfigured, isAuthenticated } = await resolveEventAuthSession(event, true);
	return {
		isPasswordConfigured,
		isAuthenticated
	};
});
