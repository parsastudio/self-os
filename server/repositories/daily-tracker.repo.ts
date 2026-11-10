import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '~~/server/database/index';
import {
	cadencePlans,
	dailyEntries,
	habitLogs,
	reflectionTags
} from '~~/server/database/schema';
import { getAllHabits } from '~~/server/repositories/habits.repo';
import {
	bumpServerStructuralVersion,
	recordServerDeletionTombstones
} from '~~/server/repositories/sync.repo';
import {
	isDailyEntryEmpty,
	resolveDailyHabitLogSnapshot,
	shouldDiscardHabitLogItem
} from '~/core/habit-engine';
import { compareTimestampsIso } from '~/domain/calendar';
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
			if (
				existing &&
				input.updatedAtIso &&
				compareTimestampsIso(entryUpdatedAtIso, existing.updatedAtIso) < 0
			) {
				return;
			}
			const existingLogs = await tx
				.select({ id: habitLogs.id })
				.from(habitLogs)
				.where(eq(habitLogs.dateIso, input.dateIso));
			await tx.delete(habitLogs).where(eq(habitLogs.dateIso, input.dateIso));
			await tx.delete(dailyEntries).where(eq(dailyEntries.dateIso, input.dateIso));
			await recordServerDeletionTombstones(
				[
					`del:entry:${input.dateIso}`,
					...existingLogs.map((l) => `del:log:${l.id}`)
				],
				entryUpdatedAtIso,
				tx
			);
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

		const previousLogs = await tx
			.select()
			.from(habitLogs)
			.where(eq(habitLogs.dateIso, input.dateIso));
		const previousLogByHabitId = new Map(previousLogs.map((l) => [l.habitId, l]));
		const incomingHabitIds = new Set(input.logs.map((l) => l.habitId));

		const logIdsToDelete: string[] = [];
		const logsToUpsert: Array<typeof habitLogs.$inferInsert> = [];

		for (const prevLog of previousLogs) {
			if (!incomingHabitIds.has(prevLog.habitId)) {
				logIdsToDelete.push(prevLog.id);
			}
		}

		for (const log of input.logs) {
			const habit = habitMap.get(log.habitId);
			const prev = previousLogByHabitId.get(log.habitId);

			if (shouldDiscardHabitLogItem(habit, log)) {
				if (prev) {
					logIdsToDelete.push(prev.id);
				}
				continue;
			}

			const sanitizedLogUpdatedAtIso = log.updatedAtIso
				? clampClientTimestampIso(log.updatedAtIso, nowMs)
				: entryUpdatedAtIso;

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
				previousLog: prev,
				fallbackUpdatedAtIso: nowIso
			});

			logsToUpsert.push({
				id: prev?.id ?? `log:${input.dateIso}:${log.habitId}`,
				dateIso: input.dateIso,
				habitId: log.habitId,
				...resolvedLogValues
			});
		}

		if (logIdsToDelete.length > 0) {
			const uniqueDeleteIds = Array.from(new Set(logIdsToDelete));
			await tx.delete(habitLogs).where(inArray(habitLogs.id, uniqueDeleteIds));
			await recordServerDeletionTombstones(
				uniqueDeleteIds.map((id) => `del:log:${id}`),
				entryUpdatedAtIso,
				tx
			);
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
						completedIntervals: sql`excluded.completed_intervals`,
						actualMinutesPerInterval: sql`excluded.actual_minutes_per_interval`,
						totalActualMinutes: sql`excluded.total_actual_minutes`,
						plannedIntervalsSnapshot: sql`excluded.planned_intervals_snapshot`,
						plannedMinutesSnapshot: sql`excluded.planned_minutes_snapshot`,
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
	const nowIso = new Date(nowMs).toISOString();
	const batchUpdatedAtIso = clampClientTimestampIso(input.updatedAtIso, nowMs);

	const applyOperations = async (tx: DbExecutor) => {
		const existingPlans = await tx
			.select()
			.from(cadencePlans)
			.where(eq(cadencePlans.dateIso, input.targetDateIso));
		const existingByHabitId = new Map(existingPlans.map((p) => [p.habitId, p]));

		const planIdsToDelete: string[] = [];
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
				if (existing) {
					planIdsToDelete.push(existing.id);
				}
				continue;
			}

			plansToUpsert.push({
				id: existing?.id ?? `plan:${input.targetDateIso}:${item.habitId}`,
				dateIso: input.targetDateIso,
				habitId: item.habitId,
				plannedIntervals: item.plannedIntervals,
				plannedMinutesPerInterval: item.plannedMinutesPerInterval,
				cadenceWindowMinutes: item.cadenceWindowMinutes,
				updatedAtIso: itemUpdatedAtIso
			});
		}

		if (planIdsToDelete.length > 0) {
			const uniqueDeleteIds = Array.from(new Set(planIdsToDelete));
			await tx.delete(cadencePlans).where(inArray(cadencePlans.id, uniqueDeleteIds));
			await recordServerDeletionTombstones(
				uniqueDeleteIds.map((id) => `del:plan:${id}`),
				batchUpdatedAtIso,
				tx
			);
		}

		if (plansToUpsert.length > 0) {
			await tx
				.insert(cadencePlans)
				.values(plansToUpsert)
				.onConflictDoUpdate({
					target: [cadencePlans.dateIso, cadencePlans.habitId],
					set: {
						plannedIntervals: sql`excluded.planned_intervals`,
						plannedMinutesPerInterval: sql`excluded.planned_minutes_per_interval`,
						cadenceWindowMinutes: sql`excluded.cadence_window_minutes`,
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
