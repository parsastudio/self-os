import { COMPOSITE_FULL_LABEL, DEFAULT_HABIT_CATEGORY, TIER_SCORES } from '~/domain/constants';
import type {
	CreateHabitInput,
	DayStatusColor,
	HabitEntity,
	HabitHistoricalSpec,
	HabitLogItemInput,
	HabitRuleDiffItem,
	HabitTreeNode,
	LifecycleEventEntity,
	MutateHabitStructureInput,
	SaveDailyEntryInput
} from '~/domain/schemas';

export function isDailyEntryEmpty(
	input: Pick<SaveDailyEntryInput, 'reflectionNote' | 'journalText' | 'tags' | 'logs'>
): boolean {
	return (
		(!input.reflectionNote || input.reflectionNote.trim() === '') &&
		(!input.journalText || input.journalText.trim() === '') &&
		input.tags.length === 0 &&
		input.logs.every(
			(l) =>
				(l.achievedTier === null || l.achievedTier === undefined) &&
				(l.totalActualMinutes === null ||
					l.totalActualMinutes === 0 ||
					l.totalActualMinutes === undefined)
		)
	);
}

export function resolveEffectiveCadenceMinutes(
	log:
		| Partial<
				Pick<
					HabitLogItemInput,
					'actualMinutesPerInterval' | 'totalActualMinutes' | 'completedIntervals'
				>
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
	const habitById = new Map(habits.map((h) => [h.id, h]));

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
		if (h.parentId) {
			const parent = habitById.get(h.parentId);
			if (!parent || parent.status === 'archived') {
				return false;
			}
		}
		if (dateIso && h.createdAtIso.slice(0, 10) > dateIso) {
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

	const habitById = new Map(applicableHabits.map((h) => [h.id, h]));
	const trackable = applicableHabits.filter((h) => {
		if (h.status === 'paused' && !loggedHabitIds.has(h.id)) return false;
		if (h.parentId) {
			const parent = habitById.get(h.parentId);
			if (parent?.status === 'paused' && !loggedHabitIds.has(h.id)) return false;
		}
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
					l.actualMinutesPerInterval !== null ||
					resolveEffectiveCadenceMinutes(l) > 0
			)
			.map((l) => l.habitId)
	);
	const habitById = new Map(habits.map((h) => [h.id, h]));
	const trackable = habits.filter((h) => {
		const isLogged = loggedIds.has(h.id);
		if (h.status !== 'active' && !isLogged) return false;
		if (h.parentId) {
			const parent = habitById.get(h.parentId);
			if ((!parent || parent.status !== 'active') && !isLogged) return false;
		}
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

export function extractLifecycleRuleDiffs(
	prevJson: string | null,
	newJson: string | null
): HabitRuleDiffItem[] {
	if (!prevJson || !newJson) return [];
	try {
		const prev = JSON.parse(prevJson) as Record<string, unknown>;
		const next = JSON.parse(newJson) as Record<string, unknown>;
		const diffs: HabitRuleDiffItem[] = [];

		const fields: Array<{ key: string; label: string }> = [
			{ key: 'title', label: 'عنوان طرح' },
			{ key: 'scheduleLabel', label: 'زمان انجام' },
			{ key: 'bronzeDesc', label: 'شرط برنز (حداقل)' },
			{ key: 'silverDesc', label: 'شرط نقره' },
			{ key: 'goldDesc', label: 'شرط طلا' },
			{ key: 'emergencyMinDesc', label: 'حداقل اضطراری' },
			{ key: 'defaultMinutesPerInterval', label: 'دقیقه هدف در هر بازه' },
			{ key: 'cadenceWindowMinutes', label: 'پنجره زمانی تکرار (دقیقه)' },
			{ key: 'status', label: 'وضعیت فعال‌بودن' },
			{ key: 'notes', label: 'تبصره طرح' }
		];

		for (const f of fields) {
			const oldVal = String(prev[f.key] ?? '').trim();
			const newVal = String(next[f.key] ?? '').trim();
			if (oldVal !== newVal && (oldVal !== '' || newVal !== '')) {
				diffs.push({
					fieldLabel: f.label,
					previousValue: oldVal || 'تعریف‌نشده',
					newValue: newVal || 'حذف‌شده'
				});
			}
		}

		if (
			typeof prev.minutes === 'number' &&
			typeof next.minutes === 'number' &&
			prev.minutes !== next.minutes
		) {
			diffs.push({
				fieldLabel: 'هدف روزانه (دقیقه)',
				previousValue: `${prev.minutes} دقیقه`,
				newValue: `${next.minutes} دقیقه`
			});
		}

		return diffs;
	} catch {
		return [];
	}
}

export function buildCreatedHabitWithLifecycle(params: {
	input: CreateHabitInput;
	maxSortOrder: number;
	todayIso: string;
	nowIso: string;
}): {
	habit: HabitEntity;
	lifecycleEvent: LifecycleEventEntity;
} {
	const { input, maxSortOrder, todayIso, nowIso } = params;

	const habit: HabitEntity = {
		id: crypto.randomUUID(),
		parentId: input.parentId ?? null,
		title: input.title.trim(),
		category: input.category.trim() || DEFAULT_HABIT_CATEGORY,
		trackingMode: input.trackingMode,
		timeSlot: input.timeSlot ?? 'day',
		isSituational: input.isSituational ?? false,
		status: 'active',
		scheduleLabel: input.scheduleLabel?.trim() || null,
		notes: input.notes?.trim() || null,
		bronzeDesc: input.bronzeDesc?.trim() || null,
		silverDesc: input.silverDesc?.trim() || null,
		goldDesc: input.goldDesc?.trim() || null,
		emergencyMinDesc: input.emergencyMinDesc?.trim() || null,
		defaultIntervals: input.defaultIntervals,
		defaultMinutesPerInterval: input.defaultMinutesPerInterval,
		cadenceWindowMinutes: input.cadenceWindowMinutes,
		sortOrder: maxSortOrder + 1,
		createdAtIso: todayIso,
		updatedAtIso: nowIso
	};

	const lifecycleEvent: LifecycleEventEntity = {
		id: crypto.randomUUID(),
		habitId: habit.id,
		habitTitleSnapshot: habit.title,
		eventType: habit.parentId ? 'CONVERTED_TO_SUBHABIT' : 'CREATED',
		effectiveDateIso: todayIso,
		summary: habit.parentId
			? `ایجاد زیرطرح «${habit.title}»`
			: `ایجاد طرح «${habit.title}»`,
		reason: input.reason?.trim() || null,
		previousStateJson: null,
		newStateJson: JSON.stringify(habit),
		createdAtIso: nowIso
	};

	return { habit, lifecycleEvent };
}

export function buildUpdatedHabitWithLifecycle(params: {
	current: HabitEntity;
	input: MutateHabitStructureInput;
	parentTitle?: string | null;
	todayIso: string;
	nowIso: string;
}): {
	updatedHabit: HabitEntity;
	lifecycleEvent: LifecycleEventEntity;
} {
	const { current, input, parentTitle, todayIso, nowIso } = params;

	let eventType: LifecycleEventEntity['eventType'] = 'UPDATED_RULES';
	let summary = `ویرایش شرایط طرح «${input.title}»`;

	if (current.parentId !== input.parentId) {
		if (input.parentId) {
			eventType = 'CONVERTED_TO_SUBHABIT';
			summary = `تبدیل «${input.title}» به زیرطرحِ «${parentTitle ?? 'والد'}»`;
		} else {
			eventType = 'PROMOTED_TO_ROOT';
			summary = `تبدیل «${input.title}» به طرح مستقل`;
		}
	} else if (current.status !== input.status) {
		eventType = input.status === 'archived' ? 'DELETED' : 'STATUS_CHANGED';
		summary = `تغییر وضعیت «${input.title}» به ${input.status}`;
	}

	const updatedHabit: HabitEntity = {
		...current,
		title: input.title.trim(),
		category: input.category.trim() || current.category,
		parentId: input.parentId,
		timeSlot: input.timeSlot ?? current.timeSlot,
		isSituational: input.isSituational,
		status: input.status,
		scheduleLabel: input.scheduleLabel?.trim() || null,
		notes: input.notes?.trim() || null,
		bronzeDesc: input.bronzeDesc?.trim() || null,
		silverDesc: input.silverDesc?.trim() || null,
		goldDesc: input.goldDesc?.trim() || null,
		emergencyMinDesc: input.emergencyMinDesc?.trim() || null,
		defaultMinutesPerInterval:
			input.defaultMinutesPerInterval !== undefined
				? input.defaultMinutesPerInterval
				: current.defaultMinutesPerInterval,
		updatedAtIso: nowIso
	};

	const lifecycleEvent: LifecycleEventEntity = {
		id: crypto.randomUUID(),
		habitId: input.habitId,
		habitTitleSnapshot: updatedHabit.title,
		eventType,
		effectiveDateIso: todayIso,
		summary,
		reason: input.reason,
		previousStateJson: JSON.stringify(current),
		newStateJson: JSON.stringify(input),
		createdAtIso: nowIso
	};

	return { updatedHabit, lifecycleEvent };
}
