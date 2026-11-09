import { generateId } from '~/domain/calendar';
import { COMPOSITE_FULL_LABEL, DEFAULT_HABIT_CATEGORY, TIER_SCORES } from '~/domain/constants';
import {
	HabitLifecycleStateSnapshotSchema,
	type CompositeChildrenStatus,
	type CreateHabitInput,
	type DayStatusColor,
	type HabitEntity,
	type HabitHistoricalSpec,
	type HabitLifecycleStateSnapshot,
	type HabitLogItemInput,
	type HabitRuleDiffItem,
	type HabitTreeNode,
	type LifecycleEventEntity,
	type MutateHabitStructureInput,
	type SaveDailyEntryInput,
	type TierButtonDescriptor
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

export function shouldDiscardHabitLogItem(
	habit: HabitEntity | undefined,
	log: Pick<
		HabitLogItemInput,
		| 'achievedTier'
		| 'plannedMinutesSnapshot'
		| 'actualMinutesPerInterval'
		| 'totalActualMinutes'
	>
): boolean {
	const isUnloggedTiered =
		habit?.trackingMode === 'tiered' &&
		(log.achievedTier === null || log.achievedTier === undefined);

	const isUnscheduledAndUnloggedCadence =
		habit?.trackingMode === 'interval_cadence' &&
		(!log.plannedMinutesSnapshot || log.plannedMinutesSnapshot <= 0) &&
		(!log.actualMinutesPerInterval || log.actualMinutesPerInterval <= 0) &&
		(!log.totalActualMinutes || log.totalActualMinutes <= 0);

	return isUnloggedTiered || isUnscheduledAndUnloggedCadence;
}

export function resolveDailyHabitLogSnapshot(params: {
	habit: HabitEntity | undefined;
	log: HabitLogItemInput;
	previousLog?: {
		achievedTier: number | null;
		habitTitleSnapshot: string | null;
		achievedRuleSnapshot: string | null;
		habitSnapshotJson: string | null;
		plannedIntervalsSnapshot: number | null;
		plannedMinutesSnapshot: number | null;
	} | null;
	fallbackUpdatedAtIso: string;
}) {
	const { habit, log, previousLog, fallbackUpdatedAtIso } = params;
	const tierUnchanged = Boolean(
		previousLog && previousLog.achievedTier === log.achievedTier
	);

	const habitTitleSnapshot =
		(tierUnchanged && previousLog?.habitTitleSnapshot) ||
		log.habitTitleSnapshot ||
		habit?.title ||
		previousLog?.habitTitleSnapshot ||
		'طرح';

	const achievedRuleSnapshot =
		(tierUnchanged && previousLog?.achievedRuleSnapshot) ||
		(habit ? resolveHabitRuleSnapshot(habit, log.achievedTier) : null) ||
		log.achievedRuleSnapshot ||
		previousLog?.achievedRuleSnapshot ||
		null;

	const habitSnapshotJson =
		(tierUnchanged && previousLog?.habitSnapshotJson) ||
		(habit
			? serializeHabitSpecSnapshot(habit)
			: (log.habitSnapshotJson ?? previousLog?.habitSnapshotJson ?? null));

	return {
		habitTitleSnapshot,
		achievedTier: log.achievedTier,
		achievedRuleSnapshot,
		habitSnapshotJson,
		completedIntervals: log.completedIntervals ?? null,
		actualMinutesPerInterval: log.actualMinutesPerInterval ?? null,
		totalActualMinutes: log.totalActualMinutes ?? null,
		plannedIntervalsSnapshot:
			log.plannedIntervalsSnapshot ?? previousLog?.plannedIntervalsSnapshot ?? null,
		plannedMinutesSnapshot:
			log.plannedMinutesSnapshot ?? previousLog?.plannedMinutesSnapshot ?? null,
		updatedAtIso: log.updatedAtIso || fallbackUpdatedAtIso
	};
}

export function getApplicableHabitsForDate(
	habits: HabitEntity[],
	options?: {
		dateIso?: string;
		hasExistingEntry?: boolean;
		loggedHabitIds?: ReadonlySet<string>;
		scheduledCadenceHabitIds?: ReadonlySet<string>;
	}
): HabitEntity[] {
	const loggedSet = options?.loggedHabitIds ?? new Set<string>();
	const scheduledCadenceSet = options?.scheduledCadenceHabitIds;
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
		if (h.status === 'archived' || h.status === 'paused') {
			return false;
		}
		if (h.trackingMode === 'interval_cadence') {
			return Boolean(scheduledCadenceSet?.has(h.id));
		}
		if (h.parentId) {
			const parent = habitById.get(h.parentId);
			if (!parent || parent.status === 'archived' || parent.status === 'paused') {
				return false;
			}
		}
		if (dateIso && options?.hasExistingEntry && h.createdAtIso.slice(0, 10) > dateIso) {
			return false;
		}
		return true;
	});
}

