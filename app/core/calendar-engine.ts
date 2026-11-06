import {
	buildJalaliMonthGrid,
	formatJalaliHuman,
	getDaysUntilIso,
	isoToJalaliParts,
	jalaliPartsToIso,
	shiftIsoDate
} from '~/domain/calendar';
import { parseTagsJson } from '~/domain/tags';
import type {
	AnalyticsRawLog,
	BookEntity,
	CalendarDayAggregate,
	CalendarEventEntity,
	DayHabitPerformanceItem,
	HabitEntity,
	MediaEntity,
	RawCalendarDayEntry,
	UpcomingEventBannerItem
} from '~/domain/schemas';
import {
	parseHabitSpecSnapshot,
	resolveEffectiveCadenceMinutes,
	resolveHabitRuleSnapshot
} from './habit-engine';

export function computeUpcomingEventsBanner(params: {
	allEvents: CalendarEventEntity[];
	referenceDateIso: string;
	todayIso: string;
	horizonDays?: number;
}): {
	todayAndUpcoming: UpcomingEventBannerItem[];
	selectedDayEvents: CalendarEventEntity[];
} {
	const { allEvents, referenceDateIso, todayIso, horizonDays = 7 } = params;

	const selectedParts = isoToJalaliParts(referenceDateIso);
	const selectedDayEvents = allEvents.filter((ev) => {
		if (ev.isAnnual) {
			return ev.jalaliMonth === selectedParts.jm && ev.jalaliDay === selectedParts.jd;
		}
		return ev.dateIso === referenceDateIso;
	});

	const windowIsos = new Map<string, { jm: number; jd: number; diff: number }>();
	for (let offset = 0; offset <= horizonDays; offset++) {
		const iso = shiftIsoDate(todayIso, offset);
		const p = isoToJalaliParts(iso);
		windowIsos.set(iso, { jm: p.jm, jd: p.jd, diff: offset });
	}

	const upcoming: UpcomingEventBannerItem[] = [];

	for (const ev of allEvents) {
		if (!ev.isAnnual && ev.isCompleted) continue;

		if (ev.isAnnual) {
			for (const [iso, meta] of windowIsos.entries()) {
				if (meta.jm === ev.jalaliMonth && meta.jd === ev.jalaliDay) {
					const human = formatJalaliHuman(iso, todayIso);
					upcoming.push({
						id: ev.id,
						title: ev.title,
						eventType: ev.eventType,
						isAnnual: true,
						isCompleted: ev.isCompleted,
						occurrenceDateIso: iso,
						humanDateLabel: human.fullLabel,
						daysRemaining: meta.diff,
						notes: ev.notes
					});
					break;
				}
			}
		} else if (ev.dateIso) {
			const diff = getDaysUntilIso(todayIso, ev.dateIso);
			if (diff >= -1 && diff <= horizonDays) {
				const human = formatJalaliHuman(ev.dateIso, todayIso);
				upcoming.push({
					id: ev.id,
					title: ev.title,
					eventType: ev.eventType,
					isAnnual: false,
					isCompleted: ev.isCompleted,
					occurrenceDateIso: ev.dateIso,
					humanDateLabel: human.fullLabel,
					daysRemaining: diff,
					notes: ev.notes
				});
			}
		}
	}

	upcoming.sort((a, b) => a.daysRemaining - b.daysRemaining);

	return {
		todayAndUpcoming: upcoming,
		selectedDayEvents
	};
}

