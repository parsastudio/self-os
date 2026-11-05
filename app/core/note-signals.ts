import { normalizeDigits } from '~/domain/calendar';

const LINK_PATTERN =
	/https?:\/\/[^\s]+|www\.[^\s]+|\b[a-zA-Z0-9-]+\.(com|ir|org|net|io|dev|app|me|co|ai|gg|xyz)(\/[^\s]*)?/i;
const TEN_DIGIT_NUMBER_PATTERN = /\d{10,}/;

export function detectNoteSmartSignals(text: string): {
	hasLink: boolean;
	hasNumber: boolean;
	firstUrl: string | null;
} {
	const normalized = normalizeDigits(text);
	const linkMatch = normalized.match(LINK_PATTERN);
	const rawLink = linkMatch ? linkMatch[0] : null;
	const firstUrl = rawLink
		? /^https?:\/\//i.test(rawLink)
			? rawLink
			: `https://${rawLink}`
		: null;

	return {
		hasLink: Boolean(firstUrl),
		hasNumber: TEN_DIGIT_NUMBER_PATTERN.test(normalized),
		firstUrl
	};
}
