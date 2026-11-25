import { normalizeDigits } from '~/domain/calendar';
import type { NoteContentSegment } from '~/domain/schemas';

const LINK_REGEX_SOURCE = String.raw`https?:\/\/[^\s"'<>،؛)]+|www\.[^\s"'<>،؛)]+|\b[a-zA-Z0-9-]+\.(?:com|ir|org|net|io|dev|app|me|co|ai|gg|xyz)(?:\/[^\s"'<>،؛)]*)?`;

const NUMBER_REGEX_SOURCE = [
	String.raw`\+?[0-9۰-۹٠-٩]{2,4}(?:-[0-9۰-۹٠-٩]{3,8})+`,
	String.raw`\+?[0-9۰-۹٠-٩]{2,4}(?: [0-9۰-۹٠-٩]{3,4}){2,4}`,
	String.raw`\+?[0-9۰-۹٠-٩]+(?:\.[0-9۰-۹٠-٩]+)*`
].join('|');

const LINK_PATTERN = new RegExp(LINK_REGEX_SOURCE, 'i');
const TEN_DIGIT_NUMBER_PATTERN = /\d{10,}/;

function resolveSafeHttpUrl(rawCandidate: string): { cleanRaw: string; trailing: string; href: string | null } {
	const cleanRaw = rawCandidate.replace(/[.,،؛!؟)+]+$/, '');
	const trailing = rawCandidate.slice(cleanRaw.length);
	if (!cleanRaw) {
		return { cleanRaw: rawCandidate, trailing: '', href: null };
	}

	const candidateUrl = /^https?:\/\//i.test(cleanRaw) ? cleanRaw : `https://${cleanRaw}`;
	try {
		const parsed = new URL(candidateUrl);
		if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
			return { cleanRaw, trailing, href: parsed.href };
		}
	} catch {
		return { cleanRaw, trailing, href: null };
	}
	return { cleanRaw, trailing, href: null };
}

export function parseNoteContentSegments(text: string): NoteContentSegment[] {
	if (!text) return [];

	const tokenPattern = new RegExp(`(${LINK_REGEX_SOURCE})|(${NUMBER_REGEX_SOURCE})`, 'gi');
	const segments: NoteContentSegment[] = [];
	let cursor = 0;

	const pushText = (raw: string) => {
		if (!raw) return;
		const prev = segments[segments.length - 1];
		if (prev && prev.kind === 'text') {
			prev.raw += raw;
		} else {
			segments.push({ kind: 'text', raw });
		}
	};

	for (const match of text.matchAll(tokenPattern)) {
		const matchIndex = match.index ?? 0;
		if (matchIndex > cursor) {
			pushText(text.slice(cursor, matchIndex));
		}

		const fullMatch = match[0];
		const matchedUrl = match[1];

		if (matchedUrl) {
			const { cleanRaw, trailing, href } = resolveSafeHttpUrl(matchedUrl);
			if (href) {
				segments.push({ kind: 'url', raw: cleanRaw, href });
				pushText(trailing);
			} else {
				pushText(fullMatch);
			}
			cursor = matchIndex + fullMatch.length;
			continue;
		}

		let rawNumber = fullMatch;
		let effectiveStart = matchIndex;
		const rawDigitsOnly = normalizeDigits(rawNumber).replace(/[^0-9]/g, '');
		const isPrecededByDigit =
			matchIndex > 0 && /[0-9۰-۹٠-٩]/.test(text[matchIndex - 1] ?? '');

		if (rawNumber.startsWith('+') && (isPrecededByDigit || rawDigitsOnly.length < 6)) {
			pushText('+');
			rawNumber = rawNumber.slice(1);
			effectiveStart += 1;
		}

		const digitsOnly = normalizeDigits(rawNumber).replace(/[^0-9]/g, '');
		const tokenEnd = effectiveStart + rawNumber.length;
		const prevChar = effectiveStart > 0 ? (text[effectiveStart - 1] ?? '') : '';
		const nextChar = tokenEnd < text.length ? (text[tokenEnd] ?? '') : '';
		const isGluedShortAscii =
			digitsOnly.length <= 2 &&
			!rawNumber.includes('.') &&
			(/[a-zA-Z]/.test(prevChar) || /[a-zA-Z]/.test(nextChar));

		if (isGluedShortAscii) {
			pushText(rawNumber);
		} else {
			const copyValue = normalizeDigits(rawNumber).replace(/[-\s]/g, '');
			segments.push({
				kind: 'number',
				raw: rawNumber,
				copyValue
			});
		}

		cursor = matchIndex + fullMatch.length;
	}

	if (cursor < text.length) {
		pushText(text.slice(cursor));
	}

	return segments;
}

export function detectNoteSmartSignals(text: string): {
	hasLink: boolean;
	hasNumber: boolean;
	firstUrl: string | null;
} {
	const linkMatch = text.match(LINK_PATTERN);
	const firstUrl = linkMatch ? resolveSafeHttpUrl(linkMatch[0]).href : null;

	const segments = parseNoteContentSegments(text);
	const hasGroupedTenDigit = segments.some(
		(seg) =>
			seg.kind === 'number' &&
			seg.copyValue.replace(/[^0-9]/g, '').length >= 10
	);

	return {
		hasLink: Boolean(firstUrl),
		hasNumber: hasGroupedTenDigit || TEN_DIGIT_NUMBER_PATTERN.test(normalizeDigits(text)),
		firstUrl
	};
}
