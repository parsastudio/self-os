import { onMounted, onScopeDispose, type Ref } from 'vue';
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
	resolveDailyHabitLogSnapshot,
	resolveEffectiveCadenceMinutes,
	resolveHabitRuleSnapshot,
	resolveHistoricalHabitForDate,
	shouldDiscardHabitLogItem
} from '~/core/habit-engine';
import { shiftIsoDate } from '~/domain/calendar';
import { CADENCE_SUCCESS_RATIOS, TIER_SCORES } from '~/domain/constants';
import type {
	CadenceDraftItem,
	DayStatusColor,
	HabitEntity,
	HabitLogItemInput,
	LocalHabitLogRecord
} from '~/domain/schemas';

export function useDailyTracker(dateIso: Ref<string>) {
	const db = useAppDatabase();
	const localRepo = useLocalRepository();

	const tomorrowIso = computed(() => shiftIsoDate(dateIso.value, 1));

	// Dexie Live Queries
	const habits = useDexieLiveQuery(() => db.habits.orderBy('sortOrder').toArray(), []);
	const entry = useDexieLiveQuery(() => db.dailyEntries.get(dateIso.value), undefined, dateIso);
	const logs = useDexieLiveQuery(() => db.habitLogs.where('dateIso').equals(dateIso.value).toArray(), [], dateIso);
	const allEntries = useDexieLiveQuery(() => db.dailyEntries.orderBy('dateIso').reverse().limit(35).toArray(), []);
	const dayCadencePlans = useDexieLiveQuery(() => db.cadencePlans.where('dateIso').equals(dateIso.value).toArray(), [], dateIso);
	const tomorrowCadencePlans = useDexieLiveQuery(() => db.cadencePlans.where('dateIso').equals(tomorrowIso.value).toArray(), [], tomorrowIso);
	const calendarEvents = useDexieLiveQuery(() => db.calendarEvents.toArray(), []);
	const people = useDexieLiveQuery(() => db.people.toArray(), []);
	const lifecycleEvents = useDexieLiveQuery(() => db.lifecycleEvents.toArray(), []);

	// Reactive Dexie-derived views (Single Source of Truth)
	const dayPlanByHabitId = computed(() => new Map(dayCadencePlans.value.map((p) => [p.habitId, p])));
	const existingLogByHabitId = computed(() => new Map(logs.value.map((l) => [l.habitId, l])));

	const logsByHabitId = computed<Record<string, HabitLogItemInput>>(() => {
		const nextLogs: Record<string, HabitLogItemInput> = {};

		for (const habit of habits.value) {
			const existing = existingLogByHabitId.value.get(habit.id);
			const dayPlan = dayPlanByHabitId.value.get(habit.id);
			const hasDefaultCadenceTarget =
				habit.trackingMode === 'interval_cadence' &&
				habit.status === 'active' &&
				habit.defaultMinutesPerInterval > 0 &&
				(!entry.value || habit.createdAtIso.slice(0, 10) <= dateIso.value);
			const plannedMinutes =
				dayPlan !== undefined
					? dayPlan.plannedMinutesPerInterval
					: hasDefaultCadenceTarget
						? habit.defaultMinutesPerInterval
						: null;

			if (existing) {
				nextLogs[habit.id] = {
					habitId: habit.id,
					habitTitleSnapshot: existing.habitTitleSnapshot ?? habit.title,
					achievedTier: existing.achievedTier,
					achievedRuleSnapshot:
						existing.achievedRuleSnapshot ??
						resolveHabitRuleSnapshot(habit, existing.achievedTier),
					actualMinutesPerInterval: existing.actualMinutesPerInterval,
					plannedMinutesSnapshot: existing.plannedMinutesSnapshot ?? plannedMinutes,
					updatedAtIso: existing.updatedAtIso ?? null
				};
			} else {
				nextLogs[habit.id] = {
					habitId: habit.id,
					habitTitleSnapshot: habit.title,
					achievedTier: null,
					achievedRuleSnapshot: null,
					actualMinutesPerInterval: null,
					plannedMinutesSnapshot: plannedMinutes,
					updatedAtIso: null
				};
			}
		}

		return nextLogs;
	});

	// Lightweight draft state strictly for debounced journal text & tomorrow plan form
	const journalText = ref('');
	const isJournalDirty = ref(false);
	const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
	const tomorrowPlansByHabitId = ref<Record<string, CadenceDraftItem>>({});

	let journalAutoSaveTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingJournalSnapshot: {
		dateIso: string;
		dayStatus: DayStatusColor;
		journalText: string;
	} | null = null;
	let activeJournalDateIso = dateIso.value;
	let inFlightSavePromise: Promise<void> | null = null;

	watch(
		[dateIso, () => entry.value?.journalText, () => entry.isLoading.value],
		() => {
			const isDateChanged = activeJournalDateIso !== dateIso.value;
			if (isDateChanged) {
				if (isJournalDirty.value && !pendingJournalSnapshot) {
					pendingJournalSnapshot = {
						dateIso: activeJournalDateIso,
						dayStatus: entry.value?.dayStatus ?? 'failed',
						journalText: journalText.value
					};
				}
				if (pendingJournalSnapshot) {
					void flushPendingSave();
				}
				activeJournalDateIso = dateIso.value;
				isJournalDirty.value = false;
				journalText.value = entry.isLoading.value ? '' : (entry.value?.journalText ?? '');
				saveState.value = entry.value ? 'saved' : 'idle';
				return;
			}

			if (entry.isLoading.value || isJournalDirty.value) {
				return;
			}

			const incomingJournal = entry.value?.journalText ?? '';
			if (journalText.value !== incomingJournal) {
				journalText.value = incomingJournal;
			}
			if (saveState.value !== 'error') {
				saveState.value = entry.value ? 'saved' : 'idle';
			}
		},
		{ immediate: true }
	);

	watch(
		[tomorrowIso, tomorrowCadencePlans, habits, () => tomorrowCadencePlans.isLoading.value],
		() => {
			if (tomorrowCadencePlans.isLoading.value) return;
			const tomorrowPlanMap = new Map(tomorrowCadencePlans.value.map((p) => [p.habitId, p]));
			const nextTomorrow: Record<string, CadenceDraftItem> = {};
			for (const habit of habits.value.filter((h) => h.trackingMode === 'interval_cadence')) {
				const tPlan = tomorrowPlanMap.get(habit.id);
				const initialMinutes =
					tPlan !== undefined
						? tPlan.plannedMinutesPerInterval
						: habit.status === 'active'
							? habit.defaultMinutesPerInterval
							: 0;
				nextTomorrow[habit.id] = {
					habitId: habit.id,
					plannedMinutesPerInterval: initialMinutes > 0 ? initialMinutes : null
				};
			}
			tomorrowPlansByHabitId.value = nextTomorrow;
		},
		{ immediate: true }
	);

	const scheduledCadenceHabitIds = computed<ReadonlySet<string>>(() => {
		const set = new Set<string>();
		const explicitZeroIds = new Set<string>();
		for (const plan of dayCadencePlans.value) {
			if (plan.plannedMinutesPerInterval > 0) {
				set.add(plan.habitId);
			} else {
				explicitZeroIds.add(plan.habitId);
			}
		}
		for (const habit of habits.value) {
			if (
				habit.trackingMode === 'interval_cadence' &&
				habit.status === 'active' &&
				habit.defaultMinutesPerInterval > 0 &&
				!explicitZeroIds.has(habit.id) &&
				(!entry.value || habit.createdAtIso.slice(0, 10) <= dateIso.value)
			) {
				set.add(habit.id);
			}
		}
		for (const log of logs.value) {
			if (
				(log.achievedTier !== null && log.achievedTier !== undefined) ||
				(log.actualMinutesPerInterval !== null && log.actualMinutesPerInterval !== undefined) ||
				(log.plannedMinutesSnapshot !== null &&
					log.plannedMinutesSnapshot !== undefined &&
					log.plannedMinutesSnapshot > 0) ||
				resolveEffectiveCadenceMinutes(log) > 0
			) {
				set.add(log.habitId);
			}
		}
		return set;
	});

	const schedulableCadenceHabits = computed(() =>
		habits.value
			.filter((h) => h.trackingMode === 'interval_cadence' && h.status === 'active')
			.sort((a, b) => a.sortOrder - b.sortOrder)
	);

	const loggedHabitIds = computed<ReadonlySet<string>>(() => {
		const set = new Set<string>();
		for (const log of Object.values(logsByHabitId.value)) {
			const hasTier = log.achievedTier !== null && log.achievedTier !== undefined;
			const hasExplicitCadenceActual =
				log.actualMinutesPerInterval !== null && log.actualMinutesPerInterval !== undefined;
			const hasMinutes = resolveEffectiveCadenceMinutes(log) > 0;
			if (hasTier || hasExplicitCadenceActual || hasMinutes) {
				set.add(log.habitId);
			}
		}
		return set;
	});

	const effectiveHabitsForDate = computed<HabitEntity[]>(() => {
		const logSnapshotByHabitId = new Map(
			logs.value.map((l) => [l.habitId, l.habitSnapshotJson ?? null])
		);
		return habits.value.map((habit) =>
			resolveHistoricalHabitForDate({
				habit,
				dateIso: dateIso.value,
				logSnapshotJson: logSnapshotByHabitId.get(habit.id),
				lifecycleEvents: lifecycleEvents.value
			})
		);
	});

	const applicableHabits = computed(() =>
		getApplicableHabitsForDate(effectiveHabitsForDate.value, {
			dateIso: dateIso.value,
			hasExistingEntry: Boolean(entry.value),
			loggedHabitIds: loggedHabitIds.value,
			scheduledCadenceHabitIds: scheduledCadenceHabitIds.value
		})
	);

	const tree = computed(() =>
		buildHabitTree(effectiveHabitsForDate.value, {
			dateIso: dateIso.value,
			hasExistingEntry: Boolean(entry.value),
			loggedHabitIds: loggedHabitIds.value,
			scheduledCadenceHabitIds: scheduledCadenceHabitIds.value
		})
	);

	const computedDayStatus = computed<DayStatusColor>(() => {
		if (!isJournalDirty.value && entry.value && loggedHabitIds.value.size === 0) {
			return entry.value.dayStatus;
		}
		return evaluateDayStatusColor(applicableHabits.value, Object.values(logsByHabitId.value), {
			dateIso: dateIso.value,
			scheduledCadenceHabitIds: scheduledCadenceHabitIds.value
		});
	});

	const completionStats = computed(() =>
		computeDailyCompletionStats({
			applicableHabits: applicableHabits.value,
			loggedHabitIds: loggedHabitIds.value,
			logsByHabitId: logsByHabitId.value,
			hasExistingEntry: Boolean(entry.value),
			isDirty: isJournalDirty.value
		})
	);

	function runSerializedSave(targetDateIso: string, task: () => Promise<void>): Promise<void> {
		if (targetDateIso === dateIso.value) {
			saveState.value = 'saving';
		}

		const execute = async () => {
			if (inFlightSavePromise) {
				await inFlightSavePromise.catch(() => {});
			}
			try {
				await task();
				if (targetDateIso === dateIso.value) {
					saveState.value = 'saved';
				}
			} catch {
				if (targetDateIso === dateIso.value) {
					saveState.value = 'error';
				}
			}
		};

		const currentPromise = execute();
		inFlightSavePromise = currentPromise;
		return currentPromise.finally(() => {
			if (inFlightSavePromise === currentPromise) {
				inFlightSavePromise = null;
			}
		});
	}

	function buildLocalHabitLogRecord(
		habit: HabitEntity,
		item: HabitLogItemInput,
		nowIso: string
	): LocalHabitLogRecord {
		const existing = existingLogByHabitId.value.get(habit.id);
		const resolved = resolveDailyHabitLogSnapshot({
			habit,
			log: item,
			previousLog: existing
				? {
						achievedTier: existing.achievedTier,
						habitTitleSnapshot: existing.habitTitleSnapshot ?? null,
						achievedRuleSnapshot: existing.achievedRuleSnapshot ?? null,
						habitSnapshotJson: existing.habitSnapshotJson ?? null,
						plannedMinutesSnapshot: existing.plannedMinutesSnapshot ?? null
					}
				: null,
			fallbackUpdatedAtIso: nowIso
		});

		return {
			id: existing?.id ?? `log:${dateIso.value}:${habit.id}`,
			dateIso: dateIso.value,
			habitId: habit.id,
			...resolved
		};
	}

	function commitHabitLogChanges(
		updates: Array<{ habit: HabitEntity; item: HabitLogItemInput }>,
		forcedDayStatus?: DayStatusColor
	) {
		const targetDateIso = dateIso.value;
		const nowIso = new Date().toISOString();
		const simulatedLogsMap: Record<string, HabitLogItemInput> = { ...logsByHabitId.value };
		const upserts: LocalHabitLogRecord[] = [];
		const deleteHabitIds: string[] = [];

		for (const { habit, item } of updates) {
			simulatedLogsMap[habit.id] = item;
			if (shouldDiscardHabitLogItem(habit, item)) {
				deleteHabitIds.push(habit.id);
			} else {
				upserts.push(buildLocalHabitLogRecord(habit, item, nowIso));
			}
		}

		const nextDayStatus =
			forcedDayStatus ??
			evaluateDayStatusColor(applicableHabits.value, Object.values(simulatedLogsMap), {
				dateIso: targetDateIso,
				scheduledCadenceHabitIds: scheduledCadenceHabitIds.value
			});

		const hasJournal = Boolean(journalText.value.trim());
		const dirtyJournalText = isJournalDirty.value ? journalText.value : undefined;
		if (isJournalDirty.value) {
			if (journalAutoSaveTimer) {
				clearTimeout(journalAutoSaveTimer);
				journalAutoSaveTimer = null;
			}
			pendingJournalSnapshot = null;
			isJournalDirty.value = false;
		}

		void runSerializedSave(targetDateIso, () =>
			localRepo.daily.applyHabitLogChanges({
				dateIso: targetDateIso,
				dayStatus: nextDayStatus,
				...(dirtyJournalText !== undefined ? { journalText: dirtyJournalText } : {}),
				hasJournal,
				upserts,
				deleteHabitIds,
				updatedAtIso: nowIso
			})
		);
	}

	function scheduleAutoSave(delayMs = 750) {
		isJournalDirty.value = true;
		saveState.value = 'saving';
		pendingJournalSnapshot = {
			dateIso: dateIso.value,
			dayStatus: computedDayStatus.value,
			journalText: journalText.value
		};

		if (journalAutoSaveTimer) clearTimeout(journalAutoSaveTimer);

		if (delayMs <= 0) {
			void flushPendingSave();
		} else {
			journalAutoSaveTimer = setTimeout(() => {
				journalAutoSaveTimer = null;
				void flushPendingSave();
			}, delayMs);
		}
	}

	async function flushPendingSave(forceSaveCurrent = false): Promise<void> {
		if (journalAutoSaveTimer) {
			clearTimeout(journalAutoSaveTimer);
			journalAutoSaveTimer = null;
		}

		const snapshot =
			pendingJournalSnapshot ??
			(forceSaveCurrent || isJournalDirty.value
				? {
						dateIso: dateIso.value,
						dayStatus: computedDayStatus.value,
						journalText: journalText.value
					}
				: null);

		pendingJournalSnapshot = null;
		if (!snapshot) {
			if (inFlightSavePromise) {
				await inFlightSavePromise;
			}
			return;
		}

		await runSerializedSave(snapshot.dateIso, async () => {
			await localRepo.daily.saveJournalEntry({
				dateIso: snapshot.dateIso,
				dayStatus: snapshot.dayStatus,
				journalText: snapshot.journalText.trim() ? snapshot.journalText : null
			});
			if (
				snapshot.dateIso === dateIso.value &&
				(!pendingJournalSnapshot || pendingJournalSnapshot.dateIso !== dateIso.value)
			) {
				isJournalDirty.value = false;
			}
		});
	}

	function handlePageVisibilityFlush() {
		if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
			if (pendingJournalSnapshot || isJournalDirty.value) {
				void flushPendingSave();
			}
		}
	}

	function handlePageHideFlush() {
		if (pendingJournalSnapshot || isJournalDirty.value) {
			void flushPendingSave();
		}
	}

	onMounted(() => {
		document.addEventListener('visibilitychange', handlePageVisibilityFlush);
		window.addEventListener('pagehide', handlePageHideFlush);
	});

	onScopeDispose(() => {
		document.removeEventListener('visibilitychange', handlePageVisibilityFlush);
		window.removeEventListener('pagehide', handlePageHideFlush);
		if (pendingJournalSnapshot || isJournalDirty.value) {
			void flushPendingSave();
		}
	});

	function markAllOptimalFiveSecond() {
		const nowIso = new Date().toISOString();
		const updates: Array<{ habit: HabitEntity; item: HabitLogItemInput }> = [];

		for (const habit of applicableHabits.value) {
			if (habit.status !== 'active') continue;
			const current = logsByHabitId.value[habit.id];
			if (!current) continue;

			if (habit.trackingMode === 'tiered') {
				const maxTier = getMaxSupportedTier(habit);
				updates.push({
					habit,
					item: {
						...current,
						habitTitleSnapshot: habit.title,
						achievedTier: maxTier,
						achievedRuleSnapshot: resolveHabitRuleSnapshot(habit, maxTier),
						updatedAtIso: nowIso
					}
				});
			} else {
				const plannedMinutes =
					current.plannedMinutesSnapshot && current.plannedMinutesSnapshot > 0
						? current.plannedMinutesSnapshot
						: current.actualMinutesPerInterval && current.actualMinutesPerInterval > 0
							? current.actualMinutesPerInterval
							: 0;
				if (plannedMinutes <= 0) continue;
				updates.push({
					habit,
					item: {
						...current,
						actualMinutesPerInterval: plannedMinutes,
						achievedTier: TIER_SCORES.GOLD,
						updatedAtIso: nowIso
					}
				});
			}
		}

		commitHabitLogChanges(updates, 'optimal');
	}

	function setTierScore(habitId: string, tier: number) {
		const current = logsByHabitId.value[habitId];
		const habit = effectiveHabitsForDate.value.find((h) => h.id === habitId);
		if (!current || !habit) return;

		const nextTier = current.achievedTier === tier ? null : tier;
		const nowIso = new Date().toISOString();

		commitHabitLogChanges([
			{
				habit,
				item: {
					...current,
					habitTitleSnapshot: habit.title,
					achievedTier: nextTier,
					achievedRuleSnapshot:
						nextTier !== null ? resolveHabitRuleSnapshot(habit, nextTier) : null,
					updatedAtIso: nowIso
				}
			}
		]);
	}

	function setParentGroupAllTier(parentId: string, tier: number) {
		const children = effectiveHabitsForDate.value.filter(
			(h) => h.parentId === parentId && h.status === 'active'
		);
		const allAlreadySelected =
			children.length > 0 &&
			children.every((child) => logsByHabitId.value[child.id]?.achievedTier === tier);
		const targetTier = allAlreadySelected ? null : tier;
		const nowIso = new Date().toISOString();
		const updates: Array<{ habit: HabitEntity; item: HabitLogItemInput }> = [];

		for (const child of children) {
			const currentChildLog = logsByHabitId.value[child.id];
			if (!currentChildLog) continue;
			const maxChildTier = getMaxSupportedTier(child);
			const effectiveTier =
				targetTier === null
					? null
					: targetTier === TIER_SCORES.FAILED || targetTier === TIER_SCORES.SKIPPED
						? targetTier
						: Math.min(targetTier, maxChildTier);

			updates.push({
				habit: child,
				item: {
					...currentChildLog,
					habitTitleSnapshot: child.title,
					achievedTier: effectiveTier,
					achievedRuleSnapshot:
						effectiveTier !== null ? resolveHabitRuleSnapshot(child, effectiveTier) : null,
					updatedAtIso: nowIso
				}
			});
		}

		const parentHabit = effectiveHabitsForDate.value.find((h) => h.id === parentId);
		const parentCurrent = logsByHabitId.value[parentId];
		if (parentHabit && parentCurrent && existingLogByHabitId.value.has(parentId)) {
			updates.push({
				habit: parentHabit,
				item: {
					...parentCurrent,
					achievedTier: null,
					achievedRuleSnapshot: null,
					updatedAtIso: nowIso
				}
			});
		}

		if (updates.length > 0) {
			commitHabitLogChanges(updates);
		}
	}

	function clearDay() {
		if (journalAutoSaveTimer) {
			clearTimeout(journalAutoSaveTimer);
			journalAutoSaveTimer = null;
		}
		pendingJournalSnapshot = null;
		isJournalDirty.value = false;
		journalText.value = '';

		const targetDateIso = dateIso.value;
		void runSerializedSave(targetDateIso, () => localRepo.daily.clearDayEntry(targetDateIso));
	}

	function updateCadenceActual(habitId: string, minutesPerInterval: number | null) {
		const current = logsByHabitId.value[habitId];
		const habit = effectiveHabitsForDate.value.find((h) => h.id === habitId);
		if (!current || !habit) return;
		const nowIso = new Date().toISOString();

		if (minutesPerInterval === null) {
			commitHabitLogChanges([
				{
					habit,
					item: {
						...current,
						achievedTier: null,
						achievedRuleSnapshot: null,
						actualMinutesPerInterval: null,
						updatedAtIso: nowIso
					}
				}
			]);
			return;
		}

		const safeMinutes = Math.max(0, Number.isNaN(minutesPerInterval) ? 0 : minutesPerInterval);
		const plannedMinutes =
			current.plannedMinutesSnapshot && current.plannedMinutesSnapshot > 0
				? current.plannedMinutesSnapshot
				: habit.defaultMinutesPerInterval > 0
					? habit.defaultMinutesPerInterval
					: null;

		const achievedTier =
			safeMinutes <= 0
				? TIER_SCORES.FAILED
				: !plannedMinutes || safeMinutes >= plannedMinutes
					? TIER_SCORES.GOLD
					: safeMinutes / plannedMinutes >= CADENCE_SUCCESS_RATIOS.SILVER_THRESHOLD
						? TIER_SCORES.SILVER
						: TIER_SCORES.BRONZE;

		const achievedRuleSnapshot = plannedMinutes
			? `${safeMinutes} دقیقه از هدف ${plannedMinutes} دقیقه`
			: `${safeMinutes} دقیقه انجام‌شده`;

		commitHabitLogChanges([
			{
				habit,
				item: {
					...current,
					habitTitleSnapshot: habit.title,
					achievedTier,
					achievedRuleSnapshot,
					actualMinutesPerInterval: safeMinutes,
					plannedMinutesSnapshot: plannedMinutes,
					updatedAtIso: nowIso
				}
			}
		]);
	}

	function setTomorrowPlanMinutes(habitId: string, minutes: number | null) {
		const current = tomorrowPlansByHabitId.value[habitId];
		if (!current) return;
		tomorrowPlansByHabitId.value = {
			...tomorrowPlansByHabitId.value,
			[habitId]: {
				...current,
				plannedMinutesPerInterval:
					minutes === null ? null : Math.max(0, Number.isNaN(minutes) ? 0 : minutes)
			}
		};
	}

	function copyTodayActualsToTomorrowPlan() {
		const next = { ...tomorrowPlansByHabitId.value };
		for (const habit of habits.value.filter(
			(h) => h.trackingMode === 'interval_cadence' && h.status === 'active'
		)) {
			const log = logsByHabitId.value[habit.id];
			if (log) {
				const actualMinutes = log.actualMinutesPerInterval ?? 0;
				next[habit.id] = {
					habitId: habit.id,
					plannedMinutesPerInterval: actualMinutes > 0 ? actualMinutes : null
				};
			}
		}
		tomorrowPlansByHabitId.value = next;
	}

	async function saveTomorrowCadencePlans(): Promise<void> {
		const items = Object.values(tomorrowPlansByHabitId.value).map((item) => ({
			habitId: item.habitId,
			plannedMinutesPerInterval: item.plannedMinutesPerInterval ?? 0
		}));
		await localRepo.daily.saveCadencePlans({
			targetDateIso: tomorrowIso.value,
			items
		});
	}

	function isNodeCompleted(habitId: string): boolean {
		return isHabitNodeCompleted({
			habitId,
			habits: effectiveHabitsForDate.value,
			logsByHabitId: logsByHabitId.value
		});
	}

	function getCompositeNotation(parentId: string): string {
		const children = effectiveHabitsForDate.value
			.filter((h) => h.parentId === parentId && h.status === 'active')
			.sort((a, b) => a.sortOrder - b.sortOrder);
		return computeCompositeParentDisplay(children, logsByHabitId.value);
	}

	return {
		habits,
		entry,
		allEntries,
		calendarEvents,
		people,
		tree,
		schedulableCadenceHabits,
		journalText,
		logsByHabitId,
		tomorrowPlansByHabitId,
		tomorrowIso,
		saveState,
		isDirty: readonly(isJournalDirty),
		computedDayStatus,
		completionStats,
		markAllOptimalFiveSecond,
		setTierScore,
		setParentGroupAllTier,
		clearDay,
		updateCadenceActual,
		scheduleAutoSave,
		flushPendingSave,
		setTomorrowPlanMinutes,
		copyTodayActualsToTomorrowPlan,
		saveTomorrowCadencePlans,
		isNodeCompleted,
		getCompositeNotation
	};
}
