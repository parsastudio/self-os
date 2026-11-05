import { db } from '../database/index';
import {
	cadencePlans,
	dailyEntries,
	habitLogs,
	habits,
	reflectionTags
} from '../database/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getAllHabits } from './habits.repo';
import { bumpServerStructuralVersion } from './sync.repo';
import {
	isDailyEntryEmpty,
	resolveHabitRuleSnapshot,
	serializeHabitSpecSnapshot
} from '~/core/habit-engine';
import { DEFAULT_REFLECTION_TAGS } from '~/domain/constants';
import type {
	HabitEntity,
	SaveCadencePlanBatch,
	SaveDailyEntryInput
} from '~/domain/schemas';

export function getReflectionTags(): string[] {
	const rows = db
		.select()
		.from(reflectionTags)
		.orderBy(asc(reflectionTags.sortOrder))
		.all();

	if (rows.length === 0) {
		return [...DEFAULT_REFLECTION_TAGS];
	}
	return rows.map((r) => r.label);
}

type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

export function saveDailyEntryAndLogs(
	input: SaveDailyEntryInput,
	preloadedHabitMap?: ReadonlyMap<string, HabitEntity>,
	txExecutor?: DbExecutor
): void {
	const nowIso = new Date().toISOString();
	const entryUpdatedAtIso = input.updatedAtIso || nowIso;
	const normalizedJournal = input.journalText?.trim() ? input.journalText.trim() : null;
	const habitMap =
		preloadedHabitMap ?? new Map(getAllHabits().map((h) => [h.id, h]));

	const applyOperations = (tx: DbExecutor) => {
		const existing = tx
			.select()
			.from(dailyEntries)
			.where(eq(dailyEntries.dateIso, input.dateIso))
			.get();

		if (existing) {
			if (!input.updatedAtIso || entryUpdatedAtIso >= existing.updatedAtIso) {
				tx.update(dailyEntries)
					.set({
						dayStatus: input.dayStatus,
						reflectionNote: input.reflectionNote,
						journalText: normalizedJournal,
						tagsJson: JSON.stringify(input.tags),
						updatedAtIso: entryUpdatedAtIso
					})
					.where(eq(dailyEntries.dateIso, input.dateIso))
					.run();
			}
		} else {
			tx.insert(dailyEntries)
				.values({
					id: `entry:${input.dateIso}`,
					dateIso: input.dateIso,
					dayStatus: input.dayStatus,
					reflectionNote: input.reflectionNote,
					journalText: normalizedJournal,
					tagsJson: JSON.stringify(input.tags),
					updatedAtIso: entryUpdatedAtIso
				})
				.run();
		}

		if (isDailyEntryEmpty(input)) {
			tx.delete(habitLogs).where(eq(habitLogs.dateIso, input.dateIso)).run();
			tx.delete(dailyEntries).where(eq(dailyEntries.dateIso, input.dateIso)).run();
			bumpServerStructuralVersion(entryUpdatedAtIso);
			return;
		}

		const previousLogs = tx
			.select()
			.from(habitLogs)
			.where(eq(habitLogs.dateIso, input.dateIso))
			.all();
		const previousLogByHabitId = new Map(previousLogs.map((l) => [l.habitId, l]));

		for (const log of input.logs) {
			const habit = habitMap.get(log.habitId);
			const prev = previousLogByHabitId.get(log.habitId);

			const isUnloggedTiered =
				habit?.trackingMode === 'tiered' &&
				(log.achievedTier === null || log.achievedTier === undefined);

			if (isUnloggedTiered) {
				if (prev) {
					tx.delete(habitLogs).where(eq(habitLogs.id, prev.id)).run();
					bumpServerStructuralVersion(entryUpdatedAtIso);
				}
				continue;
			}

			if (
				prev?.updatedAtIso &&
				log.updatedAtIso &&
				log.updatedAtIso < prev.updatedAtIso
			) {
				continue;
			}

			const logUpdatedAt = log.updatedAtIso || nowIso;
			const tierUnchanged = prev && prev.achievedTier === log.achievedTier;

			const habitTitleSnapshot =
				(tierUnchanged && prev?.habitTitleSnapshot) ||
				log.habitTitleSnapshot ||
				habit?.title ||
				prev?.habitTitleSnapshot ||
				'طرح';

			const achievedRuleSnapshot =
				(tierUnchanged && prev?.achievedRuleSnapshot) ||
				(habit ? resolveHabitRuleSnapshot(habit, log.achievedTier) : null) ||
				log.achievedRuleSnapshot ||
				prev?.achievedRuleSnapshot ||
				null;

			const habitSnapshotJson =
				(tierUnchanged && prev?.habitSnapshotJson) ||
				(habit
					? serializeHabitSpecSnapshot(habit)
					: (prev?.habitSnapshotJson ?? null));

			if (prev) {
				tx.update(habitLogs)
					.set({
						habitTitleSnapshot,
						achievedTier: log.achievedTier,
						achievedRuleSnapshot,
						habitSnapshotJson,
						completedIntervals: log.completedIntervals,
						actualMinutesPerInterval: log.actualMinutesPerInterval,
						totalActualMinutes: log.totalActualMinutes,
						plannedIntervalsSnapshot:
							log.plannedIntervalsSnapshot ?? prev.plannedIntervalsSnapshot ?? null,
						plannedMinutesSnapshot:
							log.plannedMinutesSnapshot ?? prev.plannedMinutesSnapshot ?? null,
						updatedAtIso: logUpdatedAt
					})
					.where(eq(habitLogs.id, prev.id))
					.run();
			} else {
				tx.insert(habitLogs)
					.values({
						id: `log:${input.dateIso}:${log.habitId}`,
						dateIso: input.dateIso,
						habitId: log.habitId,
						habitTitleSnapshot,
						achievedTier: log.achievedTier,
						achievedRuleSnapshot,
						habitSnapshotJson,
						completedIntervals: log.completedIntervals,
						actualMinutesPerInterval: log.actualMinutesPerInterval,
						totalActualMinutes: log.totalActualMinutes,
						plannedIntervalsSnapshot: log.plannedIntervalsSnapshot ?? null,
						plannedMinutesSnapshot: log.plannedMinutesSnapshot ?? null,
						updatedAtIso: logUpdatedAt
					})
					.run();
			}
		}
	};

	if (txExecutor) {
		applyOperations(txExecutor);
	} else {
		db.transaction((tx) => applyOperations(tx));
	}
}

