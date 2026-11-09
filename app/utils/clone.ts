import { toRaw } from 'vue';

export function clonePlain<T>(value: T): T {
	const raw = toRaw(value);
	try {
		return structuredClone(raw);
	} catch {
		return JSON.parse(JSON.stringify(raw)) as T;
	}
}
