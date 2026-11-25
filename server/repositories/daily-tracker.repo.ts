import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '~~/server/database/index';
import {
	cadencePlans,
	dailyEntries,
	habitLogs,
	habits
} from '~~/server/database/schema';
import {
	isDailyEntryEmpty,
	resolveDailyHabitLogSnapshot,
	shouldDiscardHabitLogItem
} from '~/core/habit-engine';
import { compareTimestampsIso } from '~/domain/calendar';
import type {
	HabitEntity,
	SaveCadencePlanBatch,
	SaveDailyEntryInput
} from '~/domain/schemas';

export type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

export async function getAllHabits(): Promise<HabitEntity[]> {
	await ensureDatabaseReady();
	return db.select().from(habits).orderBy(asc(habits.sortOrder));
}

const MAX_CLOCK_SKEW_MS = 60 * 1000;

export function clampClientTimestampIso(
	candidateIso: string | null | undefined,
	referenceNowMs = Date.now()
): string {
	const fallbackIso = new Date(referenceNowMs).toISOString();
	if (!candidateIso) return fallbackIso;
	const parsedMs = Date.parse(candidateIso);
	if (Number.isNaN(parsedMs)) return fallbackIso;
	if (parsedMs > referenceNowMs + MAX_CLOCK_SKEW_MS) {
		return fallbackIso;
	}
	return new Date(parsedMs).toISOString();
}

