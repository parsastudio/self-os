import * as _jalaali from 'jalaali-js';

const jalaali = ((_jalaali as Record<string, unknown>).default || _jalaali) as typeof _jalaali;

export interface JalaliParts {
	jy: number;
	jm: number;
	jd: number;
}

const PERSIAN_MONTHS = [
	'فروردین',
	'اردیبهشت',
	'خرداد',
	'تیر',
	'مرداد',
	'شهریور',
	'مهر',
	'آبان',
	'آذر',
	'دی',
	'بهمن',
	'اسفند'
] as const;

export const JALALI_MONTH_NAMES = PERSIAN_MONTHS;

export const JALALI_GRID_WEEKDAYS = [
	'شنبه',
	'یکشنبه',
	'دوشنبه',
	'سه‌شنبه',
	'چهارشنبه',
	'پنجشنبه',
	'جمعه'
] as const;

export const JALALI_GRID_WEEKDAYS_SHORT = [
	'ش',
	'۱ش',
	'۲ش',
	'۳ش',
	'۴ش',
	'۵ش',
	'ج'
] as const;

const TEHRAN_ISO_FORMATTER = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Asia/Tehran',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

export function getPersianWeekdayIndex(date: Date): number {
	return (date.getDay() + 1) % 7;
}

export function padZero(num: number, size = 2): string {
	return String(num).padStart(size, '0');
}