export function resolveHistoricalHabitForDate(params: {
	habit: HabitEntity;
	dateIso: string;
	logSnapshotJson?: string | null;
	lifecycleEvents?: ReadonlyArray<LifecycleEventEntity>;
}): HabitEntity {
	const { habit, dateIso, logSnapshotJson, lifecycleEvents } = params;

	if (logSnapshotJson) {
		try {
			const parsed = JSON.parse(logSnapshotJson) as Partial<HabitHistoricalSpec>;
			return {
				...habit,
				title: parsed.title || habit.title,
				category: parsed.category || habit.category,
				scheduleLabel:
					parsed.scheduleLabel !== undefined ? parsed.scheduleLabel : habit.scheduleLabel,
				notes: parsed.notes !== undefined ? parsed.notes : habit.notes,
				bronzeDesc: parsed.bronzeDesc !== undefined ? parsed.bronzeDesc : habit.bronzeDesc,
				silverDesc: parsed.silverDesc !== undefined ? parsed.silverDesc : habit.silverDesc,
				goldDesc: parsed.goldDesc !== undefined ? parsed.goldDesc : habit.goldDesc,
				emergencyMinDesc:
					parsed.emergencyMinDesc !== undefined
						? parsed.emergencyMinDesc
						: habit.emergencyMinDesc,
				isSituational:
					parsed.isSituational !== undefined ? Boolean(parsed.isSituational) : habit.isSituational
			};
		} catch {
			// Fallback to lifecycle events or current habit
		}
	}

	if (lifecycleEvents && lifecycleEvents.length > 0) {
		const futureEvents = lifecycleEvents
			.filter(
				(ev) =>
					ev.habitId === habit.id &&
					ev.effectiveDateIso > dateIso &&
					Boolean(ev.previousStateJson)
			)
			.sort((a, b) =>
				a.createdAtIso > b.createdAtIso ? 1 : a.createdAtIso < b.createdAtIso ? -1 : 0
			);

		const earliestFutureEvent = futureEvents[0];
		if (earliestFutureEvent?.previousStateJson) {
			try {
				const prev = JSON.parse(earliestFutureEvent.previousStateJson) as Partial<HabitEntity>;
				return {
					...habit,
					title: prev.title || habit.title,
					scheduleLabel:
						prev.scheduleLabel !== undefined ? prev.scheduleLabel : habit.scheduleLabel,
					notes: prev.notes !== undefined ? prev.notes : habit.notes,
					bronzeDesc: prev.bronzeDesc !== undefined ? prev.bronzeDesc : habit.bronzeDesc,
					silverDesc: prev.silverDesc !== undefined ? prev.silverDesc : habit.silverDesc,
					goldDesc: prev.goldDesc !== undefined ? prev.goldDesc : habit.goldDesc,
					emergencyMinDesc:
						prev.emergencyMinDesc !== undefined
							? prev.emergencyMinDesc
							: habit.emergencyMinDesc,
					isSituational:
						prev.isSituational !== undefined ? Boolean(prev.isSituational) : habit.isSituational
				};
			} catch {
				// Ignore malformed JSON
			}
		}
	}

	return habit;
}

