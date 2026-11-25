import {
	formatJalaliHuman,
	getDaysUntilIso,
	getPersianWeekdayIndex,
	getTodayIso,
	isoToDate,
	isoToJalaliSlash,
	JALALI_GRID_WEEKDAYS,
	shiftIsoDate
} from '~/domain/calendar';
import {
	CADENCE_SUCCESS_RATIOS,
	LIFECYCLE_EVENT_META,
	QUALITY_SCORES,
	TIER_SCORES
} from '~/domain/constants';
import type {
	AnalyticsRawEntry,
	AnalyticsRawLog,
	AnalyticsTimeRange,
	DayHabitOutcome,
	FullAnalyticsReport,
	HabitComparisonRow,
	HabitDailyPoint,
	HabitEntity,
	HabitEvolutionItem,
	LifecycleEventEntity,
	SelectedHabitAnalytics,
	WeekdayPerformanceStat
} from '~/domain/schemas';
import {
	extractLifecycleRuleDiffs,
	getMaxSupportedTier,
	resolveEffectiveCadenceMinutes,
	resolveHabitRuleSnapshot
} from '~/core/habit-engine';

function resolveDateRangeWindow(
	range: AnalyticsTimeRange,
	entries: AnalyticsRawEntry[],
	logs: AnalyticsRawLog[],
	habits: HabitEntity[],
	fallbackEndIso: string
): { dateList: string[] } {
	let maxIso = fallbackEndIso;
	let minIso = fallbackEndIso;

	for (const e of entries) {
		if (e.dateIso > maxIso) maxIso = e.dateIso;
		if (e.dateIso < minIso) minIso = e.dateIso;
	}
	for (const l of logs) {
		if (l.dateIso > maxIso) maxIso = l.dateIso;
		if (l.dateIso < minIso) minIso = l.dateIso;
	}
	for (const h of habits) {
		const createdDateIso = h.createdAtIso ? h.createdAtIso.slice(0, 10) : '';
		if (createdDateIso) {
			if (createdDateIso < minIso) minIso = createdDateIso;
			if (createdDateIso > maxIso) maxIso = createdDateIso;
		}
	}

	const endIso = maxIso;
	let startIso = endIso;

	if (range === '7d') {
		startIso = shiftIsoDate(endIso, -6);
	} else if (range === '30d') {
		startIso = shiftIsoDate(endIso, -29);
	} else if (range === '90d') {
		startIso = shiftIsoDate(endIso, -89);
	} else {
		const totalSpan = getDaysUntilIso(minIso, endIso) + 1;
		if (totalSpan < 14) {
			startIso = shiftIsoDate(endIso, -13);
		} else {
			startIso = minIso;
		}
	}

	const daysCount = Math.max(1, getDaysUntilIso(startIso, endIso) + 1);
	const dateList: string[] = [];
	for (let i = 0; i < daysCount; i++) {
		dateList.push(shiftIsoDate(startIso, i));
	}

	return { dateList };
}

function averageRounded(values: ReadonlyArray<number>): number | null {
	if (values.length === 0) return null;
	let sum = 0;
	for (const val of values) sum += val;
	return Math.round(sum / values.length);
}

