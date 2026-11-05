import { COMPOSITE_FULL_LABEL, TIER_SCORES } from '~/domain/constants';
import type {
	DayStatusColor,
	HabitEntity,
	HabitHistoricalSpec,
	HabitLogItemInput,
	HabitTreeNode
} from '~/domain/schemas';

export function resolveEffectiveCadenceMinutes(
	log:
		| Pick<
				HabitLogItemInput,
				'actualMinutesPerInterval' | 'totalActualMinutes' | 'completedIntervals'
		  >
		| null
		| undefined
): number {
	if (!log) return 0;
	const perInterval = log.actualMinutesPerInterval ?? 0;
	const intervals = log.completedIntervals;
	if (intervals !== null && intervals !== undefined && intervals > 0 && perInterval > 0) {
		return Number((intervals * perInterval).toFixed(1));
	}
	if (log.totalActualMinutes !== null && log.totalActualMinutes !== undefined && log.totalActualMinutes > 0) {
		return log.totalActualMinutes;
	}
	return perInterval;
}

export function serializeHabitSpecSnapshot(habit: HabitEntity): string {
	const spec: HabitHistoricalSpec = {
		title: habit.title,
		category: habit.category,
		scheduleLabel: habit.scheduleLabel,
		notes: habit.notes,
		bronzeDesc: habit.bronzeDesc,
		silverDesc: habit.silverDesc,
		goldDesc: habit.goldDesc,
		emergencyMinDesc: habit.emergencyMinDesc,
		isSituational: habit.isSituational
	};
	return JSON.stringify(spec);
}

export function parseHabitSpecSnapshot(
	rawJson: string | null | undefined,
	fallbackHabit: HabitEntity | undefined,
	fallbackTitle: string
): HabitHistoricalSpec {
	let parsed: Partial<HabitHistoricalSpec> = {};
	if (rawJson) {
		try {
			parsed = JSON.parse(rawJson) as Partial<HabitHistoricalSpec>;
		} catch {
			parsed = {};
		}
	}

	return {
		title: parsed.title || fallbackTitle,
		category: parsed.category || fallbackHabit?.category || 'عمومی',
		scheduleLabel: parsed.scheduleLabel ?? fallbackHabit?.scheduleLabel ?? null,
		notes: parsed.notes ?? fallbackHabit?.notes ?? null,
		bronzeDesc: parsed.bronzeDesc ?? fallbackHabit?.bronzeDesc ?? null,
		silverDesc: parsed.silverDesc ?? fallbackHabit?.silverDesc ?? null,
		goldDesc: parsed.goldDesc ?? fallbackHabit?.goldDesc ?? null,
		emergencyMinDesc: parsed.emergencyMinDesc ?? fallbackHabit?.emergencyMinDesc ?? null,
		isSituational: Boolean(parsed.isSituational ?? fallbackHabit?.isSituational)
	};
}

export function resolveHabitRuleSnapshot(
	habit: Pick<
		HabitEntity,
		| 'trackingMode'
		| 'scheduleLabel'
		| 'bronzeDesc'
		| 'silverDesc'
		| 'goldDesc'
		| 'emergencyMinDesc'
	>,
	achievedTier: number | null | undefined
): string | null {
	if (habit.trackingMode === 'interval_cadence') {
		return habit.scheduleLabel?.trim() || null;
	}
	if (achievedTier === null || achievedTier === undefined) {
		return null;
	}
	if (achievedTier === TIER_SCORES.SKIPPED) {
		return 'امروز موقعیتش پیش نیامد';
	}
	if (achievedTier === TIER_SCORES.FAILED) {
		const minRule = habit.bronzeDesc?.trim();
		return minRule ? `عدم انجام (${minRule})` : 'انجام نشد';
	}
	if (achievedTier === TIER_SCORES.GOLD) {
		return (
			habit.goldDesc?.trim() ||
			habit.silverDesc?.trim() ||
			habit.bronzeDesc?.trim() ||
			null
		);
	}
	if (achievedTier === TIER_SCORES.SILVER) {
		return habit.silverDesc?.trim() || habit.bronzeDesc?.trim() || null;
	}
	if (achievedTier === TIER_SCORES.BRONZE) {
		return habit.bronzeDesc?.trim() || habit.emergencyMinDesc?.trim() || null;
	}
	return null;
}

