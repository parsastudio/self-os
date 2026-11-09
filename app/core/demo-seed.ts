import { getTodayIso, isoToJalaliParts, isoToJalaliSlash, shiftIsoDate } from '~/domain/calendar';
import { DEMO_ENTRY_TAG, DEMO_ID_PREFIX, isDemoRecordId } from '~/domain/constants';
import { evaluateDayStatusColor, resolveHabitRuleSnapshot, serializeHabitSpecSnapshot } from '~/core/habit-engine';
import type {
	BookEntity,
	CadencePlanEntity,
	CalendarEventEntity,
	DatabaseBackupPayload,
	HabitEntity,
	HabitLogItemInput,
	LifecycleEventEntity,
	MediaEntity,
	NoteEntity
} from '~/domain/schemas';

export { DEMO_ENTRY_TAG, DEMO_ID_PREFIX, isDemoRecordId };

export function buildDemoSeedDataset(referenceTodayIso = getTodayIso()): DatabaseBackupPayload {
	const nowIso = new Date().toISOString();
	const startIso = shiftIsoDate(referenceTodayIso, -6);

	const habits: HabitEntity[] = [
		{
			id: 'demo:habit-workout',
			parentId: null,
			title: 'ورزش و تحرک صبحگاهی (آزمایشی)',
			category: 'سلامت',
			trackingMode: 'tiered',
			timeSlot: 'morning',
			isSituational: false,
			status: 'active',
			scheduleLabel: 'بعد از بیدار شدن',
			notes: 'حداقل نرمش کششی روزانه برای شروع پرانرژی',
			bronzeDesc: '۱۰ دقیقه نرمش کششی',
			silverDesc: '۲۰ دقیقه ورزش هوازی',
			goldDesc: '۳۵ دقیقه تمرین کامل',
			emergencyMinDesc: null,
			defaultIntervals: 1,
			defaultMinutesPerInterval: 0,
			cadenceWindowMinutes: 60,
			sortOrder: 101,
			createdAtIso: startIso,
			updatedAtIso: nowIso
		},
		{
			id: 'demo:habit-deep-work',
			parentId: null,
			title: 'تمرین تمرکز عمیق (آزمایشی)',
			category: 'کار',
			trackingMode: 'interval_cadence',
			timeSlot: 'day',
			isSituational: false,
			status: 'active',
			scheduleLabel: 'در طول روز بدون گوشی',
			notes: null,
			bronzeDesc: null,
			silverDesc: null,
			goldDesc: null,
			emergencyMinDesc: 'حداقل ۵ دقیقه تمرکز پیوسته',
			defaultIntervals: 1,
			defaultMinutesPerInterval: 20,
			cadenceWindowMinutes: 60,
			sortOrder: 102,
			createdAtIso: startIso,
			updatedAtIso: nowIso
		},
		{
			id: 'demo:habit-night-routine',
			parentId: null,
			title: 'روتین آرامش شبانه (آزمایشی)',
			category: 'رشد فردی',
			trackingMode: 'tiered',
			timeSlot: 'night',
			isSituational: false,
			status: 'active',
			scheduleLabel: 'یک ساعت قبل از خواب',
			notes: 'مجموعه‌طرح نمونه برای تست زیرطرح‌ها',
			bronzeDesc: null,
			silverDesc: null,
			goldDesc: null,
			emergencyMinDesc: null,
			defaultIntervals: 1,
			defaultMinutesPerInterval: 0,
			cadenceWindowMinutes: 60,
			sortOrder: 103,
			createdAtIso: startIso,
			updatedAtIso: nowIso
		},
		{
			id: 'demo:habit-sub-reading',
			parentId: 'demo:habit-night-routine',
			title: 'مطالعه آزاد شبانه (آزمایشی)',
			category: 'یادگیری',
			trackingMode: 'tiered',
			timeSlot: 'night',
			isSituational: false,
			status: 'active',
			scheduleLabel: 'قبل از خواب',
			notes: null,
			bronzeDesc: '۵ صفحه کتاب',
			silverDesc: '۱۰ صفحه کتاب',
			goldDesc: '۲۰ صفحه کتاب',
			emergencyMinDesc: null,
			defaultIntervals: 1,
			defaultMinutesPerInterval: 0,
			cadenceWindowMinutes: 60,
			sortOrder: 104,
			createdAtIso: startIso,
			updatedAtIso: nowIso
		},
		{
			id: 'demo:habit-sub-review',
			parentId: 'demo:habit-night-routine',
			title: 'مرور و برنامه‌ریزی فردا (آزمایشی)',
			category: 'رشد فردی',
			trackingMode: 'tiered',
			timeSlot: 'night',
			isSituational: false,
			status: 'active',
			scheduleLabel: 'پایان شب',
			notes: null,
			bronzeDesc: 'ثبت وضعیت روز',
			silverDesc: 'ثبت وضعیت + اولویت فردا',
			goldDesc: 'مرور کامل روز و نوشتن خاطره',
			emergencyMinDesc: null,
			defaultIntervals: 1,
			defaultMinutesPerInterval: 0,
			cadenceWindowMinutes: 60,
			sortOrder: 105,
			createdAtIso: startIso,
			updatedAtIso: nowIso
		}
	];

	const habitMap = new Map(habits.map((h) => [h.id, h]));

	const lifecycleEvents: LifecycleEventEntity[] = habits.map((h) => ({
		id: `demo:lifecycle:${h.id}`,
		habitId: h.id,
		habitTitleSnapshot: h.title,
		eventType: h.parentId ? 'CONVERTED_TO_SUBHABIT' : 'CREATED',
		effectiveDateIso: h.createdAtIso,
		summary: h.parentId
			? `ایجاد زیرطرح آزمایشی «${h.title}»`
			: `ایجاد طرح آزمایشی «${h.title}»`,
		reason: 'تزریق داده‌های آزمایشی جهت بررسی عملکرد سیستم',
		previousStateJson: null,
		newStateJson: JSON.stringify(h),
		createdAtIso: nowIso
	}));

	const dailyPatterns: ReadonlyArray<{
		offset: number;
		workoutTier: number;
		deepMinutes: number;
		readingTier: number;
		reviewTier: number;
		journal: string | null;
	}> = [
		{ offset: -6, workoutTier: 2, deepMinutes: 15, readingTier: 2, reviewTier: 3, journal: 'روز اول تست سیستم؛ ساختار سطح‌بندی طرح‌ها حس خوبی دارد.' },
		{ offset: -5, workoutTier: 3, deepMinutes: 20, readingTier: 3, reviewTier: 3, journal: null },
		{ offset: -4, workoutTier: 1, deepMinutes: 10, readingTier: 1, reviewTier: 2, journal: 'امروز کمی خسته بودم اما حداقل‌های برنزی را حفظ کردم.' },
		{ offset: -3, workoutTier: 3, deepMinutes: 25, readingTier: 3, reviewTier: 3, journal: null },
		{ offset: -2, workoutTier: 0, deepMinutes: 0, readingTier: 1, reviewTier: 1, journal: null },
		{ offset: -1, workoutTier: 3, deepMinutes: 20, readingTier: 2, reviewTier: 3, journal: 'بازگشت به ریتم مطلوب و تکمیل تمرکز عمیق.' },
		{ offset: 0, workoutTier: 3, deepMinutes: 20, readingTier: 3, reviewTier: 3, journal: 'ثبت آزمایشی امروز برای بررسی نمودارها و تقویم.' }
	];

	const dailyEntries: DatabaseBackupPayload['data']['dailyEntries'] = [];
	const habitLogs: DatabaseBackupPayload['data']['habitLogs'] = [];
	const cadencePlans: CadencePlanEntity[] = [];

	for (const pat of dailyPatterns) {
		const dateIso = shiftIsoDate(referenceTodayIso, pat.offset);
		const dayUpdatedIso = `${dateIso}T20:00:00.000Z`;

		cadencePlans.push({
			id: `demo:plan:${dateIso}:demo:habit-deep-work`,
			dateIso,
			habitId: 'demo:habit-deep-work',
			plannedIntervals: 1,
			plannedMinutesPerInterval: 20,
			cadenceWindowMinutes: 60,
			updatedAtIso: dayUpdatedIso
		});

		const rawDayLogs: HabitLogItemInput[] = [
			{
				habitId: 'demo:habit-workout',
				habitTitleSnapshot: habitMap.get('demo:habit-workout')!.title,
				achievedTier: pat.workoutTier,
				achievedRuleSnapshot: resolveHabitRuleSnapshot(habitMap.get('demo:habit-workout')!, pat.workoutTier),
				habitSnapshotJson: serializeHabitSpecSnapshot(habitMap.get('demo:habit-workout')!),
				completedIntervals: null,
				actualMinutesPerInterval: null,
				totalActualMinutes: null,
				plannedIntervalsSnapshot: null,
				plannedMinutesSnapshot: null,
				updatedAtIso: dayUpdatedIso
			},
			{
				habitId: 'demo:habit-deep-work',
				habitTitleSnapshot: habitMap.get('demo:habit-deep-work')!.title,
				achievedTier: pat.deepMinutes >= 20 ? 3 : pat.deepMinutes > 0 ? 1 : 0,
				achievedRuleSnapshot: `${pat.deepMinutes} دقیقه از هدف ۲۰ دقیقه`,
				habitSnapshotJson: serializeHabitSpecSnapshot(habitMap.get('demo:habit-deep-work')!),
				completedIntervals: 1,
				actualMinutesPerInterval: pat.deepMinutes,
				totalActualMinutes: pat.deepMinutes,
				plannedIntervalsSnapshot: 1,
				plannedMinutesSnapshot: 20,
				updatedAtIso: dayUpdatedIso
			},
			{
				habitId: 'demo:habit-sub-reading',
				habitTitleSnapshot: habitMap.get('demo:habit-sub-reading')!.title,
				achievedTier: pat.readingTier,
				achievedRuleSnapshot: resolveHabitRuleSnapshot(habitMap.get('demo:habit-sub-reading')!, pat.readingTier),
				habitSnapshotJson: serializeHabitSpecSnapshot(habitMap.get('demo:habit-sub-reading')!),
				completedIntervals: null,
				actualMinutesPerInterval: null,
				totalActualMinutes: null,
				plannedIntervalsSnapshot: null,
				plannedMinutesSnapshot: null,
				updatedAtIso: dayUpdatedIso
			},
			{
				habitId: 'demo:habit-sub-review',
				habitTitleSnapshot: habitMap.get('demo:habit-sub-review')!.title,
				achievedTier: pat.reviewTier,
				achievedRuleSnapshot: resolveHabitRuleSnapshot(habitMap.get('demo:habit-sub-review')!, pat.reviewTier),
				habitSnapshotJson: serializeHabitSpecSnapshot(habitMap.get('demo:habit-sub-review')!),
				completedIntervals: null,
				actualMinutesPerInterval: null,
				totalActualMinutes: null,
				plannedIntervalsSnapshot: null,
				plannedMinutesSnapshot: null,
				updatedAtIso: dayUpdatedIso
			}
		];

		for (const l of rawDayLogs) {
			habitLogs.push({
				id: `demo:log:${dateIso}:${l.habitId}`,
				dateIso,
				habitId: l.habitId,
				habitTitleSnapshot: l.habitTitleSnapshot ?? null,
				achievedTier: l.achievedTier,
				achievedRuleSnapshot: l.achievedRuleSnapshot ?? null,
				habitSnapshotJson: l.habitSnapshotJson ?? null,
				completedIntervals: l.completedIntervals,
				actualMinutesPerInterval: l.actualMinutesPerInterval,
				totalActualMinutes: l.totalActualMinutes,
				plannedIntervalsSnapshot: l.plannedIntervalsSnapshot,
				plannedMinutesSnapshot: l.plannedMinutesSnapshot,
				updatedAtIso: l.updatedAtIso ?? dayUpdatedIso
			});
		}

		const status = evaluateDayStatusColor(habits, rawDayLogs, {
			dateIso,
			scheduledCadenceHabitIds: new Set(['demo:habit-deep-work'])
		});
		dailyEntries.push({
			id: `demo:entry:${dateIso}`,
			dateIso,
			dayStatus: status,
			reflectionNote: 'ثبت آزمایشی جهت بررسی نمودارها',
			journalText: pat.journal,
			tagsJson: JSON.stringify([DEMO_ENTRY_TAG, status === 'optimal' ? 'انگیزه بالا' : 'خستگی']),
			updatedAtIso: dayUpdatedIso
		});
	}

	const books: BookEntity[] = [
		{
			id: 'demo:book-1',
			title: 'کار عمیق (Deep Work) - آزمایشی',
			author: 'کال نیوپورت',
			status: 'completed',
			startedAtIso: startIso,
			finishedAtIso: referenceTodayIso,
			rating: 5,
			notes: 'نمونه کتاب آزمایشی برای بررسی کتابخانه و تقویم',
			createdAtIso: nowIso,
			updatedAtIso: nowIso
		},
		{
			id: 'demo:book-2',
			title: 'هنر شفاف اندیشیدن - آزمایشی',
			author: 'رولف دوبلی',
			status: 'reading',
			startedAtIso: shiftIsoDate(referenceTodayIso, -2),
			finishedAtIso: null,
			rating: 4,
			notes: 'در حال مطالعه (آزمایشی)',
			createdAtIso: nowIso,
			updatedAtIso: nowIso
		}
	];

	const media: MediaEntity[] = [
		{
			id: 'demo:media-1',
			title: 'Interstellar (آزمایشی)',
			category: 'movie',
			status: 'completed',
			startedAtIso: shiftIsoDate(referenceTodayIso, -3),
			finishedAtIso: shiftIsoDate(referenceTodayIso, -3),
			rating: 5,
			notes: 'نمونه فیلم ثبت‌شده در آرشیو آزمایشی',
			createdAtIso: nowIso,
			updatedAtIso: nowIso
		},
		{
			id: 'demo:media-2',
			title: 'Attack on Titan (آزمایشی)',
			category: 'anime',
			status: 'on_hold',
			startedAtIso: null,
			finishedAtIso: null,
			rating: 5,
			notes: 'نمونه اثر در نوبت تماشا',
			createdAtIso: nowIso,
			updatedAtIso: nowIso
		}
	];

	const notes: NoteEntity[] = [
		{
			id: 'demo:note-1',
			title: 'مستندات رسمی Nuxt (یادداشت آزمایشی)',
			content: 'لینک مستقیم بررسی مستندات:\nhttps://nuxt.com/docs\nشماره پیگیری نمونه: 9876543210',
			category: 'ابزارها',
			isPinned: true,
			createdAtIso: nowIso,
			updatedAtIso: nowIso
		}
	];

	const tomorrowIso = shiftIsoDate(referenceTodayIso, 1);
	const tomorrowParts = isoToJalaliParts(tomorrowIso);

	const calendarEvents: CalendarEventEntity[] = [
		{
			id: 'demo:event-1',
			title: 'ارزیابی هفتگی سیستم (رویداد آزمایشی)',
			eventType: 'reminder',
			isAnnual: false,
			dateIso: tomorrowIso,
			jalaliMonth: tomorrowParts.jm,
			jalaliDay: tomorrowParts.jd,
			isCompleted: false,
			notes: 'نمونه رویداد برای تست بنر یادآور صفحه اصلی و تقویم',
			createdAtIso: nowIso,
			updatedAtIso: nowIso
		}
	];

	return {
		version: 1,
		appName: 'new-life',
		exportedAtIso: nowIso,
		jalaliDate: isoToJalaliSlash(referenceTodayIso),
		data: {
			habits,
			dailyEntries,
			habitLogs,
			cadencePlans,
			books,
			media,
			notes,
			calendarEvents,
			lifecycleEvents,
			reflectionTags: []
		}
	};
}