export function saveCadencePlansForDate(
	input: SaveCadencePlanBatch,
	preloadedHabitMap?: Map<string, HabitEntity>,
	txExecutor?: DbExecutor
): void {
	const nowIso = new Date().toISOString();
	const habitMap =
		preloadedHabitMap ?? new Map(getAllHabits().map((h) => [h.id, h]));

	const applyOperations = (tx: DbExecutor) => {
		for (const item of input.items) {
			const existing = tx
				.select()
				.from(cadencePlans)
				.where(
					and(
						eq(cadencePlans.dateIso, input.targetDateIso),
						eq(cadencePlans.habitId, item.habitId)
					)
				)
				.get();

			if (existing) {
				tx.update(cadencePlans)
					.set({
						plannedIntervals: item.plannedIntervals,
						plannedMinutesPerInterval: item.plannedMinutesPerInterval,
						cadenceWindowMinutes: item.cadenceWindowMinutes,
						updatedAtIso: nowIso
					})
					.where(eq(cadencePlans.id, existing.id))
					.run();
			} else {
				tx.insert(cadencePlans)
					.values({
						id: `plan:${input.targetDateIso}:${item.habitId}`,
						dateIso: input.targetDateIso,
						habitId: item.habitId,
						plannedIntervals: item.plannedIntervals,
						plannedMinutesPerInterval: item.plannedMinutesPerInterval,
						cadenceWindowMinutes: item.cadenceWindowMinutes,
						updatedAtIso: nowIso
					})
					.run();
			}

			const habit = habitMap.get(item.habitId);
			if (
				habit &&
				(habit.defaultIntervals !== item.plannedIntervals ||
					habit.defaultMinutesPerInterval !== item.plannedMinutesPerInterval ||
					habit.cadenceWindowMinutes !== item.cadenceWindowMinutes)
			) {
				tx.update(habits)
					.set({
						defaultIntervals: item.plannedIntervals,
						defaultMinutesPerInterval: item.plannedMinutesPerInterval,
						cadenceWindowMinutes: item.cadenceWindowMinutes,
						updatedAtIso: nowIso
					})
					.where(eq(habits.id, habit.id))
					.run();

				habitMap.set(habit.id, {
					...habit,
					defaultIntervals: item.plannedIntervals,
					defaultMinutesPerInterval: item.plannedMinutesPerInterval,
					cadenceWindowMinutes: item.cadenceWindowMinutes,
					updatedAtIso: nowIso
				});
			}
		}
	};

	if (txExecutor) {
		applyOperations(txExecutor);
	} else {
		db.transaction((tx) => applyOperations(tx));
	}
}