export function getApplicableHabitsForDate(
	habits: HabitEntity[],
	options?: {
		dateIso?: string;
		hasExistingEntry?: boolean;
		loggedHabitIds?: ReadonlySet<string>;
	}
): HabitEntity[] {
	const loggedSet = options?.loggedHabitIds ?? new Set<string>();
	const dateIso = options?.dateIso;
	const hasExistingEntry = Boolean(options?.hasExistingEntry);

	const parentIdsWithLoggedChildren = new Set<string>();
	for (const h of habits) {
		if (h.parentId && loggedSet.has(h.id)) {
			parentIdsWithLoggedChildren.add(h.parentId);
		}
	}

	return habits.filter((h) => {
		if (loggedSet.has(h.id) || parentIdsWithLoggedChildren.has(h.id)) {
			return true;
		}
		if (h.status === 'archived') {
			return false;
		}
		if (hasExistingEntry && dateIso && h.createdAtIso > dateIso) {
			return false;
		}
		return true;
	});
}

export function buildHabitTree(
	habits: HabitEntity[],
	options?: {
		dateIso?: string;
		hasExistingEntry?: boolean;
		loggedHabitIds?: ReadonlySet<string>;
	}
): {
	tieredRoots: HabitTreeNode[];
	cadenceHabits: HabitEntity[];
} {
	const applicableHabits = getApplicableHabitsForDate(habits, options);
	const childrenByParent = new Map<string, HabitEntity[]>();

	for (const h of applicableHabits) {
		if (h.parentId) {
			const list = childrenByParent.get(h.parentId) ?? [];
			list.push(h);
			childrenByParent.set(h.parentId, list);
		}
	}

	const tieredRoots: HabitTreeNode[] = [];
	const cadenceHabits: HabitEntity[] = [];

	for (const h of applicableHabits) {
		if (h.trackingMode === 'interval_cadence') {
			cadenceHabits.push(h);
		} else if (!h.parentId) {
			const children = (childrenByParent.get(h.id) ?? []).sort(
				(a, b) => a.sortOrder - b.sortOrder
			);
			tieredRoots.push({
				...h,
				children,
				timeSlot: h.timeSlot
			});
		}
	}

	tieredRoots.sort((a, b) => a.sortOrder - b.sortOrder);
	cadenceHabits.sort((a, b) => a.sortOrder - b.sortOrder);

	return { tieredRoots, cadenceHabits };
}

export function getMaxSupportedTier(
	habit: Pick<HabitEntity, 'bronzeDesc' | 'silverDesc' | 'goldDesc'>
): 1 | 2 | 3 {
	if (habit.goldDesc && habit.goldDesc.trim() !== '' && habit.goldDesc.trim() !== '~') {
		return TIER_SCORES.GOLD;
	}
	if (habit.silverDesc && habit.silverDesc.trim() !== '' && habit.silverDesc.trim() !== '~') {
		return TIER_SCORES.SILVER;
	}
	return TIER_SCORES.BRONZE;
}

export function computeCompositeParentDisplay(
	children: HabitEntity[],
	logsByHabitId: Record<string, HabitLogItemInput>
): string {
	if (children.length === 0) return '-';
	const tokens = children.map((child) => {
		const log = logsByHabitId[child.id];
		if (!log || log.achievedTier === null || log.achievedTier === undefined) {
			return '0';
		}
		if (log.achievedTier === TIER_SCORES.SKIPPED) {
			return '-';
		}
		return String(log.achievedTier);
	});
	const allMax = tokens.every((t) => t === String(TIER_SCORES.GOLD));
	if (allMax) return COMPOSITE_FULL_LABEL;
	return tokens.join('/');
}

