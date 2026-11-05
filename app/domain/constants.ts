import type {
	BookStatus,
	DayHabitOutcome,
	DayStatusColor,
	LifecycleEventType,
	MediaCategory,
	MediaStatus
} from './schemas';

export const DEFAULT_HABIT_CATEGORY = 'عمومی';

export const TIER_SCORES = {
	SKIPPED: -1,
	FAILED: 0,
	BRONZE: 1,
	SILVER: 2,
	GOLD: 3
} as const;

export const COMPOSITE_FULL_LABEL = '3 (کامل)';

export const CADENCE_DEFAULTS = {
	INTERVALS: 1,
	MINUTES_PER_INTERVAL: 10,
	WINDOW_MINUTES: 60,
	MIN_WINDOW_MINUTES: 15,
	MINUTE_STEP: 5,
	EMERGENCY_MINUTES: 2
} as const;

export const QUALITY_SCORES = {
	GOLD: 100,
	SILVER: 68,
	BRONZE_MAX: 100,
	BRONZE_DEFAULT: 38,
	CADENCE_MIN_NONZERO: 25,
	FAILED: 0
} as const;

export const CADENCE_SUCCESS_RATIOS = {
	GOLD_THRESHOLD: 1.0,
	SILVER_THRESHOLD: 0.6
} as const;

export interface DayStatusMetaItem {
	value: DayStatusColor;
	label: string;
	shortBadgeLabel: string;
	dotClass: string;
	softBadgeClasses: string;
	activeClasses: string;
}

export const DAY_STATUS_META: Record<DayStatusColor, DayStatusMetaItem> = {
	optimal: {
		value: 'optimal',
		label: 'سبز (مطلوب / افزایش)',
		shortBadgeLabel: 'سبز (مطلوب)',
		dotClass: 'bg-optimal',
		softBadgeClasses: 'bg-optimal-soft text-optimal',
		activeClasses: 'border-optimal bg-elevated text-optimal'
	},
	partial: {
		value: 'partial',
		label: 'زرد (ترکیبی)',
		shortBadgeLabel: 'زرد (ترکیبی)',
		dotClass: 'bg-partial',
		softBadgeClasses: 'bg-partial-soft text-partial',
		activeClasses: 'border-partial bg-elevated text-partial'
	},
	failed: {
		value: 'failed',
		label: 'قرمز (کاهش / شکست)',
		shortBadgeLabel: 'قرمز (کاهش)',
		dotClass: 'bg-failed',
		softBadgeClasses: 'bg-failed-soft text-failed',
		activeClasses: 'border-failed bg-elevated text-failed'
	}
};

export const DAY_STATUS_OPTIONS: ReadonlyArray<DayStatusMetaItem> = [
	DAY_STATUS_META.optimal,
	DAY_STATUS_META.partial,
	DAY_STATUS_META.failed
];

export function getDayStatusMeta(status: DayStatusColor | null | undefined): DayStatusMetaItem {
	if (status === 'optimal') return DAY_STATUS_META.optimal;
	if (status === 'partial') return DAY_STATUS_META.partial;
	return DAY_STATUS_META.failed;
}

export const LIFECYCLE_EVENT_META: Record<
	LifecycleEventType,
	{ label: string; badgeClasses: string }
> = {
	CREATED: {
		label: 'ایجاد طرح جدید',
		badgeClasses: 'border-optimal-border bg-optimal-soft text-optimal'
	},
	CONVERTED_TO_SUBHABIT: {
		label: 'تبدیل به زیرطرح',
		badgeClasses: 'border-gold-border bg-gold-soft text-gold-text'
	},
	PROMOTED_TO_ROOT: {
		label: 'ارتقا به طرح مستقل',
		badgeClasses: 'border-accent-border bg-accent-soft text-accent-text'
	},
	CADENCE_UPDATED: {
		label: 'تغییر بازه تکرارشونده',
		badgeClasses: 'border-partial-border bg-partial-soft text-partial'
	},
	STATUS_CHANGED: {
		label: 'تغییر وضعیت طرح',
		badgeClasses: 'border-silver-border bg-silver-soft text-silver-text'
	},
	UPDATED_RULES: {
		label: 'ویرایش قوانین طرح',
		badgeClasses: 'border-silver-border bg-silver-soft text-silver-text'
	},
	DELETED: {
		label: 'حذف / بایگانی طرح',
		badgeClasses: 'border-failed-border bg-failed-soft text-failed'
	}
};

export const LIFECYCLE_FILTER_OPTIONS: ReadonlyArray<{
	id: LifecycleEventType | 'ALL';
	label: string;
}> = [
	{ id: 'ALL', label: 'همه وقایع' },
	{ id: 'CREATED', label: 'ایجاد شده‌ها' },
	{ id: 'CONVERTED_TO_SUBHABIT', label: 'تبدیل به زیرطرح' },
	{ id: 'CADENCE_UPDATED', label: 'تغییر بازه‌ها' },
	{ id: 'DELETED', label: 'بایگانی/حذف' }
] as const;