function evaluateSingleLeafHabitDay(
	habit: HabitEntity,
	log: AnalyticsRawLog | undefined
): {
	outcome: DayHabitOutcome;
	score: number | null;
	ruleSnapshot: string | null;
	actualMinutes: number | null;
	plannedMinutes: number | null;
} {
	if (habit.trackingMode === 'interval_cadence') {
		const plannedMinutes =
			log?.plannedMinutesSnapshot && log.plannedMinutesSnapshot > 0
				? log.plannedMinutesSnapshot
				: null;
		const actualMinutes = log ? resolveEffectiveCadenceMinutes(log) : 0;

		if (!plannedMinutes && actualMinutes <= 0) {
			return {
				outcome: 'unlogged',
				score: null,
				ruleSnapshot: null,
				actualMinutes: null,
				plannedMinutes: null
			};
		}

		if (actualMinutes <= 0) {
			return {
				outcome: 'failed',
				score: 0,
				ruleSnapshot: `۰ دقیقه از هدف ${plannedMinutes} دقیقه`,
				actualMinutes: 0,
				plannedMinutes
			};
		}

		const effectiveTarget = plannedMinutes ?? actualMinutes;
		const ratio = effectiveTarget > 0 ? actualMinutes / effectiveTarget : 1;
		const score = Math.min(100, Math.round(ratio * 100));

		if (ratio >= CADENCE_SUCCESS_RATIOS.GOLD_THRESHOLD) {
			return {
				outcome: 'gold',
				score: QUALITY_SCORES.GOLD,
				ruleSnapshot: plannedMinutes
					? `${actualMinutes} دقیقه (تکمیل هدف ${plannedMinutes} دقیقه)`
					: `${actualMinutes} دقیقه انجام‌شده`,
				actualMinutes,
				plannedMinutes: effectiveTarget
			};
		}
		if (ratio >= CADENCE_SUCCESS_RATIOS.SILVER_THRESHOLD) {
			return {
				outcome: 'silver',
				score,
				ruleSnapshot: `${actualMinutes} دقیقه از هدف ${plannedMinutes} دقیقه`,
				actualMinutes,
				plannedMinutes
			};
		}
		return {
			outcome: 'bronze',
			score: Math.max(QUALITY_SCORES.CADENCE_MIN_NONZERO, score),
			ruleSnapshot: `${actualMinutes} دقیقه از هدف ${plannedMinutes} دقیقه`,
			actualMinutes,
			plannedMinutes
		};
	}

	if (!log || log.achievedTier === null || log.achievedTier === undefined) {
		return {
			outcome: 'unlogged',
			score: null,
			ruleSnapshot: null,
			actualMinutes: null,
			plannedMinutes: null
		};
	}

	const tier = log.achievedTier;
	const maxTier = getMaxSupportedTier(habit);
	const ruleSnapshot =
		log.achievedRuleSnapshot || resolveHabitRuleSnapshot(habit, tier) || habit.scheduleLabel;

	if (tier === TIER_SCORES.SKIPPED) {
		return {
			outcome: 'skipped',
			score: null,
			ruleSnapshot: ruleSnapshot || 'امروز موقعیتش پیش نیامد',
			actualMinutes: null,
			plannedMinutes: null
		};
	}

	if (tier === TIER_SCORES.FAILED) {
		return {
			outcome: 'failed',
			score: QUALITY_SCORES.FAILED,
			ruleSnapshot: ruleSnapshot || 'انجام نشد',
			actualMinutes: null,
			plannedMinutes: null
		};
	}

	if (tier >= maxTier || tier === TIER_SCORES.GOLD) {
		return {
			outcome: 'gold',
			score: QUALITY_SCORES.GOLD,
			ruleSnapshot,
			actualMinutes: null,
			plannedMinutes: null
		};
	}

	if (tier === TIER_SCORES.SILVER) {
		return {
			outcome: 'silver',
			score: QUALITY_SCORES.SILVER,
			ruleSnapshot,
			actualMinutes: null,
			plannedMinutes: null
		};
	}

	return {
		outcome: 'bronze',
		score: maxTier === 1 ? QUALITY_SCORES.BRONZE_MAX : QUALITY_SCORES.BRONZE_DEFAULT,
		ruleSnapshot,
		actualMinutes: null,
		plannedMinutes: null
	};
}