export async function saveDailyEntryAndLogs(
	input: SaveDailyEntryInput,
	preloadedHabitMap?: ReadonlyMap<string, HabitEntity>,
	txExecutor?: DbExecutor
): Promise<void> {
	await ensureDatabaseReady();
	const nowMs = Date.now();
	const nowIso = new Date(nowMs).toISOString();
	const entryUpdatedAtIso = clampClientTimestampIso(input.updatedAtIso, nowMs);
	const normalizedJournal = input.journalText?.trim() ? input.journalText : null;
	const habitMap =
		preloadedHabitMap ?? new Map((await getAllHabits()).map((h) => [h.id, h]));

	const applyOperations = async (tx: DbExecutor) => {
		const existingRows = await tx
			.select()
			.from(dailyEntries)
			.where(eq(dailyEntries.dateIso, input.dateIso))
			.limit(1);
		const existing = existingRows[0];

		if (isDailyEntryEmpty(input)) {
			if (!existing || existing.deletedAtIso !== null) {
				return;
			}
			if (
				input.updatedAtIso &&
				compareTimestampsIso(entryUpdatedAtIso, existing.updatedAtIso) < 0
			) {
				return;
			}
			await tx
				.update(habitLogs)
				.set({
					deletedAtIso: entryUpdatedAtIso,
					updatedAtIso: entryUpdatedAtIso
				})
				.where(and(eq(habitLogs.dateIso, input.dateIso), isNull(habitLogs.deletedAtIso)));
			await tx
				.update(dailyEntries)
				.set({
					journalText: null,
					deletedAtIso: entryUpdatedAtIso,
					updatedAtIso: entryUpdatedAtIso
				})
				.where(eq(dailyEntries.dateIso, input.dateIso));
			return;
		}

		if (existing) {
			if (
				!input.updatedAtIso ||
				compareTimestampsIso(entryUpdatedAtIso, existing.updatedAtIso) >= 0
			) {
				await tx
					.update(dailyEntries)
					.set({
						dayStatus: input.dayStatus,
						journalText: normalizedJournal,
						deletedAtIso: null,
						updatedAtIso: entryUpdatedAtIso
					})
					.where(eq(dailyEntries.dateIso, input.dateIso));
			}
		} else {
			await tx.insert(dailyEntries).values({
				id: `entry:${input.dateIso}`,
				dateIso: input.dateIso,
				dayStatus: input.dayStatus,
				journalText: normalizedJournal,
				updatedAtIso: entryUpdatedAtIso,
				deletedAtIso: null
			});
		}

		const previousLogs = await tx
			.select()
			.from(habitLogs)
			.where(eq(habitLogs.dateIso, input.dateIso));
		const previousLogByHabitId = new Map(previousLogs.map((l) => [l.habitId, l]));
		const incomingHabitIds = new Set(input.logs.map((l) => l.habitId));

		const logIdsToSoftDelete: string[] = [];
		const logsToUpsert: Array<typeof habitLogs.$inferInsert> = [];

		for (const prevLog of previousLogs) {
			if (
				prevLog.deletedAtIso === null &&
				!incomingHabitIds.has(prevLog.habitId) &&
				(!prevLog.updatedAtIso ||
					compareTimestampsIso(entryUpdatedAtIso, prevLog.updatedAtIso) >= 0)
			) {
				logIdsToSoftDelete.push(prevLog.id);
			}
		}

		for (const log of input.logs) {
			const habit = habitMap.get(log.habitId);
			const prev = previousLogByHabitId.get(log.habitId);
			const sanitizedLogUpdatedAtIso = log.updatedAtIso
				? clampClientTimestampIso(log.updatedAtIso, nowMs)
				: entryUpdatedAtIso;

			if (shouldDiscardHabitLogItem(habit, log)) {
				if (
					prev &&
					prev.deletedAtIso === null &&
					(!prev.updatedAtIso ||
						compareTimestampsIso(sanitizedLogUpdatedAtIso, prev.updatedAtIso) >= 0)
				) {
					logIdsToSoftDelete.push(prev.id);
				}
				continue;
			}

			if (
				prev?.updatedAtIso &&
				compareTimestampsIso(sanitizedLogUpdatedAtIso, prev.updatedAtIso) < 0
			) {
				continue;
			}

			const resolvedLogValues = resolveDailyHabitLogSnapshot({
				habit,
				log: {
					...log,
					updatedAtIso: sanitizedLogUpdatedAtIso
				},
				previousLog: prev && prev.deletedAtIso === null ? prev : null,
				fallbackUpdatedAtIso: nowIso
			});

			logsToUpsert.push({
				id: prev?.id ?? `log:${input.dateIso}:${log.habitId}`,
				dateIso: input.dateIso,
				habitId: log.habitId,
				...resolvedLogValues,
				deletedAtIso: null
			});
		}

		if (logIdsToSoftDelete.length > 0) {
			const uniqueDeleteIds = Array.from(new Set(logIdsToSoftDelete));
			await tx
				.update(habitLogs)
				.set({
					deletedAtIso: entryUpdatedAtIso,
					updatedAtIso: entryUpdatedAtIso
				})
				.where(inArray(habitLogs.id, uniqueDeleteIds));
		}

		if (logsToUpsert.length > 0) {
			await tx
				.insert(habitLogs)
				.values(logsToUpsert)
				.onConflictDoUpdate({
					target: [habitLogs.dateIso, habitLogs.habitId],
					set: {
						habitTitleSnapshot: sql`excluded.habit_title_snapshot`,
						achievedTier: sql`excluded.achieved_tier`,
						achievedRuleSnapshot: sql`excluded.achieved_rule_snapshot`,
						habitSnapshotJson: sql`excluded.habit_snapshot_json`,
						actualMinutesPerInterval: sql`excluded.actual_minutes_per_interval`,
						plannedMinutesSnapshot: sql`excluded.planned_minutes_snapshot`,
						deletedAtIso: sql`excluded.deleted_at_iso`,
						updatedAtIso: sql`excluded.updated_at_iso`
					}
				});
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
	txExecutor?: DbExecutor
): Promise<void> {
	await ensureDatabaseReady();
	const nowMs = Date.now();
	const batchUpdatedAtIso = clampClientTimestampIso(input.updatedAtIso, nowMs);

	const applyOperations = async (tx: DbExecutor) => {
		const existingPlans = await tx
			.select()
			.from(cadencePlans)
			.where(eq(cadencePlans.dateIso, input.targetDateIso));
		const existingByHabitId = new Map(existingPlans.map((p) => [p.habitId, p]));

		const planIdsToSoftDelete: string[] = [];
		const plansToUpsert: Array<typeof cadencePlans.$inferInsert> = [];

		for (const item of input.items) {
			const itemUpdatedAtIso = item.updatedAtIso
				? clampClientTimestampIso(item.updatedAtIso, nowMs)
				: batchUpdatedAtIso;
			const existing = existingByHabitId.get(item.habitId);

			if (
				existing?.updatedAtIso &&
				compareTimestampsIso(itemUpdatedAtIso, existing.updatedAtIso) < 0
			) {
				continue;
			}

			if (item.plannedMinutesPerInterval <= 0) {
				if (existing && existing.deletedAtIso === null) {
					planIdsToSoftDelete.push(existing.id);
				}
				continue;
			}

			plansToUpsert.push({
				id: existing?.id ?? `plan:${input.targetDateIso}:${item.habitId}`,
				dateIso: input.targetDateIso,
				habitId: item.habitId,
				plannedMinutesPerInterval: item.plannedMinutesPerInterval,
				updatedAtIso: itemUpdatedAtIso,
				deletedAtIso: null
			});
		}

		if (planIdsToSoftDelete.length > 0) {
			const uniqueDeleteIds = Array.from(new Set(planIdsToSoftDelete));
			await tx
				.update(cadencePlans)
				.set({
					deletedAtIso: batchUpdatedAtIso,
					updatedAtIso: batchUpdatedAtIso
				})
				.where(inArray(cadencePlans.id, uniqueDeleteIds));
		}

		if (plansToUpsert.length > 0) {
			await tx
				.insert(cadencePlans)
				.values(plansToUpsert)
				.onConflictDoUpdate({
					target: [cadencePlans.dateIso, cadencePlans.habitId],
					set: {
						plannedMinutesPerInterval: sql`excluded.planned_minutes_per_interval`,
						deletedAtIso: sql`excluded.deleted_at_iso`,
						updatedAtIso: sql`excluded.updated_at_iso`
					}
				});
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
