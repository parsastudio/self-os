import { defineEventHandler, setHeader } from 'h3';

export default defineEventHandler((event) => {
	setHeader(event, 'cache-control', 'no-store, no-cache, must-revalidate');
	const config = useRuntimeConfig();
	const appVersion = (config.public?.appVersion as string) || '0.0.1';

	return {
		version: appVersion,
		timestamp: new Date().toISOString()
	};
});