function evaluateHabitDay(
	habit: HabitEntity,
	children: HabitEntity[],
	logsByHabitOnDate: Map<string, AnalyticsRawLog> | undefined
) {
	if (children.length === 0) {
		return evaluateSingleLeafHabitDay(habit, logsByHabitOnDate?.get(habit.id));
	}

	const childResults = children.map((child) => ({
		child,
		evalResult: evaluateSingleLeafHabitDay(child, logsByHabitOnDate?.get(child.id))
	}));

	const loggedChildren = childResults.filter((r) => r.evalResult.outcome !== 'unlogged');
	if (loggedChildren.length === 0) {
		return {
			outcome: 'unlogged' as DayHabitOutcome,
			score: null,
			ruleSnapshot: null,
			actualMinutes: null,
			plannedMinutes: null
		};
	}

	const scoredChildrenScores: number[] = [];
	for (const r of loggedChildren) {
		if (r.evalResult.score !== null) {
			scoredChildrenScores.push(r.evalResult.score);
		}
	}
	if (scoredChildrenScores.length === 0) {
		return {
			outcome: 'skipped' as DayHabitOutcome,
			score: null,
			ruleSnapshot: 'موقعیت زیرطرح‌ها پیش نیامد',
			actualMinutes: null,
			plannedMinutes: null
		};
	}

	let scoreSum = 0;
	for (const s of scoredChildrenScores) scoreSum += s;
	const avgScore = Math.round(scoreSum / scoredChildrenScores.length);

	let outcome: DayHabitOutcome = 'bronze';
	if (avgScore === 0) {
		outcome = 'failed';
	} else if (avgScore >= 88) {
		outcome = 'gold';
	} else if (avgScore >= 55) {
		outcome = 'silver';
	}

	const summaryTokens = loggedChildren.map((r) => {
		const label =
			r.evalResult.outcome === 'gold'
				? 'طلا'
				: r.evalResult.outcome === 'silver'
					? 'نقره'
					: r.evalResult.outcome === 'bronze'
						? 'برنز'
						: r.evalResult.outcome === 'skipped'
							? 'پیش نیامد'
							: 'نشد';
		return `${r.child.title}: ${label}`;
	});

	return {
		outcome,
		score: avgScore,
		ruleSnapshot: summaryTokens.join(' • '),
		actualMinutes: null,
		plannedMinutes: null
	};
}

function buildEvolutionTimelineForHabit(
	habit: HabitEntity,
	children: HabitEntity[],
	allEvents: LifecycleEventEntity[],
	allLogsByDate: Map<string, Map<string, AnalyticsRawLog>>,
	referenceTodayIso: string
): HabitEvolutionItem[] {
	const relevantIds = new Set<string>([habit.id, ...children.map((c) => c.id)]);
	const relevantEvents = allEvents
		.filter((ev) => ev.habitId && relevantIds.has(ev.habitId))
		.sort((a, b) => (b.createdAtIso > a.createdAtIso ? 1 : b.createdAtIso < a.createdAtIso ? -1 : 0));

	return relevantEvents.map((ev) => {
		const meta = LIFECYCLE_EVENT_META[ev.eventType];
		const human = formatJalaliHuman(ev.effectiveDateIso, referenceTodayIso);
		const diffs = extractLifecycleRuleDiffs(ev.previousStateJson, ev.newStateJson);

		const beforeScores: number[] = [];
		const afterScores: number[] = [];

		for (let offset = -14; offset < 0; offset++) {
			const dIso = shiftIsoDate(ev.effectiveDateIso, offset);
			const res = evaluateHabitDay(habit, children, allLogsByDate.get(dIso));
			if (res.score !== null) beforeScores.push(res.score);
		}

		for (let offset = 0; offset <= 14; offset++) {
			const dIso = shiftIsoDate(ev.effectiveDateIso, offset);
			const res = evaluateHabitDay(habit, children, allLogsByDate.get(dIso));
			if (res.score !== null) afterScores.push(res.score);
		}

		const beforeSuccessRate = averageRounded(beforeScores);
		const afterSuccessRate = averageRounded(afterScores);

		const impactDelta =
			beforeSuccessRate !== null && afterSuccessRate !== null
				? afterSuccessRate - beforeSuccessRate
				: null;

		return {
			id: ev.id,
			eventType: ev.eventType,
			eventTypeLabel: meta.label,
			badgeClasses: meta.badgeClasses,
			effectiveDateIso: ev.effectiveDateIso,
			humanDateLabel: human.fullLabel,
			summary: ev.summary,
			reason: ev.reason,
			diffs,
			beforeSuccessRate,
			afterSuccessRate,
			impactDelta
		};
	});
}