export function normalizeDigits(input: string): string {
	return input
		.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
		.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export function toPersianDigits(input: string | number): string {
	return String(input)
		.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
		.replace(/[٠-٩]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
}

export function dateToIso(date: Date): string {
	const y = date.getFullYear();
	const m = padZero(date.getMonth() + 1);
	const d = padZero(date.getDate());
	return `${y}-${m}-${d}`;
}

export function isoToDate(iso: string): Date {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

export function getTodayIso(): string {
	return TEHRAN_ISO_FORMATTER.format(new Date());
}

export function getYesterdayIso(): string {
	return shiftIsoDate(getTodayIso(), -1);
}

export function shiftIsoDate(iso: string, deltaDays: number): string {
	const dt = isoToDate(iso);
	dt.setDate(dt.getDate() + deltaDays);
	return dateToIso(dt);
}

export function isoToJalaliParts(iso: string): JalaliParts {
	const [gy, gm, gd] = iso.split('-').map(Number);
	return jalaali.toJalaali(gy, gm, gd);
}

export function jalaliPartsToIso(parts: JalaliParts): string | null {
	if (!jalaali.isValidJalaaliDate(parts.jy, parts.jm, parts.jd)) {
		return null;
	}
	const { gy, gm, gd } = jalaali.toGregorian(parts.jy, parts.jm, parts.jd);
	return `${gy}-${padZero(gm)}-${padZero(gd)}`;
}

export function isoToJalaliSlash(iso: string): string {
	const { jy, jm, jd } = isoToJalaliParts(iso);
	return `${jy}/${padZero(jm)}/${padZero(jd)}`;
}

export function jalaliSlashToIso(jalaliStr: string): string | null {
	const cleaned = normalizeDigits(jalaliStr.trim());
	const match = cleaned.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
	if (!match) return null;
	const jy = Number(match[1]);
	const jm = Number(match[2]);
	const jd = Number(match[3]);
	return jalaliPartsToIso({ jy, jm, jd });
}

export function resolveCompletedRangeDates(params: {
	startedJalali?: string | null;
	finishedJalali?: string | null;
	isCompleted: boolean;
	todayIso?: string;
}): {
	startedAtIso: string | null;
	finishedAtIso: string | null;
} {
	const todayIso = params.todayIso ?? getTodayIso();
	const startedAtIso = params.startedJalali?.trim()
		? jalaliSlashToIso(params.startedJalali.trim())
		: null;
	const finishedAtIso = params.finishedJalali?.trim()
		? jalaliSlashToIso(params.finishedJalali.trim())
		: params.isCompleted
			? todayIso
			: null;

	return { startedAtIso, finishedAtIso };
}

export function formatJalaliHuman(
	iso: string,
	referenceTodayIso?: string
): {
	weekday: string;
	weekdayShort: string;
	day: number;
	monthName: string;
	year: number;
	fullLabel: string;
	relativeBadge: string | null;
} {
	const dt = isoToDate(iso);
	const weekdayIdx = getPersianWeekdayIndex(dt);
	const weekday = JALALI_GRID_WEEKDAYS[weekdayIdx];
	const weekdayShort = JALALI_GRID_WEEKDAYS_SHORT[weekdayIdx];
	const { jy, jm, jd } = isoToJalaliParts(iso);
	const monthName = PERSIAN_MONTHS[jm - 1] ?? '';

	const todayIso = referenceTodayIso ?? getTodayIso();
	const yesterdayIso = shiftIsoDate(todayIso, -1);
	const tomorrowIso = shiftIsoDate(todayIso, 1);

	let relativeBadge: string | null = null;
	if (iso === yesterdayIso) relativeBadge = 'دیروز';
	else if (iso === todayIso) relativeBadge = 'امروز';
	else if (iso === tomorrowIso) relativeBadge = 'فردا';

	return {
		weekday,
		weekdayShort,
		day: jd,
		monthName,
		year: jy,
		fullLabel: `${weekday} ${toPersianDigits(jd)} ${monthName} ${toPersianDigits(jy)}`,
		relativeBadge
	};
}

export interface CalendarScrubberDay<TStatus extends string = string> {
	iso: string;
	jd: number;
	weekdayShort: string;
	monthName: string;
	isSelected: boolean;
	visualState: TStatus;
}

export function buildRecentCalendarDays<TStatus extends string>(params: {
	currentDateIso: string;
	todayIso: string;
	savedStatusByIso: Map<string, TStatus>;
	liveStatus: TStatus;
	useLiveStatusForSelected: boolean;
	defaultStatus: TStatus;
	daysCount?: number;
}): CalendarScrubberDay<TStatus>[] {
	const {
		currentDateIso,
		todayIso,
		savedStatusByIso,
		liveStatus,
		useLiveStatusForSelected,
		defaultStatus,
		daysCount = 14
	} = params;

	const anchorIso = currentDateIso > todayIso ? currentDateIso : todayIso;
	const list: CalendarScrubberDay<TStatus>[] = [];

	for (let i = daysCount - 1; i >= 0; i--) {
		const iso = shiftIsoDate(anchorIso, -i);
		const dt = isoToDate(iso);
		const { jm, jd } = isoToJalaliParts(iso);
		const isSelected = iso === currentDateIso;

		let visualState = defaultStatus;
		if (isSelected && useLiveStatusForSelected) {
			visualState = liveStatus;
		} else {
			const saved = savedStatusByIso.get(iso);
			if (saved) visualState = saved;
		}

		list.push({
			iso,
			jd,
			weekdayShort: JALALI_GRID_WEEKDAYS_SHORT[getPersianWeekdayIndex(dt)],
			monthName: PERSIAN_MONTHS[jm - 1] ?? '',
			isSelected,
			visualState
		});
	}

	return list;
}

export function getJalaliMonthLength(jy: number, jm: number): number {
	return jalaali.jalaaliMonthLength(jy, jm);
}

export function getDaysUntilIso(fromIso: string, targetIso: string): number {
	const d1 = isoToDate(fromIso);
	const d2 = isoToDate(targetIso);
	return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

export interface JalaliMonthGridCell {
	iso: string;
	jy: number;
	jm: number;
	jd: number;
	weekdayLabel: string;
	isToday: boolean;
}

export function buildJalaliMonthGrid(
	jy: number,
	jm: number,
	todayIso = getTodayIso()
): {
	year: number;
	month: number;
	monthName: string;
	leadingEmptyCells: number;
	days: JalaliMonthGridCell[];
} {
	const monthLength = jalaali.jalaaliMonthLength(jy, jm);
	const firstDayIso = jalaliPartsToIso({ jy, jm, jd: 1 }) ?? todayIso;
	const firstDate = isoToDate(firstDayIso);
	const leadingEmptyCells = getPersianWeekdayIndex(firstDate);

	const days: JalaliMonthGridCell[] = [];
	for (let jd = 1; jd <= monthLength; jd++) {
		const iso = jalaliPartsToIso({ jy, jm, jd }) ?? todayIso;
		const weekdayIdx = (leadingEmptyCells + jd - 1) % 7;
		days.push({
			iso,
			jy,
			jm,
			jd,
			weekdayLabel: JALALI_GRID_WEEKDAYS[weekdayIdx],
			isToday: iso === todayIso
		});
	}

	return {
		year: jy,
		month: jm,
		monthName: PERSIAN_MONTHS[jm - 1] ?? '',
		leadingEmptyCells,
		days
	};
}
