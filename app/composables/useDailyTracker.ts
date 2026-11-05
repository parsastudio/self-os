import { ref, computed, watch, type Ref } from 'vue';
import { useAppDatabase } from '~/composables/useAppDatabase';
import { useDexieLiveQuery } from '~/composables/useDexieLiveQuery';
import { useLocalRepository } from '~/composables/useLocalRepository';
import {
	buildHabitTree,
	computeCompositeParentDisplay,
	computeDailyCompletionStats,
	evaluateDayStatusColor,
	getApplicableHabitsForDate,
	getMaxSupportedTier,
	isHabitNodeCompleted,
	resolveEffectiveCadenceMinutes,
	resolveHabitRuleSnapshot
} from '~/core/habit-engine';
import { shiftIsoDate } from '~/domain/calendar';
import { DEFAULT_REFLECTION_TAGS, TIER_SCORES } from '~/domain/constants';
import type {
	DayStatusColor,
	HabitEntity,
	HabitLogItemInput,
	SaveDailyEntryInput
} from '~/domain/schemas';

export interface CadenceDraftItem {
	habitId: string;
	plannedIntervals: number;
	plannedMinutesPerInterval: number;
	cadenceWindowMinutes: number;
}

export function useDailyTracker(dateIso: Ref<string>) {
	const db = useAppDatabase();
	const localRepo = useLocalRepository();

	const tomorrowIso = computed(() => shiftIsoDate(dateIso.value, 1));

	// Dexie Live Queries
	const habits = useDexieLiveQuery(() => db.habits.orderBy('sortOrder').toArray(), []);
	const entry = useDexieLiveQuery(() => db.dailyEntries.get(dateIso.value), undefined, dateIso);
	const logs = useDexieLiveQuery(() => db.habitLogs.where('dateIso').equals(dateIso.value).toArray(), [], dateIso);
	const allEntries = useDexieLiveQuery(() => db.dailyEntries.orderBy('dateIso').reverse().limit(35).toArray(), []);
	const tagsRecords = useDexieLiveQuery(() => db.reflectionTags.orderBy('sortOrder').toArray(), []);
	const dayCadencePlans = useDexieLiveQuery(() => db.cadencePlans.where('dateIso').equals(dateIso.value).toArray(), [], dateIso);
	const tomorrowCadencePlans = useDexieLiveQuery(() => db.cadencePlans.where('dateIso').equals(tomorrowIso.value).toArray(), [], tomorrowIso);
	const calendarEvents = useDexieLiveQuery(() => db.calendarEvents.toArray(), []);

	// Local mutable state
	const reflectionNote = ref('');
	const journalText = ref('');
	const selectedTags = ref<string[]>([]);
	const manualDayStatus = ref<DayStatusColor | null>(null);
	const logsByHabitId = ref<Record<string, HabitLogItemInput>>({});
	const tomorrowPlansByHabitId = ref<Record<string, CadenceDraftItem>>({});
	const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
	const isDirty = ref(false);

	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

	const availableTags = computed(() => {
		if (tagsRecords.value.length > 0) {
			return tagsRecords.value.map((t) => t.label);
		}
		return [...DEFAULT_REFLECTION_TAGS];
	});

	// Synchronize when date or database queries change
	watch(
		[dateIso, entry, logs, habits, dayCadencePlans, tomorrowCadencePlans],
		() => {
			reflectionNote.value = entry.value?.reflectionNote ?? '';
			journalText.value = entry.value?.journalText ?? '';
			selectedTags.value = entry.value?.tags ? [...entry.value.tags] : [];
			manualDayStatus.value = entry.value?.dayStatus ?? null;

			const dayPlanMap = new Map(dayCadencePlans.value.map((p) => [p.habitId, p]));
			const existingLogMap = new Map(logs.value.map((l) => [l.habitId, l]));
			const nextLogs: Record<string, HabitLogItemInput> = {};

			for (const habit of habits.value) {
				const existing = existingLogMap.get(habit.id);
				const dayPlan = dayPlanMap.get(habit.id);
				const plannedIntervals = dayPlan?.plannedIntervals ?? null;
				const plannedMinutes = dayPlan?.plannedMinutesPerInterval ?? null;

				if (existing) {
					nextLogs[habit.id] = {
						habitId: habit.id,
						habitTitleSnapshot: existing.habitTitleSnapshot ?? habit.title,
						achievedTier: existing.achievedTier,
						achievedRuleSnapshot:
							existing.achievedRuleSnapshot ?? resolveHabitRuleSnapshot(habit, existing.achievedTier),
						completedIntervals: existing.completedIntervals ?? null,
						actualMinutesPerInterval: existing.actualMinutesPerInterval,
						totalActualMinutes: existing.totalActualMinutes,
						plannedIntervalsSnapshot: existing.plannedIntervalsSnapshot ?? plannedIntervals,
						plannedMinutesSnapshot: existing.plannedMinutesSnapshot ?? plannedMinutes,
						updatedAtIso: existing.updatedAtIso ?? null
					};
				} else {
					const effectivePlannedIntervals =
						habit.trackingMode === 'interval_cadence'
							? (plannedIntervals ?? habit.defaultIntervals)
							: plannedIntervals;
					const effectivePlannedMinutes =
						habit.trackingMode === 'interval_cadence'
							? (plannedMinutes ?? habit.defaultMinutesPerInterval)
							: plannedMinutes;

					nextLogs[habit.id] = {
						habitId: habit.id,
						habitTitleSnapshot: habit.title,
						achievedTier: null,
						achievedRuleSnapshot: null,
						completedIntervals: null,
						actualMinutesPerInterval: habit.trackingMode === 'interval_cadence' ? 0 : null,
						totalActualMinutes: habit.trackingMode === 'interval_cadence' ? 0 : null,
						plannedIntervalsSnapshot: effectivePlannedIntervals,
						plannedMinutesSnapshot: effectivePlannedMinutes,
						updatedAtIso: null
					};
				}
			}
			logsByHabitId.value = nextLogs;

			const tomorrowPlanMap = new Map(tomorrowCadencePlans.value.map((p) => [p.habitId, p]));
			const nextTomorrow: Record<string, CadenceDraftItem> = {};
			for (const habit of habits.value.filter((h) => h.trackingMode === 'interval_cadence')) {
				const tPlan = tomorrowPlanMap.get(habit.id);
				const todayPlan = dayPlanMap.get(habit.id);
				nextTomorrow[habit.id] = {
					habitId: habit.id,
					plannedIntervals: 1,
					plannedMinutesPerInterval: tPlan?.plannedMinutesPerInterval ?? todayPlan?.plannedMinutesPerInterval ?? 0,
					cadenceWindowMinutes: 60
				};
			}
			tomorrowPlansByHabitId.value = nextTomorrow;
			isDirty.value = false;
			saveState.value = entry.value ? 'saved' : 'idle';
		},
		{ immediate: true }
	);

	const loggedHabitIds = computed<ReadonlySet<string>>(() => {
		const set = new Set<string>();
		for (const log of Object.values(logsByHabitId.value)) {
			const hasTier = log.achievedTier !== null && log.achievedTier !== undefined;
			const hasMinutes = Boolean(entry.value) && resolveEffectiveCadenceMinutes(log) > 0;
			if (hasTier || hasMinutes) {
				set.add(log.habitId);
			}
		}
		return set;
	});

	const applicableHabits = computed(() =>
		getApplicableHabitsForDate(habits.value, {
			dateIso: dateIso.value,
			hasExistingEntry: Boolean(entry.value),
			loggedHabitIds: loggedHabitIds.value
		})
	);

	const tree = computed(() =>
		buildHabitTree(habits.value, {
			dateIso: dateIso.value,
			hasExistingEntry: Boolean(entry.value),
			loggedHabitIds: loggedHabitIds.value
		})
	);

	const computedDayStatus = computed<DayStatusColor>(() => {
		if (manualDayStatus.value) return manualDayStatus.value;
		return evaluateDayStatusColor(applicableHabits.value, Object.values(logsByHabitId.value));
	});

	const completionStats = computed(() =>
		computeDailyCompletionStats({
			applicableHabits: applicableHabits.value,
			loggedHabitIds: loggedHabitIds.value,
			logsByHabitId: logsByHabitId.value,
			hasExistingEntry: Boolean(entry.value),
			isDirty: isDirty.value
		})
	);

	function buildDailyInputObject(): SaveDailyEntryInput {
		return {
			dateIso: dateIso.value,
			dayStatus: computedDayStatus.value,
			reflectionNote: reflectionNote.value,
			journalText: journalText.value.trim() || null,
			tags: [...selectedTags.value],
			updatedAtIso: new Date().toISOString(),
			logs: Object.values(logsByHabitId.value)
		};
	}

	function scheduleAutoSave(delayMs = 0) {
		isDirty.value = true;
		saveState.value = 'saving';

		if (autoSaveTimer) clearTimeout(autoSaveTimer);

		if (delayMs <= 0) {
			void flushPendingSave();
		} else {
			autoSaveTimer = setTimeout(() => {
				autoSaveTimer = null;
				void flushPendingSave();
			}, delayMs);
		}
	}

	async function flushPendingSave(): Promise<void> {
		if (autoSaveTimer) {
			clearTimeout(autoSaveTimer);
			autoSaveTimer = null;
		}
		if (!dateIso.value) return;

		saveState.value = 'saving';
		try {
			const payload = buildDailyInputObject();
			await localRepo.daily.saveDailyEntry(payload);
			isDirty.value = false;
			saveState.value = 'saved';
		} catch {
			saveState.value = 'error';
		}
	}

	function markAllOptimalFiveSecond() {
		const nowIso = new Date().toISOString();
		const updated = { ...logsByHabitId.value };
		for (const habit of applicableHabits.value) {
			if (habit.status !== 'active') continue;
			const current = updated[habit.id];
			if (!current) continue;

			if (habit.trackingMode === 'tiered') {
				const maxTier = getMaxSupportedTier(habit);
				updated[habit.id] = {
					...current,
					habitTitleSnapshot: habit.title,
					achievedTier: maxTier,
					achievedRuleSnapshot: resolveHabitRuleSnapshot(habit, maxTier),
					updatedAtIso: nowIso
				};
			} else {
				const plannedMinutes =
					current.plannedMinutesSnapshot && current.plannedMinutesSnapshot > 0
						? current.plannedMinutesSnapshot
						: current.actualMinutesPerInterval && current.actualMinutesPerInterval > 0
							? current.actualMinutesPerInterval
							: habit.defaultMinutesPerInterval > 0
								? habit.defaultMinutesPerInterval
								: 10;
				const intervals = current.completedIntervals ?? null;
				updated[habit.id] = {
					...current,
					completedIntervals: intervals,
					actualMinutesPerInterval: plannedMinutes,
					totalActualMinutes: intervals !== null ? Number((intervals * plannedMinutes).toFixed(1)) : plannedMinutes,
					achievedTier: TIER_SCORES.GOLD,
					updatedAtIso: nowIso
				};
			}
		}
		logsByHabitId.value = updated;
		manualDayStatus.value = 'optimal';
		scheduleAutoSave(0);
	}

	function setTierScore(habitId: string, tier: number) {
		const current = logsByHabitId.value[habitId];
		if (!current) return;
		const nextTier = current.achievedTier === tier ? null : tier;
		setTierExplicit(habitId, nextTier);
	}

	function setTierExplicit(habitId: string, tier: number | null) {
		const current = logsByHabitId.value[habitId];
		if (!current) return;
		const nowIso = new Date().toISOString();
		const habit = habits.value.find((h) => h.id === habitId);

		logsByHabitId.value[habitId] = {
			...current,
			habitTitleSnapshot: habit?.title ?? current.habitTitleSnapshot ?? null,
			achievedTier: tier,
			achievedRuleSnapshot: habit && tier !== null ? resolveHabitRuleSnapshot(habit, tier) : null,
			updatedAtIso: nowIso
		};
		manualDayStatus.value = null;
		scheduleAutoSave(0);
	}

	function setParentGroupAllTier(parentId: string, tier: number) {
		const children = habits.value.filter((h) => h.parentId === parentId && h.status === 'active');
		const allAlreadySelected =
			children.length > 0 && children.every((child) => logsByHabitId.value[child.id]?.achievedTier === tier);
		const targetTier = allAlreadySelected ? null : tier;

		for (const child of children) {
			const maxChildTier = getMaxSupportedTier(child);
			const effectiveTier =
				targetTier === null
					? null
					: targetTier === TIER_SCORES.FAILED || targetTier === TIER_SCORES.SKIPPED
						? targetTier
						: Math.min(targetTier, maxChildTier);
			setTierExplicit(child.id, effectiveTier);
		}
		setTierExplicit(parentId, targetTier);
	}

	function clearDay() {
		const nowIso = new Date().toISOString();
		const updated = { ...logsByHabitId.value };
		for (const habit of habits.value) {
			const current = updated[habit.id];
			if (!current) continue;
			updated[habit.id] = {
				...current,
				achievedTier: null,
				achievedRuleSnapshot: null,
				completedIntervals: null,
				actualMinutesPerInterval: habit.trackingMode === 'interval_cadence' ? 0 : null,
				totalActualMinutes: habit.trackingMode === 'interval_cadence' ? 0 : null,
				updatedAtIso: nowIso
			};
		}
		logsByHabitId.value = updated;
		reflectionNote.value = '';
		journalText.value = '';
		selectedTags.value = [];
		manualDayStatus.value = null;
		scheduleAutoSave(0);
	}

	function updateCadenceActual(habitId: string, intervals: number | null, minutesPerInterval: number) {
		const current = logsByHabitId.value[habitId];
		if (!current) return;
		const nowIso = new Date().toISOString();
		const safeIntervals =
			intervals === null || Number.isNaN(intervals) || intervals <= 0 ? null : Math.floor(intervals);
		const safeMinutes = Math.max(0, Number.isNaN(minutesPerInterval) ? 0 : minutesPerInterval);

		logsByHabitId.value[habitId] = {
			...current,
			completedIntervals: safeIntervals,
			actualMinutesPerInterval: safeMinutes,
			totalActualMinutes: safeIntervals !== null ? Number((safeIntervals * safeMinutes).toFixed(1)) : safeMinutes,
			updatedAtIso: nowIso
		};
		manualDayStatus.value = null;
		scheduleAutoSave(0);
	}

	function toggleTag(tag: string) {
		if (selectedTags.value.includes(tag)) {
			selectedTags.value = selectedTags.value.filter((t) => t !== tag);
		} else {
			selectedTags.value = [...selectedTags.value, tag];
		}
		scheduleAutoSave(0);
	}

	function copyTodayActualsToTomorrowPlan() {
		const next = { ...tomorrowPlansByHabitId.value };
		for (const habit of habits.value.filter((h) => h.trackingMode === 'interval_cadence')) {
			const log = logsByHabitId.value[habit.id];
			if (log) {
				next[habit.id] = {
					habitId: habit.id,
					plannedIntervals: 1,
					plannedMinutesPerInterval: log.actualMinutesPerInterval ?? 0,
					cadenceWindowMinutes: 60
				};
			}
		}
		tomorrowPlansByHabitId.value = next;
	}

	async function saveTomorrowCadencePlans(): Promise<void> {
		const items = Object.values(tomorrowPlansByHabitId.value);
		await localRepo.daily.saveCadencePlans({
			targetDateIso: tomorrowIso.value,
			items
		});
	}

	function isNodeCompleted(habitId: string): boolean {
		return isHabitNodeCompleted({
			habitId,
			habits: habits.value,
			logsByHabitId: logsByHabitId.value,
			hasExistingEntry: Boolean(entry.value),
			isDirty: isDirty.value
		});
	}

	function getCompositeNotation(parentId: string): string {
		const children = habits.value
			.filter((h) => h.parentId === parentId && h.status === 'active')
			.sort((a, b) => a.sortOrder - b.sortOrder);
		return computeCompositeParentDisplay(children, logsByHabitId.value);
	}

	return {
		habits,
		entry,
		allEntries,
		calendarEvents,
		tree,
		applicableHabits,
		availableTags,
		reflectionNote,
		journalText,
		selectedTags,
		manualDayStatus,
		logsByHabitId,
		tomorrowPlansByHabitId,
		tomorrowIso,
		saveState,
		isDirty,
		computedDayStatus,
		completionStats,
		markAllOptimalFiveSecond,
		setTierScore,
		setTierExplicit,
		setParentGroupAllTier,
		clearDay,
		updateCadenceActual,
		toggleTag,
		scheduleAutoSave,
		flushPendingSave,
		copyTodayActualsToTomorrowPlan,
		saveTomorrowCadencePlans,
		isNodeCompleted,
		getCompositeNotation
	};
}