function computeStreaksFromSeries(
	series: ReadonlyArray<{ dateIso: string; outcome: DayHabitOutcome }>,
	habitCreatedDateIso: string,
	graceEndDateIso: string
): {
	currentStreak: number;
	bestStreak: number;
} {
	let bestStreak = 0;
	let running = 0;
	let hasSeenFirstActivity = false;

	for (let i = 0; i < series.length; i++) {
		const pt = series[i];
		if (!pt) continue;
		const isFinalDay = i === series.length - 1;

		if (pt.outcome === 'gold' || pt.outcome === 'silver' || pt.outcome === 'bronze') {
			hasSeenFirstActivity = true;
			running++;
			if (running > bestStreak) bestStreak = running;
		} else if (pt.outcome === 'skipped') {
			continue;
		} else if (pt.outcome === 'failed') {
			hasSeenFirstActivity = true;
			running = 0;
		} else if (pt.outcome === 'unlogged') {
			if (isFinalDay) continue;
			const isAfterCreation =
				!habitCreatedDateIso || pt.dateIso >= habitCreatedDateIso;
			if (hasSeenFirstActivity && isAfterCreation) {
				running = 0;
			}
		}
	}

	let currentStreak = 0;
	for (let i = series.length - 1; i >= 0; i--) {
		const pt = series[i];
		if (!pt) break;
		const out = pt.outcome;
		if (out === 'gold' || out === 'silver' || out === 'bronze') {
			currentStreak++;
		} else if (out === 'skipped') {
			continue;
		} else if (
			out === 'unlogged' &&
			i === series.length - 1 &&
			pt.dateIso === graceEndDateIso
		) {
			continue;
		} else {
			break;
		}
	}

	return { currentStreak, bestStreak };
}

function computeTrendDelta(validScores: ReadonlyArray<number>, fallbackAvg: number): number {
	if (validScores.length < 2) return 0;
	const mid = Math.floor(validScores.length / 2);
	const firstAvg = averageRounded(validScores.slice(0, mid)) ?? fallbackAvg;
	const secondAvg = averageRounded(validScores.slice(mid)) ?? fallbackAvg;
	return Math.round(secondAvg - firstAvg);
}

