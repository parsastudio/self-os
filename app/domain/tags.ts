export function parseTagsJson(rawJson: string | null | undefined): string[] {
	if (!rawJson) return [];
	try {
		const parsed = JSON.parse(rawJson);
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === 'string')
			: [];
	} catch {
		return [];
	}
}