export const BOOK_STATUS_OPTIONS: ReadonlyArray<{
	value: BookStatus;
	label: string;
	badgeLabel: string;
	badgeClasses: string;
}> = [
	{
		value: 'completed',
		label: 'خوانده شده',
		badgeLabel: 'خوانده‌شده',
		badgeClasses: 'bg-optimal-soft text-optimal'
	},
	{
		value: 'reading',
		label: 'در حال مطالعه',
		badgeLabel: 'در حال مطالعه',
		badgeClasses: 'bg-gold-soft text-gold-text'
	},
	{
		value: 'on_hold',
		label: 'در نوبت / متوقف',
		badgeLabel: 'متوقف',
		badgeClasses: 'bg-elevated text-fg-muted'
	}
] as const;

export const MEDIA_CATEGORY_OPTIONS: ReadonlyArray<{
	value: MediaCategory;
	label: string;
	badgeClasses: string;
}> = [
	{
		value: 'movie',
		label: 'فیلم',
		badgeClasses: 'border-accent-border bg-accent-soft text-accent-text'
	},
	{
		value: 'series',
		label: 'سریال',
		badgeClasses: 'border-gold-border bg-gold-soft text-gold-text'
	},
	{
		value: 'anime',
		label: 'انیمه',
		badgeClasses: 'border-bronze-border bg-bronze-soft text-bronze-text'
	},
	{
		value: 'animation',
		label: 'انیمیشن',
		badgeClasses: 'border-silver-border bg-silver-soft text-silver-text'
	}
] as const;

export const MEDIA_STATUS_OPTIONS: ReadonlyArray<{
	value: MediaStatus;
	label: string;
	badgeLabel: string;
	badgeClasses: string;
}> = [
	{
		value: 'completed',
		label: 'دیده شده',
		badgeLabel: 'دیده شده',
		badgeClasses: 'bg-optimal-soft text-optimal'
	},
	{
		value: 'on_hold',
		label: 'ندیده (در نوبت)',
		badgeLabel: 'ندیده',
		badgeClasses: 'bg-elevated text-fg-secondary'
	}
] as const;

export const BOOK_RATING_OPTIONS = [
	{ value: 5, label: '★★★★★ (۵)' },
	{ value: 4, label: '★★★★☆ (۴)' },
	{ value: 3, label: '★★★☆☆ (۳)' },
	{ value: 2, label: '★★☆☆☆ (۲)' },
	{ value: 1, label: '★☆☆☆☆ (۱)' }
] as const;

export function getTierBadgeMeta(tier: number | null | undefined): {
	label: string;
	classes: string;
} {
	if (tier === TIER_SCORES.GOLD) {
		return { label: 'طلا', classes: 'border-gold-border bg-gold-soft text-gold-text' };
	}
	if (tier === TIER_SCORES.SILVER) {
		return { label: 'نقره', classes: 'border-silver-border bg-silver-soft text-silver-text' };
	}
	if (tier === TIER_SCORES.BRONZE) {
		return { label: 'برنز', classes: 'border-bronze-border bg-bronze-soft text-bronze-text' };
	}
	if (tier === TIER_SCORES.SKIPPED) {
		return { label: 'پیش نیامد', classes: 'border-border bg-elevated text-fg-secondary' };
	}
	return { label: 'نشد', classes: 'border-failed-border bg-failed-soft text-failed' };
}

export function getOutcomeBadgeMeta(
	outcome: DayHabitOutcome,
	maxSupportedTier: 1 | 2 | 3 = 3
): {
	label: string;
	badgeClass: string;
} {
	if (outcome === 'gold') {
		return {
			label: maxSupportedTier === 1 ? 'انجام کامل' : 'سطح طلا',
			badgeClass: 'border-gold-border bg-gold-soft text-gold-text'
		};
	}
	if (outcome === 'silver') {
		return {
			label: 'سطح نقره',
			badgeClass: 'border-silver-border bg-silver-soft text-silver-text'
		};
	}
	if (outcome === 'bronze') {
		return {
			label: 'سطح برنز (حداقل)',
			badgeClass: 'border-bronze-border bg-bronze-soft text-bronze-text'
		};
	}
	if (outcome === 'failed') {
		return {
			label: 'انجام نشد',
			badgeClass: 'border-failed-border bg-failed-soft text-failed'
		};
	}
	if (outcome === 'skipped') {
		return {
			label: 'پیش نیامد',
			badgeClass: 'border-border bg-elevated text-fg-secondary'
		};
	}
	return {
		label: 'ثبت‌نشده',
		badgeClass: 'border-border bg-elevated text-fg-muted'
	};
}

export const DEFAULT_REFLECTION_TAGS = [
	'خستگی',
	'کم‌خوابی',
	'مشکلات اینترنت',
	'اهمال‌کاری',
	'بیرون بودن',
	'انگیزه بالا',
	'تمرکز عمیق',
	'بحث سیاسی',
	'مشکلات خانوادگی'
] as const;