export function buildHabitTree(
	habits: HabitEntity[],
	options?: {
		dateIso?: string;
		hasExistingEntry?: boolean;
		loggedHabitIds?: ReadonlySet<string>;
		scheduledCadenceHabitIds?: ReadonlySet<string>;
	}
): {
	tieredRoots: HabitTreeNode[];
	cadenceHabits: HabitEntity[];
} {
	const applicableHabits = getApplicableHabitsForDate(habits, options);
	const childrenByParent = Map.groupBy(
		applicableHabits.filter((h) => Boolean(h.parentId)),
		(h) => h.parentId!
	);

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

export function resolveCompositeChildrenState(
	children: ReadonlyArray<HabitEntity>,
	logsByHabitId: Record<string, HabitLogItemInput>,
	fallbackMaxTier: 1 | 2 | 3 = 1
): CompositeChildrenStatus {
	if (children.length === 0) {
		return {
			uniformTier: null,
			hasMixedTiers: false,
			maxChildSupportedTier: fallbackMaxTier,
			allLogged: false
		};
	}

	const tiers = children.map((c) => logsByHabitId[c.id]?.achievedTier ?? null);
	const first = tiers[0];
	const uniformTier =
		first !== null && first !== undefined && tiers.every((t) => t === first) ? first : null;
	const hasAnyLogged = tiers.some((t) => t !== null && t !== undefined);
	const allLogged = tiers.every((t) => t !== null && t !== undefined);
	const maxChildSupportedTier = children.reduce<1 | 2 | 3>((acc, child) => {
		const m = getMaxSupportedTier(child);
		return m > acc ? m : acc;
	}, 1);

	return {
		uniformTier,
		hasMixedTiers: hasAnyLogged && uniformTier === null,
		maxChildSupportedTier,
		allLogged
	};
}

export function buildTierButtonDescriptors(
	supportedMaxTier: 1 | 2 | 3,
	situational: boolean,
	useBinaryBronzeLabel = false
): TierButtonDescriptor[] {
	const items: TierButtonDescriptor[] = [];
	if (situational) {
		items.push({
			tier: TIER_SCORES.SKIPPED,
			label: 'پیش نیامد',
			sizeVariant: 'compact'
		});
	}
	items.push({
		tier: TIER_SCORES.FAILED,
		label: 'نشد',
		sizeVariant: 'narrow'
	});
	items.push({
		tier: TIER_SCORES.BRONZE,
		label: useBinaryBronzeLabel && supportedMaxTier === TIER_SCORES.BRONZE ? 'انجام شد' : 'برنز',
		sizeVariant: 'standard'
	});
	if (supportedMaxTier >= TIER_SCORES.SILVER) {
		items.push({
			tier: TIER_SCORES.SILVER,
			label: 'نقره',
			sizeVariant: 'standard'
		});
	}
	if (supportedMaxTier === TIER_SCORES.GOLD) {
		items.push({
			tier: TIER_SCORES.GOLD,
			label: 'طلا',
			sizeVariant: 'standard'
		});
	}
	return items;
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

	const children = habits.filter((h) => {
		if (h.parentId !== habitId) return false;
		const childTier = logsByHabitId[h.id]?.achievedTier;
		return h.status === 'active' || (childTier !== null && childTier !== undefined);
	});
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
	if (total === 0) return { completed: 0, total: 0, percent: 100 };

	let completed = 0;

	for (const h of trackable) {
		const log = logsByHabitId[h.id];
		if (!log) continue;

		if (h.trackingMode === 'tiered') {
			const tier = log.achievedTier;
			if (tier === TIER_SCORES.SKIPPED || (tier !== null && tier !== undefined && tier > 0)) {
				completed++;
			}
		} else {
			const actual = resolveEffectiveCadenceMinutes(log);
			if (actual > 0 && (hasExistingEntry || isDirty)) {
				completed++;
			}
		}
	}

	return {
		completed,
		total,
		percent: Math.round((completed / total) * 100)
	};
}

export function evaluateDayStatusColor(
	habits: HabitEntity[],
	logs: HabitLogItemInput[],
	options?: {
		dateIso?: string;
		scheduledCadenceHabitIds?: ReadonlySet<string>;
	}
): DayStatusColor {
	if (logs.length === 0) return 'failed';

	const logMap = new Map(logs.map((l) => [l.habitId, l]));
	const loggedIds = new Set(
		logs
			.filter(
				(l) =>
					(l.achievedTier !== null && l.achievedTier !== undefined) ||
					(l.plannedMinutesSnapshot !== null &&
						l.plannedMinutesSnapshot !== undefined &&
						l.plannedMinutesSnapshot > 0) ||
					resolveEffectiveCadenceMinutes(l) > 0
			)
			.map((l) => l.habitId)
	);
	const dateIso = options?.dateIso;
	const scheduledCadenceSet = options?.scheduledCadenceHabitIds;
	const habitById = new Map(habits.map((h) => [h.id, h]));
	const trackable = habits.filter((h) => {
		const isLogged = loggedIds.has(h.id);
		if (isLogged) {
			const hasChildren = habits.some((child) => child.parentId === h.id);
			return !hasChildren;
		}
		if (dateIso && h.createdAtIso.slice(0, 10) > dateIso) {
			return false;
		}
		if (h.trackingMode === 'interval_cadence') {
			return Boolean(scheduledCadenceSet?.has(h.id));
		}
		if (h.status !== 'active') return false;
		if (h.parentId) {
			const parent = habitById.get(h.parentId);
			if (!parent || parent.status !== 'active') return false;
		}
		const hasChildren = habits.some((child) => child.parentId === h.id);
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
			const plannedMinutes = log.plannedMinutesSnapshot ?? 0;
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

const STATUS_LABELS_FA: Record<string, string> = {
	active: 'فعال',
	paused: 'متوقف موقت',
	archived: 'بایگانی‌شده'
};

export function extractLifecycleRuleDiffs(
	prevJson: string | null,
	newJson: string | null
): HabitRuleDiffItem[] {
	if (!prevJson || !newJson) return [];
	try {
		const prevParsed = HabitLifecycleStateSnapshotSchema.safeParse(JSON.parse(prevJson));
		const nextParsed = HabitLifecycleStateSnapshotSchema.safeParse(JSON.parse(newJson));
		if (!prevParsed.success || !nextParsed.success) return [];

		const prev = prevParsed.data;
		const next = nextParsed.data;
		const diffs: HabitRuleDiffItem[] = [];

		const trackingMode = String(next.trackingMode ?? prev.trackingMode ?? 'tiered');
		const isCadence = trackingMode === 'interval_cadence';

		const baseFields: Array<{ key: keyof HabitLifecycleStateSnapshot; label: string }> = [
			{ key: 'title', label: 'عنوان طرح' },
			{ key: 'scheduleLabel', label: 'زمان انجام' },
			...(isCadence
				? ([
						{ key: 'emergencyMinDesc', label: 'حداقل اضطراری' },
						{ key: 'defaultMinutesPerInterval', label: 'دقیقه هدف در هر بازه' },
						{ key: 'cadenceWindowMinutes', label: 'پنجره زمانی تکرار (دقیقه)' }
					] as const)
				: ([
						{ key: 'bronzeDesc', label: 'شرط برنز (حداقل)' },
						{ key: 'silverDesc', label: 'شرط نقره' },
						{ key: 'goldDesc', label: 'شرط طلا' }
					] as const)),
			{ key: 'status', label: 'وضعیت طرح' },
			{ key: 'notes', label: 'تبصره طرح' }
		];

		for (const f of baseFields) {
			if (next[f.key] === undefined) continue;

			let oldVal = String(prev[f.key] ?? '').trim();
			let newVal = String(next[f.key] ?? '').trim();

			if (f.key === 'status') {
				oldVal = STATUS_LABELS_FA[oldVal] ?? oldVal;
				newVal = STATUS_LABELS_FA[newVal] ?? newVal;
			}

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
		id: generateId(),
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
		id: generateId(),
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
	const isCadence = current.trackingMode === 'interval_cadence';

	const nextMinutesPerInterval =
		isCadence && input.defaultMinutesPerInterval !== undefined
			? input.defaultMinutesPerInterval
			: current.defaultMinutesPerInterval;
	const nextCadenceWindow =
		isCadence && input.cadenceWindowMinutes !== undefined
			? input.cadenceWindowMinutes
			: current.cadenceWindowMinutes;

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
		const statusLabel = STATUS_LABELS_FA[input.status] ?? input.status;
		summary = `تغییر وضعیت «${input.title}» به ${statusLabel}`;
	} else if (
		isCadence &&
		(nextMinutesPerInterval !== current.defaultMinutesPerInterval ||
			nextCadenceWindow !== current.cadenceWindowMinutes)
	) {
		eventType = 'CADENCE_UPDATED';
		summary = `تغییر بازه تکرارشونده «${input.title}»`;
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
		bronzeDesc: isCadence ? null : (input.bronzeDesc?.trim() || null),
		silverDesc: isCadence ? null : (input.silverDesc?.trim() || null),
		goldDesc: isCadence ? null : (input.goldDesc?.trim() || null),
		emergencyMinDesc: isCadence ? (input.emergencyMinDesc?.trim() || null) : null,
		defaultMinutesPerInterval: nextMinutesPerInterval,
		cadenceWindowMinutes: nextCadenceWindow,
		updatedAtIso: nowIso
	};

	const lifecycleEvent: LifecycleEventEntity = {
		id: generateId(),
		habitId: input.habitId,
		habitTitleSnapshot: updatedHabit.title,
		eventType,
		effectiveDateIso: todayIso,
		summary,
		reason: input.reason,
		previousStateJson: JSON.stringify(current),
		newStateJson: JSON.stringify(updatedHabit),
		createdAtIso: nowIso
	};

	return { updatedHabit, lifecycleEvent };
}
