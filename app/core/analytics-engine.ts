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
	TagCorrelationStat,
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
): { startIso: string; endIso: string; dateList: string[] } {
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

	if (minIso > maxIso) {
		minIso = maxIso;
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

	return { startIso, endIso, dateList };
}

function evaluateSingleLeafHabitDay(
	habit: HabitEntity,
	log: AnalyticsRawLog | undefined,
	hasDailyEntry: boolean
): {
	outcome: DayHabitOutcome;
	tierLevel: number | null;
	score: number | null;
	ruleSnapshot: string | null;
	actualMinutes: number | null;
	plannedMinutes: number | null;
	completedIntervals: number | null;
} {
	if (habit.trackingMode === 'interval_cadence') {
		const plannedMinutes =
			log?.plannedMinutesSnapshot && log.plannedMinutesSnapshot > 0
				? log.plannedMinutesSnapshot
				: null;
		const actualMinutes = log ? resolveEffectiveCadenceMinutes(log) : 0;
		const completedIntervals = log?.completedIntervals ?? null;

		if (!plannedMinutes && actualMinutes <= 0) {
			return {
				outcome: 'unlogged',
				tierLevel: null,
				score: null,
				ruleSnapshot: null,
				actualMinutes: null,
				plannedMinutes: null,
				completedIntervals: null
			};
		}

		if (actualMinutes <= 0) {
			return {
				outcome: 'failed',
				tierLevel: 0,
				score: 0,
				ruleSnapshot: `۰ دقیقه از هدف ${plannedMinutes} دقیقه`,
				actualMinutes: 0,
				plannedMinutes,
				completedIntervals
			};
		}

		const effectiveTarget = plannedMinutes ?? actualMinutes;
		const ratio = effectiveTarget > 0 ? actualMinutes / effectiveTarget : 1;
		const score = Math.min(100, Math.round(ratio * 100));

		if (ratio >= CADENCE_SUCCESS_RATIOS.GOLD_THRESHOLD) {
			return {
				outcome: 'gold',
				tierLevel: 3,
				score: QUALITY_SCORES.GOLD,
				ruleSnapshot: plannedMinutes
					? `${actualMinutes} دقیقه (تکمیل هدف ${plannedMinutes} دقیقه)`
					: `${actualMinutes} دقیقه انجام‌شده`,
				actualMinutes,
				plannedMinutes: effectiveTarget,
				completedIntervals
			};
		}
		if (ratio >= CADENCE_SUCCESS_RATIOS.SILVER_THRESHOLD) {
			return {
				outcome: 'silver',
				tierLevel: 2,
				score,
				ruleSnapshot: `${actualMinutes} دقیقه از هدف ${plannedMinutes} دقیقه`,
				actualMinutes,
				plannedMinutes,
				completedIntervals
			};
		}
		return {
			outcome: 'bronze',
			tierLevel: 1,
			score: Math.max(QUALITY_SCORES.CADENCE_MIN_NONZERO, score),
			ruleSnapshot: `${actualMinutes} دقیقه از هدف ${plannedMinutes} دقیقه`,
			actualMinutes,
			plannedMinutes,
			completedIntervals
		};
	}

	if (!log || log.achievedTier === null || log.achievedTier === undefined) {
		return {
			outcome: 'unlogged',
			tierLevel: null,
			score: null,
			ruleSnapshot: null,
			actualMinutes: null,
			plannedMinutes: null,
			completedIntervals: null
		};
	}

	const tier = log.achievedTier;
	const maxTier = getMaxSupportedTier(habit);
	const ruleSnapshot =
		log.achievedRuleSnapshot || resolveHabitRuleSnapshot(habit, tier) || habit.scheduleLabel;

	if (tier === TIER_SCORES.SKIPPED) {
		return {
			outcome: 'skipped',
			tierLevel: -1,
			score: null,
			ruleSnapshot: ruleSnapshot || 'امروز موقعیتش پیش نیامد',
			actualMinutes: null,
			plannedMinutes: null,
			completedIntervals: null
		};
	}

	if (tier === TIER_SCORES.FAILED) {
		return {
			outcome: 'failed',
			tierLevel: 0,
			score: QUALITY_SCORES.FAILED,
			ruleSnapshot: ruleSnapshot || 'انجام نشد',
			actualMinutes: null,
			plannedMinutes: null,
			completedIntervals: null
		};
	}

	if (tier >= maxTier || tier === TIER_SCORES.GOLD) {
		return {
			outcome: 'gold',
			tierLevel: 3,
			score: QUALITY_SCORES.GOLD,
			ruleSnapshot,
			actualMinutes: null,
			plannedMinutes: null,
			completedIntervals: null
		};
	}

	if (tier === TIER_SCORES.SILVER) {
		return {
			outcome: 'silver',
			tierLevel: 2,
			score: QUALITY_SCORES.SILVER,
			ruleSnapshot,
			actualMinutes: null,
			plannedMinutes: null,
			completedIntervals: null
		};
	}

	return {
		outcome: 'bronze',
		tierLevel: 1,
		score: maxTier === 1 ? QUALITY_SCORES.BRONZE_MAX : QUALITY_SCORES.BRONZE_DEFAULT,
		ruleSnapshot,
		actualMinutes: null,
		plannedMinutes: null,
		completedIntervals: null
	};
}

function evaluateHabitDay(
	habit: HabitEntity,
	children: HabitEntity[],
	logsByHabitOnDate: Map<string, AnalyticsRawLog> | undefined,
	hasDailyEntry: boolean
) {
	if (children.length === 0) {
		const log = logsByHabitOnDate?.get(habit.id);
		return evaluateSingleLeafHabitDay(habit, log, hasDailyEntry);
	}

	const childResults = children.map((child) => ({
		child,
		evalResult: evaluateSingleLeafHabitDay(
			child,
			logsByHabitOnDate?.get(child.id),
			hasDailyEntry
		)
	}));

	const loggedChildren = childResults.filter((r) => r.evalResult.outcome !== 'unlogged');
	if (loggedChildren.length === 0) {
		return {
			outcome: 'unlogged' as DayHabitOutcome,
			tierLevel: null,
			score: null,
			ruleSnapshot: null,
			actualMinutes: null,
			plannedMinutes: null,
			completedIntervals: null
		};
	}

	const scoredChildren = loggedChildren.filter((r) => r.evalResult.score !== null);
	if (scoredChildren.length === 0) {
		return {
			outcome: 'skipped' as DayHabitOutcome,
			tierLevel: -1,
			score: null,
			ruleSnapshot: 'موقعیت زیرطرح‌ها پیش نیامد',
			actualMinutes: null,
			plannedMinutes: null,
			completedIntervals: null
		};
	}

	const avgScore = Math.round(
		scoredChildren.reduce((acc, r) => acc + (r.evalResult.score ?? 0), 0) /
			scoredChildren.length
	);

	let outcome: DayHabitOutcome = 'bronze';
	let tierLevel = 1;
	if (avgScore === 0) {
		outcome = 'failed';
		tierLevel = 0;
	} else if (avgScore >= 88) {
		outcome = 'gold';
		tierLevel = 3;
	} else if (avgScore >= 55) {
		outcome = 'silver';
		tierLevel = 2;
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
		tierLevel,
		score: avgScore,
		ruleSnapshot: summaryTokens.join(' • '),
		actualMinutes: null,
		plannedMinutes: null,
		completedIntervals: null
	};
}

function buildEvolutionTimelineForHabit(
	habit: HabitEntity,
	children: HabitEntity[],
	allEvents: LifecycleEventEntity[],
	allLogsByDate: Map<string, Map<string, AnalyticsRawLog>>,
	entryByDate: Map<string, AnalyticsRawEntry>,
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
			const res = evaluateHabitDay(
				habit,
				children,
				allLogsByDate.get(dIso),
				entryByDate.has(dIso)
			);
			if (res.score !== null) beforeScores.push(res.score);
		}

		for (let offset = 0; offset <= 14; offset++) {
			const dIso = shiftIsoDate(ev.effectiveDateIso, offset);
			const res = evaluateHabitDay(
				habit,
				children,
				allLogsByDate.get(dIso),
				entryByDate.has(dIso)
			);
			if (res.score !== null) afterScores.push(res.score);
		}

		const beforeSuccessRate =
			beforeScores.length > 0
				? Math.round(beforeScores.reduce((a, b) => a + b, 0) / beforeScores.length)
				: null;

		const afterSuccessRate =
			afterScores.length > 0
				? Math.round(afterScores.reduce((a, b) => a + b, 0) / afterScores.length)
				: null;

		const impactDelta =
			beforeSuccessRate !== null && afterSuccessRate !== null
				? afterSuccessRate - beforeSuccessRate
				: null;

		return {
			id: ev.id,
			habitId: ev.habitId,
			habitTitle: ev.habitTitleSnapshot,
			eventType: ev.eventType,
			eventTypeLabel: meta.label,
			badgeClasses: meta.badgeClasses,
			effectiveDateIso: ev.effectiveDateIso,
			jalaliSlash: isoToJalaliSlash(ev.effectiveDateIso),
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
	series: ReadonlyArray<{ outcome: DayHabitOutcome }>
): {
	currentStreak: number;
	bestStreak: number;
} {
	let bestStreak = 0;
	let running = 0;

	for (const pt of series) {
		if (pt.outcome === 'gold' || pt.outcome === 'silver' || pt.outcome === 'bronze') {
			running++;
			if (running > bestStreak) bestStreak = running;
		} else if (pt.outcome === 'failed') {
			running = 0;
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
		} else if (out === 'unlogged' && i === series.length - 1) {
			// Allow the final day in window to be unlogged if the user hasn't logged it yet
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
	const firstHalf = validScores.slice(0, mid);
	const secondHalf = validScores.slice(mid);
	const firstAvg =
		firstHalf.length > 0
			? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
			: fallbackAvg;
	const secondAvg =
		secondHalf.length > 0
			? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
			: fallbackAvg;
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

	const entryByDate = new Map(entries.map((e) => [e.dateIso, e]));
	const logsByDate = new Map<string, Map<string, AnalyticsRawLog>>();
	for (const log of logs) {
		let dayMap = logsByDate.get(log.dateIso);
		if (!dayMap) {
			dayMap = new Map();
			logsByDate.set(log.dateIso, dayMap);
		}
		dayMap.set(log.habitId, log);
	}

	const { startIso, endIso, dateList } = resolveDateRangeWindow(
		range,
		entries,
		logs,
		habits,
		fallbackEndDateIso
	);

	const sortedHabits = [...habits].sort((a, b) => {
		if (a.status === 'archived' && b.status !== 'archived') return 1;
		if (a.status !== 'archived' && b.status === 'archived') return -1;
		return a.sortOrder - b.sortOrder;
	});

	const selectableHabits = sortedHabits.map((h) => {
		const parent = h.parentId ? habitById.get(h.parentId) : null;
		const children = childrenByParentId.get(h.id) ?? [];
		const isComposite = children.length > 0;
		const prefix = parent ? `↳ ${h.title}` : h.title;
		const suffix = h.status === 'archived' ? ' (بایگانی)' : '';

		return {
			habit: h,
			parentTitle: parent?.title ?? null,
			isComposite,
			displayLabel: `${prefix}${suffix}`
		};
	});

	const targetHabit =
		(selectedHabitId ? habitById.get(selectedHabitId) : null) ??
		selectableHabits[0]?.habit ??
		null;

	const comparisonRows: HabitComparisonRow[] = selectableHabits.map((item) => {
		const h = item.habit;
		const children = childrenByParentId.get(h.id) ?? [];
		const seriesScores: Array<{ iso: string; outcome: DayHabitOutcome; score: number | null }> =
			[];

		let goldCount = 0;
		let silverCount = 0;
		let bronzeCount = 0;
		let failedCount = 0;
		let skippedCount = 0;

		for (const dIso of dateList) {
			const res = evaluateHabitDay(
				h,
				children,
				logsByDate.get(dIso),
				entryByDate.has(dIso)
			);
			seriesScores.push({ iso: dIso, outcome: res.outcome, score: res.score });
			if (res.outcome === 'gold') goldCount++;
			else if (res.outcome === 'silver') silverCount++;
			else if (res.outcome === 'bronze') bronzeCount++;
			else if (res.outcome === 'failed') failedCount++;
			else if (res.outcome === 'skipped') skippedCount++;
		}

		const loggedDays = goldCount + silverCount + bronzeCount + failedCount;
		const successDays = goldCount + silverCount + bronzeCount;
		const consistencyRate =
			loggedDays > 0 ? Math.round((successDays / loggedDays) * 100) : 0;

		const validScores = seriesScores
			.map((s) => s.score)
			.filter((s): s is number => s !== null);
		const avgQualityScore =
			validScores.length > 0
				? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
				: 0;

		const trendDelta = computeTrendDelta(validScores, avgQualityScore);
		const { currentStreak, bestStreak } = computeStreaksFromSeries(seriesScores);

		const relevantIds = new Set([h.id, ...children.map((c) => c.id)]);
		const lifecycleChangesCount = lifecycleEvents.filter(
			(ev) => ev.habitId && relevantIds.has(ev.habitId)
		).length;

		return {
			habit: h,
			parentTitle: item.parentTitle,
			isComposite: item.isComposite,
			loggedDays,
			successDays,
			goldCount,
			silverCount,
			bronzeCount,
			failedCount,
			skippedCount,
			consistencyRate,
			avgQualityScore,
			currentStreak,
			bestStreak,
			trendDelta,
			lifecycleChangesCount
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
			entryByDate,
			todayIso
		);

		const eventsByDate = Map.groupBy(evolutionTimeline, (ev) => ev.effectiveDateIso);

		const dailySeries: HabitDailyPoint[] = [];
		const recentValidScores: number[] = [];

		let goldCount = 0;
		let silverCount = 0;
		let bronzeCount = 0;
		let failedCount = 0;
		let skippedCount = 0;
		let totalActualMinutes = 0;
		let totalPlannedMinutes = 0;
		let cadenceLoggedDays = 0;

		for (const dIso of dateList) {
			const dt = isoToDate(dIso);
			const weekdayIndex = getPersianWeekdayIndex(dt);
			const weekdayLabel = JALALI_GRID_WEEKDAYS[weekdayIndex] ?? '';
			const human = formatJalaliHuman(dIso, todayIso);
			const entry = entryByDate.get(dIso);

			const evalRes = evaluateHabitDay(
				targetHabit,
				children,
				logsByDate.get(dIso),
				Boolean(entry)
			);

			if (evalRes.score !== null) {
				recentValidScores.push(evalRes.score);
			}
			const windowSlice = recentValidScores.slice(-7);
			const rollingAvgScore =
				windowSlice.length > 0
					? Math.round(windowSlice.reduce((a, b) => a + b, 0) / windowSlice.length)
					: null;

			if (evalRes.outcome === 'gold') goldCount++;
			else if (evalRes.outcome === 'silver') silverCount++;
			else if (evalRes.outcome === 'bronze') bronzeCount++;
			else if (evalRes.outcome === 'failed') failedCount++;
			else if (evalRes.outcome === 'skipped') skippedCount++;

			if (evalRes.actualMinutes !== null) {
				totalActualMinutes += evalRes.actualMinutes;
				totalPlannedMinutes += evalRes.plannedMinutes ?? 0;
				cadenceLoggedDays++;
			}

			dailySeries.push({
				dateIso: dIso,
				jalaliSlash: isoToJalaliSlash(dIso),
				humanLabel: human.fullLabel,
				weekdayLabel,
				weekdayIndex,
				outcome: evalRes.outcome,
				tierLevel: evalRes.tierLevel,
				score: evalRes.score,
				rollingAvgScore,
				ruleSnapshot: evalRes.ruleSnapshot,
				actualMinutes: evalRes.actualMinutes,
				plannedMinutes: evalRes.plannedMinutes,
				completedIntervals: evalRes.completedIntervals,
				dayTags: entry?.tags ?? [],
				lifecycleEventsOnDay: eventsByDate.get(dIso) ?? []
			});
		}

		const loggedDaysCount = goldCount + silverCount + bronzeCount + failedCount;
		const successDaysCount = goldCount + silverCount + bronzeCount;
		const consistencyRate =
			loggedDaysCount > 0 ? Math.round((successDaysCount / loggedDaysCount) * 100) : 0;
		const goldRate =
			loggedDaysCount > 0 ? Math.round((goldCount / loggedDaysCount) * 100) : 0;

		const avgQualityScore =
			recentValidScores.length > 0
				? Math.round(
						recentValidScores.reduce((a, b) => a + b, 0) / recentValidScores.length
					)
				: 0;

		const trendDelta = computeTrendDelta(recentValidScores, avgQualityScore);

		const { currentStreak, bestStreak } = computeStreaksFromSeries(dailySeries);

		const weekdayBuckets = Array.from({ length: 7 }, (_, idx) => ({
			weekdayIndex: idx,
			weekdayLabel: JALALI_GRID_WEEKDAYS[idx] ?? '',
			loggedDays: 0,
			successDays: 0,
			goldDays: 0,
			scoreSum: 0
		}));

		for (const pt of dailySeries) {
			if (pt.score === null) continue;
			const b = weekdayBuckets[pt.weekdayIndex];
			if (!b) continue;
			b.loggedDays++;
			b.scoreSum += pt.score;
			if (pt.outcome === 'gold' || pt.outcome === 'silver' || pt.outcome === 'bronze') {
				b.successDays++;
			}
			if (pt.outcome === 'gold') {
				b.goldDays++;
			}
		}

		const weekdayStats: WeekdayPerformanceStat[] = weekdayBuckets.map((b) => ({
			weekdayIndex: b.weekdayIndex,
			weekdayLabel: b.weekdayLabel,
			loggedDays: b.loggedDays,
			successDays: b.successDays,
			goldDays: b.goldDays,
			successRate: b.loggedDays > 0 ? Math.round((b.successDays / b.loggedDays) * 100) : 0,
			avgScore: b.loggedDays > 0 ? Math.round(b.scoreSum / b.loggedDays) : 0
		}));

		const activeWeekdays = weekdayStats.filter((w) => w.loggedDays > 0);
		const bestWeekday =
			activeWeekdays.length > 0
				? [...activeWeekdays].sort((a, b) => b.avgScore - a.avgScore)[0]
				: null;
		const weakestWeekday =
			activeWeekdays.length > 1
				? [...activeWeekdays].sort((a, b) => a.avgScore - b.avgScore)[0]
				: null;

		const tagMap = new Map<
			string,
			{ occurrences: number; scoreSum: number; successCount: number }
		>();
		for (const pt of dailySeries) {
			if (pt.score === null) continue;
			for (const tag of pt.dayTags) {
				const cur = tagMap.get(tag) ?? { occurrences: 0, scoreSum: 0, successCount: 0 };
				cur.occurrences++;
				cur.scoreSum += pt.score;
				if (pt.score > 0) cur.successCount++;
				tagMap.set(tag, cur);
			}
		}

		const tagCorrelations: TagCorrelationStat[] = Array.from(tagMap.entries())
			.map(([tag, stat]) => {
				const avgScoreWithTag = Math.round(stat.scoreSum / stat.occurrences);
				const successRateWithTag = Math.round(
					(stat.successCount / stat.occurrences) * 100
				);
				return {
					tag,
					occurrences: stat.occurrences,
					avgScoreWithTag,
					successRateWithTag,
					impactDelta: avgScoreWithTag - avgQualityScore
				};
			})
			.sort((a, b) => Math.abs(b.impactDelta) - Math.abs(a.impactDelta));

		selectedHabitReport = {
			habit: targetHabit,
			parentTitle: parent?.title ?? null,
			isComposite: children.length > 0,
			childrenCount: children.length,
			maxSupportedTier: getMaxSupportedTier(targetHabit),
			dailySeries,
			loggedDaysCount,
			successDaysCount,
			goldCount,
			silverCount,
			bronzeCount,
			failedCount,
			skippedCount,
			consistencyRate,
			goldRate,
			avgQualityScore,
			trendDelta,
			currentStreak,
			bestStreak,
			totalActualMinutes: Number(totalActualMinutes.toFixed(1)),
			totalPlannedMinutes: Number(totalPlannedMinutes.toFixed(1)),
			avgActualMinutes:
				cadenceLoggedDays > 0
					? Number((totalActualMinutes / cadenceLoggedDays).toFixed(1))
					: 0,
			avgPlannedMinutes:
				cadenceLoggedDays > 0
					? Number((totalPlannedMinutes / cadenceLoggedDays).toFixed(1))
					: 0,
			weekdayStats,
			bestWeekday: bestWeekday ?? null,
			weakestWeekday: weakestWeekday ?? null,
			tagCorrelations,
			evolutionTimeline
		};
	}

	return {
		range,
		startDateIso: startIso,
		endDateIso: endIso,
		totalDaysInWindow: dateList.length,
		selectableHabits,
		selectedHabitReport,
		comparisonRows
	};
}
