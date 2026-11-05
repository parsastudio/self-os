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
	upcomingEvents: UpcomingEventBannerItem[];
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
		mediaInMonth,
		upcomingEvents
	} = params;

	const grid = buildJalaliMonthGrid(jy, jm, todayIso);
	const startIso = grid.days[0]?.iso ?? todayIso;

	const habitMap = new Map(allHabits.map((h) => [h.id, h]));
	const parentHabitIds = new Set<string>();
	for (const h of allHabits) {
		if (h.parentId) parentHabitIds.add(h.parentId);
	}

	const entryByIso = new Map(entriesInMonth.map((e) => [e.dateIso, e]));
	const logsByIso = new Map<string, AnalyticsRawLog[]>();
	for (const log of logsInMonth) {
		const list = logsByIso.get(log.dateIso) ?? [];
		list.push(log);
		logsByIso.set(log.dateIso, list);
	}

	const daysAggregate: CalendarDayAggregate[] = grid.days.map((cell) => {
		const rawEntry = entryByIso.get(cell.iso);
		const rawLogs = logsByIso.get(cell.iso) ?? [];
		const human = formatJalaliHuman(cell.iso, todayIso);

		const dayEvents = eventsInMonth.filter((ev) => {
			if (ev.isAnnual) return ev.jalaliMonth === cell.jm && ev.jalaliDay === cell.jd;
			return ev.dateIso === cell.iso;
		});

		const booksActivity: CalendarDayAggregate['booksActivity'] = [];
		for (const b of booksInMonth) {
			if (b.finishedAtIso === cell.iso) {
				booksActivity.push({ book: b, activityKind: 'finished' });
			} else if (b.startedAtIso === cell.iso) {
				booksActivity.push({ book: b, activityKind: 'started' });
			}
		}

		const mediaActivity: CalendarDayAggregate['mediaActivity'] = [];
		for (const m of mediaInMonth) {
			if (m.finishedAtIso === cell.iso) {
				mediaActivity.push({ media: m, activityKind: 'finished' });
			} else if (m.startedAtIso === cell.iso) {
				mediaActivity.push({ media: m, activityKind: 'started' });
			}
		}

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
				actualMinutes: resolveEffectiveCadenceMinutes(log),
				completedIntervals: log.completedIntervals ?? null,
				plannedMinutes:
					log.plannedMinutesSnapshot ?? h?.defaultMinutesPerInterval ?? null,
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

	const monthStats = {
		optimalDays: daysAggregate.filter((d) => d.entry?.dayStatus === 'optimal').length,
		partialDays: daysAggregate.filter((d) => d.entry?.dayStatus === 'partial').length,
		failedDays: daysAggregate.filter((d) => d.entry?.dayStatus === 'failed').length,
		totalEvents: eventsInMonth.length,
		finishedBooksCount: daysAggregate.reduce(
			(acc, d) => acc + d.booksActivity.filter((b) => b.activityKind === 'finished').length,
			0
		),
		finishedMediaCount: daysAggregate.reduce(
			(acc, d) => acc + d.mediaActivity.filter((m) => m.activityKind === 'finished').length,
			0
		)
	};

	return {
		year: grid.year,
		month: grid.month,
		monthName: grid.monthName,
		leadingEmptyCells: grid.leadingEmptyCells,
		selectedIso: defaultSelectedIso,
		days: daysAggregate,
		monthStats,
		upcomingEvents
	};
}