export function buildFullAnalyticsReport(params: {
	habits: HabitEntity[];
	entries: AnalyticsRawEntry[];
	logs: AnalyticsRawLog[];
	lifecycleEvents: LifecycleEventEntity[];
	selectedHabitId?: string | null;
	range: AnalyticsTimeRange;
	fallbackEndDateIso: string;
}): FullAnalyticsReport {
	const {
		habits,
		entries,
		logs,
		lifecycleEvents,
		selectedHabitId,
		range,
		fallbackEndDateIso
	} = params;

	const habitById = new Map(habits.map((h) => [h.id, h]));
	const childrenByParentId = Map.groupBy(
		habits.filter((h) => Boolean(h.parentId)),
		(h) => h.parentId!
	);

	const logsByDate = new Map<string, Map<string, AnalyticsRawLog>>();
	for (const log of logs) {
		let dayMap = logsByDate.get(log.dateIso);
		if (!dayMap) {
			dayMap = new Map();
			logsByDate.set(log.dateIso, dayMap);
		}
		dayMap.set(log.habitId, log);
	}

	const { dateList } = resolveDateRangeWindow(
		range,
		entries,
		logs,
		habits,
		fallbackEndDateIso
	);

	const { dateList: allTimeDateList } =
		range === 'all'
			? { dateList }
			: resolveDateRangeWindow('all', entries, logs, habits, fallbackEndDateIso);

	const sortedHabits = [...habits].sort((a, b) => {
		if (a.status === 'archived' && b.status !== 'archived') return 1;
		if (a.status !== 'archived' && b.status === 'archived') return -1;
		return a.sortOrder - b.sortOrder;
	});

	const selectableHabits = sortedHabits.map((h) => {
		const parent = h.parentId ? habitById.get(h.parentId) : null;
		const prefix = parent ? `↳ ${h.title}` : h.title;
		const suffix = h.status === 'archived' ? ' (بایگانی)' : '';

		return {
			habit: h,
			parentTitle: parent?.title ?? null,
			displayLabel: `${prefix}${suffix}`
		};
	});

	const targetHabit =
		(selectedHabitId ? habitById.get(selectedHabitId) : null) ??
		selectableHabits[0]?.habit ??
		null;

	const streaksByHabitId = new Map<string, { currentStreak: number; bestStreak: number }>();

	const comparisonRows: HabitComparisonRow[] = selectableHabits.map((item) => {
		const h = item.habit;
		const children = childrenByParentId.get(h.id) ?? [];
		const seriesScores: Array<{ iso: string; outcome: DayHabitOutcome; score: number | null }> =
			[];

		let goldCount = 0;
		let silverCount = 0;
		let bronzeCount = 0;
		let failedCount = 0;

		for (const dIso of dateList) {
			const res = evaluateHabitDay(h, children, logsByDate.get(dIso));
			seriesScores.push({ iso: dIso, outcome: res.outcome, score: res.score });
			if (res.outcome === 'gold') goldCount++;
			else if (res.outcome === 'silver') silverCount++;
			else if (res.outcome === 'bronze') bronzeCount++;
			else if (res.outcome === 'failed') failedCount++;
		}

		const loggedDays = goldCount + silverCount + bronzeCount + failedCount;
		const successDays = goldCount + silverCount + bronzeCount;
		const consistencyRate =
			loggedDays > 0 ? Math.round((successDays / loggedDays) * 100) : 0;

		const validScores = seriesScores
			.map((s) => s.score)
			.filter((s): s is number => s !== null);
		const avgQualityScore = averageRounded(validScores) ?? 0;

		const trendDelta = computeTrendDelta(validScores, avgQualityScore);
		const habitCreatedDateIso = h.createdAtIso ? h.createdAtIso.slice(0, 10) : '';
		const fullStreakSeries =
			range === 'all'
				? seriesScores.map((s) => ({ dateIso: s.iso, outcome: s.outcome }))
				: allTimeDateList.map((dIso) => ({
						dateIso: dIso,
						outcome: evaluateHabitDay(h, children, logsByDate.get(dIso)).outcome
					}));
		const streaks = computeStreaksFromSeries(
			fullStreakSeries,
			habitCreatedDateIso,
			fallbackEndDateIso
		);
		streaksByHabitId.set(h.id, streaks);

		return {
			habit: h,
			parentTitle: item.parentTitle,
			loggedDays,
			successDays,
			goldCount,
			silverCount,
			bronzeCount,
			failedCount,
			consistencyRate,
			avgQualityScore,
			currentStreak: streaks.currentStreak,
			trendDelta
		};
	});

	let selectedHabitReport: SelectedHabitAnalytics | null = null;

	if (targetHabit) {
		const todayIso = getTodayIso();
		const children = childrenByParentId.get(targetHabit.id) ?? [];
		const parent = targetHabit.parentId ? habitById.get(targetHabit.parentId) : null;
		const evolutionTimeline = buildEvolutionTimelineForHabit(
			targetHabit,
			children,
			lifecycleEvents,
			logsByDate,
			todayIso
		);

		const eventsByDate = Map.groupBy(evolutionTimeline, (ev) => ev.effectiveDateIso);

		const dailySeries: HabitDailyPoint[] = [];
		const recentValidScores: number[] = [];

		let goldCount = 0;
		let silverCount = 0;
		let bronzeCount = 0;
		let failedCount = 0;
		let totalActualMinutes = 0;
		let totalPlannedMinutes = 0;
		let cadenceLoggedDays = 0;

		for (const dIso of dateList) {
			const dt = isoToDate(dIso);
			const weekdayIndex = getPersianWeekdayIndex(dt);
			const human = formatJalaliHuman(dIso, todayIso);

			const evalRes = evaluateHabitDay(
				targetHabit,
				children,
				logsByDate.get(dIso)
			);

			if (evalRes.score !== null) {
				recentValidScores.push(evalRes.score);
			}
			const rollingAvgScore = averageRounded(recentValidScores.slice(-7));

			if (evalRes.outcome === 'gold') goldCount++;
			else if (evalRes.outcome === 'silver') silverCount++;
			else if (evalRes.outcome === 'bronze') bronzeCount++;
			else if (evalRes.outcome === 'failed') failedCount++;

			if (evalRes.actualMinutes !== null) {
				totalActualMinutes += evalRes.actualMinutes;
				totalPlannedMinutes += evalRes.plannedMinutes ?? 0;
				cadenceLoggedDays++;
			}

			dailySeries.push({
				dateIso: dIso,
				jalaliSlash: isoToJalaliSlash(dIso),
				humanLabel: human.fullLabel,
				weekdayIndex,
				outcome: evalRes.outcome,
				score: evalRes.score,
				rollingAvgScore,
				ruleSnapshot: evalRes.ruleSnapshot,
				actualMinutes: evalRes.actualMinutes,
				plannedMinutes: evalRes.plannedMinutes,
				lifecycleEventsOnDay: eventsByDate.get(dIso) ?? []
			});
		}

		const loggedDaysCount = goldCount + silverCount + bronzeCount + failedCount;
		const successDaysCount = goldCount + silverCount + bronzeCount;
		const consistencyRate =
			loggedDaysCount > 0 ? Math.round((successDaysCount / loggedDaysCount) * 100) : 0;
		const goldRate =
			loggedDaysCount > 0 ? Math.round((goldCount / loggedDaysCount) * 100) : 0;

		const avgQualityScore = averageRounded(recentValidScores) ?? 0;

		const trendDelta = computeTrendDelta(recentValidScores, avgQualityScore);

		const { currentStreak, bestStreak } = streaksByHabitId.get(targetHabit.id) ?? {
			currentStreak: 0,
			bestStreak: 0
		};

		const weekdayBuckets = Array.from({ length: 7 }, (_, idx) => ({
			weekdayIndex: idx,
			weekdayLabel: JALALI_GRID_WEEKDAYS[idx] ?? '',
			loggedDays: 0,
			scoreSum: 0
		}));

		for (const pt of dailySeries) {
			if (pt.score === null) continue;
			const b = weekdayBuckets[pt.weekdayIndex];
			if (!b) continue;
			b.loggedDays++;
			b.scoreSum += pt.score;
		}

		const weekdayStats: WeekdayPerformanceStat[] = weekdayBuckets.map((b) => ({
			weekdayIndex: b.weekdayIndex,
			weekdayLabel: b.weekdayLabel,
			loggedDays: b.loggedDays,
			avgScore: b.loggedDays > 0 ? Math.round(b.scoreSum / b.loggedDays) : 0
		}));

		selectedHabitReport = {
			habit: targetHabit,
			parentTitle: parent?.title ?? null,
			maxSupportedTier: getMaxSupportedTier(targetHabit),
			dailySeries,
			loggedDaysCount,
			successDaysCount,
			goldCount,
			silverCount,
			bronzeCount,
			failedCount,
			consistencyRate,
			goldRate,
			avgQualityScore,
			trendDelta,
			currentStreak,
			bestStreak,
			totalActualMinutes: Number(totalActualMinutes.toFixed(1)),
			avgActualMinutes:
				cadenceLoggedDays > 0
					? Number((totalActualMinutes / cadenceLoggedDays).toFixed(1))
					: 0,
			avgPlannedMinutes:
				cadenceLoggedDays > 0
					? Number((totalPlannedMinutes / cadenceLoggedDays).toFixed(1))
					: 0,
			weekdayStats,
			evolutionTimeline
		};
	}

	return {
		range,
		selectableHabits,
		selectedHabitReport,
		comparisonRows
	};
}