export function isHabitNodeCompleted(params: {
	habitId: string;
	habits: HabitEntity[];
	logsByHabitId: Record<string, HabitLogItemInput>;
	hasExistingEntry: boolean;
	isDirty: boolean;
}): boolean {
	const { habitId, habits, logsByHabitId, hasExistingEntry, isDirty } = params;
	const habit = habits.find((h) => h.id === habitId);
	if (!habit) return false;

	const children = habits.filter((h) => h.parentId === habitId && h.status === 'active');
	if (children.length > 0) {
		return children.every((c) => {
			const tier = logsByHabitId[c.id]?.achievedTier;
			return tier !== null && tier !== undefined;
		});
	}

	if (habit.trackingMode === 'tiered') {
		const tier = logsByHabitId[habit.id]?.achievedTier;
		return tier !== null && tier !== undefined;
	}

	const actual = resolveEffectiveCadenceMinutes(logsByHabitId[habit.id]);
	return actual > 0 && (hasExistingEntry || isDirty);
}

export function computeDailyCompletionStats(params: {
	applicableHabits: HabitEntity[];
	loggedHabitIds: ReadonlySet<string>;
	logsByHabitId: Record<string, HabitLogItemInput>;
	hasExistingEntry: boolean;
	isDirty: boolean;
}): {
	completed: number;
	goldCount: number;
	total: number;
	percent: number;
} {
	const { applicableHabits, loggedHabitIds, logsByHabitId, hasExistingEntry, isDirty } =
		params;

	const trackable = applicableHabits.filter((h) => {
		if (h.status === 'paused' && !loggedHabitIds.has(h.id)) return false;
		const hasChildren = applicableHabits.some((c) => c.parentId === h.id);
		return !hasChildren;
	});

	const total = trackable.length;
	if (total === 0) return { completed: 0, goldCount: 0, total: 0, percent: 100 };

	let completed = 0;
	let goldCount = 0;

	for (const h of trackable) {
		const log = logsByHabitId[h.id];
		if (!log) continue;

		if (h.trackingMode === 'tiered') {
			const tier = log.achievedTier;
			if (tier === TIER_SCORES.SKIPPED) {
				completed++;
			} else if (tier !== null && tier !== undefined && tier > 0) {
				completed++;
				const maxTier = getMaxSupportedTier(h);
				if (tier === maxTier) goldCount++;
			}
		} else {
			const actual = resolveEffectiveCadenceMinutes(log);
			const planned = log.plannedMinutesSnapshot ?? 0;
			if (actual > 0 && (hasExistingEntry || isDirty)) {
				completed++;
				if (planned <= 0 || actual >= planned) goldCount++;
			}
		}
	}

	return {
		completed,
		goldCount,
		total,
		percent: Math.round((completed / total) * 100)
	};
}

export function evaluateDayStatusColor(
	habits: HabitEntity[],
	logs: HabitLogItemInput[]
): DayStatusColor {
	if (logs.length === 0) return 'failed';

	const logMap = new Map(logs.map((l) => [l.habitId, l]));
	const loggedIds = new Set(
		logs
			.filter(
				(l) =>
					(l.achievedTier !== null && l.achievedTier !== undefined) ||
					resolveEffectiveCadenceMinutes(l) > 0
			)
			.map((l) => l.habitId)
	);
	const trackable = habits.filter((h) => {
		const isLogged = loggedIds.has(h.id);
		if (h.status !== 'active' && !isLogged) return false;
		const hasChildren = habits.some(
			(child) =>
				child.parentId === h.id &&
				(child.status === 'active' || loggedIds.has(child.id))
		);
		return !hasChildren;
	});

	if (trackable.length === 0) return 'optimal';

	let optimalCount = 0;
	let zeroCount = 0;

	for (const habit of trackable) {
		const log = logMap.get(habit.id);
		if (!log) {
			zeroCount++;
			continue;
		}

		if (habit.trackingMode === 'tiered') {
			const tier = log.achievedTier ?? 0;
			if (tier === TIER_SCORES.SKIPPED) {
				optimalCount++;
			} else if (tier === TIER_SCORES.FAILED) {
				zeroCount++;
			} else {
				optimalCount++;
			}
		} else {
			const actualMinutes = resolveEffectiveCadenceMinutes(log);
			const plannedMinutes = log.plannedMinutesSnapshot ?? habit.defaultMinutesPerInterval;
			if (actualMinutes <= 0) {
				zeroCount++;
			} else if (plannedMinutes <= 0 || actualMinutes >= plannedMinutes) {
				optimalCount++;
			}
		}
	}

	if (zeroCount === trackable.length) return 'failed';
	if (optimalCount === trackable.length && zeroCount === 0) return 'optimal';
	return 'partial';
}
