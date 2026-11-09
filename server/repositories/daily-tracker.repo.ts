import { and, asc, eq } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '~~/server/database/index';
import {
	cadencePlans,
	dailyEntries,
	habitLogs,
	reflectionTags
} from '~~/server/database/schema';
import { getAllHabits } from '~~/server/repositories/habits.repo';
import { bumpServerStructuralVersion } from '~~/server/repositories/sync.repo';
import {
	isDailyEntryEmpty,
	resolveDailyHabitLogSnapshot,
	shouldDiscardHabitLogItem
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
			await bumpServerStructuralVersion(nowIso, tx);
			return;
		}

		const previousLogs = await tx
			.select()
			.from(habitLogs)
			.where(eq(habitLogs.dateIso, input.dateIso));
		const previousLogByHabitId = new Map(previousLogs.map((l) => [l.habitId, l]));
		const incomingHabitIds = new Set(input.logs.map((l) => l.habitId));

		for (const prevLog of previousLogs) {
			if (!incomingHabitIds.has(prevLog.habitId)) {
				await tx.delete(habitLogs).where(eq(habitLogs.id, prevLog.id));
				await bumpServerStructuralVersion(nowIso, tx);
			}
		}

		for (const log of input.logs) {
			const habit = habitMap.get(log.habitId);
			const prev = previousLogByHabitId.get(log.habitId);

			if (shouldDiscardHabitLogItem(habit, log)) {
				if (prev) {
					await tx.delete(habitLogs).where(eq(habitLogs.id, prev.id));
					await bumpServerStructuralVersion(nowIso, tx);
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

			const resolvedLogValues = resolveDailyHabitLogSnapshot({
				habit,
				log,
				previousLog: prev,
				fallbackUpdatedAtIso: nowIso
			});

			if (prev) {
				await tx
					.update(habitLogs)
					.set(resolvedLogValues)
					.where(eq(habitLogs.id, prev.id));
			} else {
				await tx.insert(habitLogs).values({
					id: `log:${input.dateIso}:${log.habitId}`,
					dateIso: input.dateIso,
					habitId: log.habitId,
					...resolvedLogValues
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

			if (item.plannedMinutesPerInterval <= 0) {
				if (existing) {
					await tx.delete(cadencePlans).where(eq(cadencePlans.id, existing.id));
					await bumpServerStructuralVersion(nowIso, tx);
				}
				continue;
			}

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