export function assembleJalaliMonthArchive(params: {
	jy: number;
	jm: number;
	todayIso: string;
	selectedIso?: string;
	allHabits: HabitEntity[];
	entriesInMonth: RawCalendarDayEntry[];
	logsInMonth: AnalyticsRawLog[];
	eventsInMonth: CalendarEventEntity[];
	booksInMonth: BookEntity[];
	mediaInMonth: MediaEntity[];
}) {
	const {
		jy,
		jm,
		todayIso,
		selectedIso,
		allHabits,
		entriesInMonth,
		logsInMonth,
		eventsInMonth,
		booksInMonth,
		mediaInMonth
	} = params;

	const grid = buildJalaliMonthGrid(jy, jm, todayIso);
	const startIso = grid.days[0]?.iso ?? todayIso;

	const habitMap = new Map(allHabits.map((h) => [h.id, h]));
	const parentHabitIds = new Set(
		allHabits.filter((h) => Boolean(h.parentId)).map((h) => h.parentId!)
	);

	const entryByIso = new Map(entriesInMonth.map((e) => [e.dateIso, e]));
	const logsByIso = Map.groupBy(logsInMonth, (log) => log.dateIso);

	const annualEventsByJalaliKey = Map.groupBy(
		eventsInMonth.filter((ev) => ev.isAnnual),
		(ev) => `${ev.jalaliMonth}-${ev.jalaliDay}`
	);
	const datedEventsByIso = Map.groupBy(
		eventsInMonth.filter((ev) => !ev.isAnnual && Boolean(ev.dateIso)),
		(ev) => ev.dateIso!
	);

	const booksActivityByIso = new Map<string, CalendarDayAggregate['booksActivity']>();
	for (const b of booksInMonth) {
		if (b.finishedAtIso) {
			const list = booksActivityByIso.get(b.finishedAtIso) ?? [];
			list.push({ book: b, activityKind: 'finished' });
			booksActivityByIso.set(b.finishedAtIso, list);
		} else if (b.startedAtIso) {
			const list = booksActivityByIso.get(b.startedAtIso) ?? [];
			list.push({ book: b, activityKind: 'started' });
			booksActivityByIso.set(b.startedAtIso, list);
		}
	}

	const mediaActivityByIso = new Map<string, CalendarDayAggregate['mediaActivity']>();
	for (const m of mediaInMonth) {
		if (m.finishedAtIso) {
			const list = mediaActivityByIso.get(m.finishedAtIso) ?? [];
			list.push({ media: m, activityKind: 'finished' });
			mediaActivityByIso.set(m.finishedAtIso, list);
		} else if (m.startedAtIso) {
			const list = mediaActivityByIso.get(m.startedAtIso) ?? [];
			list.push({ media: m, activityKind: 'started' });
			mediaActivityByIso.set(m.startedAtIso, list);
		}
	}

	const daysAggregate: CalendarDayAggregate[] = grid.days.map((cell) => {
		const rawEntry = entryByIso.get(cell.iso);
		const rawLogs = logsByIso.get(cell.iso) ?? [];
		const human = formatJalaliHuman(cell.iso, todayIso);

		const annualDayEvents = annualEventsByJalaliKey.get(`${cell.jm}-${cell.jd}`) ?? [];
		const specificDayEvents = datedEventsByIso.get(cell.iso) ?? [];
		const dayEvents =
			annualDayEvents.length > 0 && specificDayEvents.length > 0
				? [...annualDayEvents, ...specificDayEvents]
				: annualDayEvents.length > 0
					? annualDayEvents
					: specificDayEvents;

		const booksActivity = booksActivityByIso.get(cell.iso) ?? [];
		const mediaActivity = mediaActivityByIso.get(cell.iso) ?? [];

		const habitPerformances: DayHabitPerformanceItem[] = [];
		for (const log of rawLogs) {
			const h = habitMap.get(log.habitId);
			if (h && parentHabitIds.has(h.id)) continue;

			const trackingMode = h?.trackingMode ?? 'tiered';
			if (
				trackingMode === 'tiered' &&
				(log.achievedTier === null || log.achievedTier === undefined) &&
				h?.status === 'archived'
			) {
				continue;
			}

			const actualMinutes = resolveEffectiveCadenceMinutes(log);
			const plannedMinutes = log.plannedMinutesSnapshot ?? null;
			if (
				trackingMode === 'interval_cadence' &&
				actualMinutes <= 0 &&
				(!plannedMinutes || plannedMinutes <= 0)
			) {
				continue;
			}

			const title = log.habitTitleSnapshot || h?.title || 'طرح حذف‌شده';
			const achievedRule =
				log.achievedRuleSnapshot ||
				(h ? resolveHabitRuleSnapshot(h, log.achievedTier) : null);

			const specSnapshot = parseHabitSpecSnapshot(log.habitSnapshotJson, h, title);

			habitPerformances.push({
				habitId: log.habitId,
				title,
				trackingMode,
				achievedTier: log.achievedTier,
				achievedRule,
				actualMinutes,
				completedIntervals: log.completedIntervals ?? null,
				plannedMinutes,
				isArchived: h ? h.status === 'archived' : true,
				specSnapshot
			});
		}

		return {
			iso: cell.iso,
			jy: cell.jy,
			jm: cell.jm,
			jd: cell.jd,
			weekdayLabel: cell.weekdayLabel,
			fullHumanLabel: human.fullLabel,
			isToday: cell.isToday,
			entry: rawEntry
				? {
						dayStatus: rawEntry.dayStatus,
						reflectionNote: rawEntry.reflectionNote,
						journalText: rawEntry.journalText ?? null,
						tags: rawEntry.tags ?? parseTagsJson(rawEntry.tagsJson)
					}
				: null,
			habitPerformances,
			events: dayEvents,
			booksActivity,
			mediaActivity
		};
	});

	const defaultSelectedIso =
		selectedIso && daysAggregate.some((d) => d.iso === selectedIso)
			? selectedIso
			: daysAggregate.some((d) => d.isToday)
				? todayIso
				: (jalaliPartsToIso({ jy, jm, jd: 1 }) ?? startIso);

	return {
		year: grid.year,
		month: grid.month,
		monthName: grid.monthName,
		leadingEmptyCells: grid.leadingEmptyCells,
		selectedIso: defaultSelectedIso,
		days: daysAggregate
	};
}
