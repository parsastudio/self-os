import { and, asc, eq } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '../database/index';
import crypto from 'node:crypto';
import {
	cadencePlans,
	dailyEntries,
	habitLifecycleEvents,
	habitLogs,
	habits,
	reflectionTags
} from '../database/schema';
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

export async function getReflectionTags(): Promise<string[]> {
	await ensureDatabaseReady();
	const rows = await db
		.select()
		.from(reflectionTags)
		.orderBy(asc(reflectionTags.sortOrder));

	if (rows.length === 0) {
		return [...DEFAULT_REFLECTION_TAGS];
	}
	return rows.map((r) => r.label);
}

export type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

export async function saveDailyEntryAndLogs(
	input: SaveDailyEntryInput,
	preloadedHabitMap?: ReadonlyMap<string, HabitEntity>,
	txExecutor?: DbExecutor
): Promise<void> {
	await ensureDatabaseReady();
	const nowIso = new Date().toISOString();
	const entryUpdatedAtIso = input.updatedAtIso || nowIso;
	const normalizedJournal = input.journalText?.trim() ? input.journalText.trim() : null;
	const habitMap =
		preloadedHabitMap ?? new Map((await getAllHabits()).map((h) => [h.id, h]));

	const applyOperations = async (tx: DbExecutor) => {
		const existingRows = await tx
			.select()
			.from(dailyEntries)
			.where(eq(dailyEntries.dateIso, input.dateIso))
			.limit(1);
		const existing = existingRows[0];

		if (existing) {
			if (!input.updatedAtIso || entryUpdatedAtIso >= existing.updatedAtIso) {
				await tx
					.update(dailyEntries)
					.set({
						dayStatus: input.dayStatus,
						reflectionNote: input.reflectionNote,
						journalText: normalizedJournal,
						tagsJson: JSON.stringify(input.tags),
						updatedAtIso: entryUpdatedAtIso
					})
					.where(eq(dailyEntries.dateIso, input.dateIso));
			}
		} else {
			await tx.insert(dailyEntries).values({
				id: `entry:${input.dateIso}`,
				dateIso: input.dateIso,
				dayStatus: input.dayStatus,
				reflectionNote: input.reflectionNote,
				journalText: normalizedJournal,
				tagsJson: JSON.stringify(input.tags),
				updatedAtIso: entryUpdatedAtIso
			});
		}

		if (isDailyEntryEmpty(input)) {
			await tx.delete(habitLogs).where(eq(habitLogs.dateIso, input.dateIso));
			await tx.delete(dailyEntries).where(eq(dailyEntries.dateIso, input.dateIso));
			bumpServerStructuralVersion(entryUpdatedAtIso);
			return;
		}

		const previousLogs = await tx
			.select()
			.from(habitLogs)
			.where(eq(habitLogs.dateIso, input.dateIso));
		const previousLogByHabitId = new Map(previousLogs.map((l) => [l.habitId, l]));

		for (const log of input.logs) {
			const habit = habitMap.get(log.habitId);
			const prev = previousLogByHabitId.get(log.habitId);

			const isUnloggedTiered =
				habit?.trackingMode === 'tiered' &&
				(log.achievedTier === null || log.achievedTier === undefined);

			if (isUnloggedTiered) {
				if (prev) {
					await tx.delete(habitLogs).where(eq(habitLogs.id, prev.id));
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
				await tx
					.update(habitLogs)
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
					.where(eq(habitLogs.id, prev.id));
			} else {
				await tx.insert(habitLogs).values({
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
				});
			}
		}
	};

	if (txExecutor) {
		await applyOperations(txExecutor);
	} else {
		await db.transaction(async (tx) => {
			await applyOperations(tx);
		});
	}
}

export async function saveCadencePlansForDate(
	input: SaveCadencePlanBatch,
	preloadedHabitMap?: Map<string, HabitEntity>,
	txExecutor?: DbExecutor
): Promise<void> {
	await ensureDatabaseReady();
	const nowIso = new Date().toISOString();
	const habitMap =
		preloadedHabitMap ?? new Map((await getAllHabits()).map((h) => [h.id, h]));

	const applyOperations = async (tx: DbExecutor) => {
		for (const item of input.items) {
			const existingRows = await tx
				.select()
				.from(cadencePlans)
				.where(
					and(
						eq(cadencePlans.dateIso, input.targetDateIso),
						eq(cadencePlans.habitId, item.habitId)
					)
				)
				.limit(1);
			const existing = existingRows[0];

			if (existing) {
				await tx
					.update(cadencePlans)
					.set({
						plannedIntervals: item.plannedIntervals,
						plannedMinutesPerInterval: item.plannedMinutesPerInterval,
						cadenceWindowMinutes: item.cadenceWindowMinutes,
						updatedAtIso: nowIso
					})
					.where(eq(cadencePlans.id, existing.id));
			} else {
				await tx.insert(cadencePlans).values({
					id: `plan:${input.targetDateIso}:${item.habitId}`,
					dateIso: input.targetDateIso,
					habitId: item.habitId,
					plannedIntervals: item.plannedIntervals,
					plannedMinutesPerInterval: item.plannedMinutesPerInterval,
					cadenceWindowMinutes: item.cadenceWindowMinutes,
					updatedAtIso: nowIso
				});
			}

			const habit = habitMap.get(item.habitId);
			if (
				habit &&
				(habit.defaultIntervals !== item.plannedIntervals ||
					habit.defaultMinutesPerInterval !== item.plannedMinutesPerInterval ||
					habit.cadenceWindowMinutes !== item.cadenceWindowMinutes)
			) {
				await tx
					.update(habits)
					.set({
						defaultIntervals: item.plannedIntervals,
						defaultMinutesPerInterval: item.plannedMinutesPerInterval,
						cadenceWindowMinutes: item.cadenceWindowMinutes,
						updatedAtIso: nowIso
					})
					.where(eq(habits.id, habit.id));

				await tx.insert(habitLifecycleEvents).values({
					id: crypto.randomUUID(),
					habitId: habit.id,
					habitTitleSnapshot: habit.title,
					eventType: 'CADENCE_UPDATED',
					effectiveDateIso: input.targetDateIso,
					summary: `تنظیم برای روز بعد: در هر ${item.cadenceWindowMinutes} دقیقه، ${item.plannedMinutesPerInterval} دقیقه (${item.plannedIntervals} بازه)`,
					reason: input.reason || 'تنظیم از شب قبل',
					previousStateJson: JSON.stringify({
						intervals: habit.defaultIntervals,
						minutes: habit.defaultMinutesPerInterval,
						window: habit.cadenceWindowMinutes
					}),
					newStateJson: JSON.stringify({
						intervals: item.plannedIntervals,
						minutes: item.plannedMinutesPerInterval,
						window: item.cadenceWindowMinutes
					}),
					createdAtIso: nowIso
				});

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
		await applyOperations(txExecutor);
	} else {
		await db.transaction(async (tx) => {
			await applyOperations(tx);
		});
	}
}
