import { normalizeDigits } from '~/domain/calendar';

const LINK_PATTERN =
	/https?:\/\/[^\s"'<>،؛)]+|www\.[^\s"'<>،؛)]+|\b[a-zA-Z0-9-]+\.(com|ir|org|net|io|dev|app|me|co|ai|gg|xyz)(\/[^\s"'<>،؛)]*)?/i;
const TEN_DIGIT_NUMBER_PATTERN = /\d{10,}/;

export function detectNoteSmartSignals(text: string): {
	hasLink: boolean;
	hasNumber: boolean;
	firstUrl: string | null;
} {
	const normalized = normalizeDigits(text);
	const linkMatch = normalized.match(LINK_PATTERN);
	const rawLink = linkMatch ? linkMatch[0].replace(/[.,،؛!؟)+]+$/, '') : null;
	const candidateUrl = rawLink
		? /^https?:\/\//i.test(rawLink)
			? rawLink
			: `https://${rawLink}`
		: null;

	let firstUrl: string | null = null;
	if (candidateUrl) {
		try {
			const parsed = new URL(candidateUrl);
			if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
				firstUrl = parsed.href;
			}
		} catch {
			firstUrl = null;
		}
	}

	return {
		hasLink: Boolean(firstUrl),
		hasNumber: TEN_DIGIT_NUMBER_PATTERN.test(normalized),
		firstUrl
	};
}
