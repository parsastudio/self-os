import { db } from '../database/index';
import {
	cadencePlans,
	dailyEntries,
	habitLifecycleEvents,
	habitLogs,
	habits,
	reflectionTags
} from '../database/schema';
import { and, asc, desc, eq, isNotNull, ne } from 'drizzle-orm';
import { getAllHabits } from './habits.repo';
import { getUpcomingEventsBannerItems } from './calendar.repo';
import { resolveHabitRuleSnapshot, serializeHabitSpecSnapshot } from '~/core/habit-engine';
import { DEFAULT_REFLECTION_TAGS } from '~/domain/constants';
import { parseTagsJson } from '~/domain/tags';
import type {
	DayCommandPayload,
	HabitEntity,
	JournalMemoryItem,
	SaveCadencePlanBatch,
	SaveDailyEntryInput
} from '~/domain/schemas';

export function getJournalMemories(): JournalMemoryItem[] {
	const rows = db
		.select()
		.from(dailyEntries)
		.where(and(isNotNull(dailyEntries.journalText), ne(dailyEntries.journalText, '')))
		.orderBy(desc(dailyEntries.dateIso))
		.all();

	const memories: JournalMemoryItem[] = [];
	for (const row of rows) {
		const text = row.journalText?.trim();
		if (!text) continue;
		memories.push({
			id: row.id,
			dateIso: row.dateIso,
			dayStatus: row.dayStatus,
			journalText: text,
			tags: parseTagsJson(row.tagsJson),
			updatedAtIso: row.updatedAtIso
		});
	}
	return memories;
}

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

export function getDayCommandPayload(
	dateIso: string,
	tomorrowIso: string
): DayCommandPayload {
	const allHabits = getAllHabits();
	const availableTags = getReflectionTags();

	const entry = db
		.select()
		.from(dailyEntries)
		.where(eq(dailyEntries.dateIso, dateIso))
		.get();

	const logs = db
		.select()
		.from(habitLogs)
		.where(eq(habitLogs.dateIso, dateIso))
		.all();

	const dayCadencePlans = db
		.select()
		.from(cadencePlans)
		.where(eq(cadencePlans.dateIso, dateIso))
		.all();

	const tomorrowCadencePlans = db
		.select()
		.from(cadencePlans)
		.where(eq(cadencePlans.dateIso, tomorrowIso))
		.all();

	const recentEntries = db
		.select()
		.from(dailyEntries)
		.orderBy(desc(dailyEntries.dateIso))
		.limit(35)
		.all();

	const { todayAndUpcoming, selectedDayEvents } = getUpcomingEventsBannerItems(dateIso, 7);

	return {
		dateIso,
		tomorrowIso,
		habits: allHabits,
		availableTags,
		entry: entry
			? {
					id: entry.id,
					dateIso: entry.dateIso,
					dayStatus: entry.dayStatus,
					reflectionNote: entry.reflectionNote,
					journalText: entry.journalText ?? null,
					tags: parseTagsJson(entry.tagsJson),
					updatedAtIso: entry.updatedAtIso
				}
			: null,
		logs,
		dayCadencePlans,
		tomorrowCadencePlans,
		recentEntries: recentEntries.map((r) => ({
			dateIso: r.dateIso,
			dayStatus: r.dayStatus,
			reflectionNote: r.reflectionNote,
			tags: parseTagsJson(r.tagsJson)
		})),
		upcomingBannerItems: todayAndUpcoming,
		selectedDayEvents
	};
}

export function saveDailyEntryAndLogs(
	input: SaveDailyEntryInput,
	preloadedHabitMap?: ReadonlyMap<string, HabitEntity>
): void {
	const nowIso = new Date().toISOString();
	const entryUpdatedAtIso = input.updatedAtIso || nowIso;
	const normalizedJournal = input.journalText?.trim() ? input.journalText.trim() : null;
	const habitMap =
		preloadedHabitMap ?? new Map(getAllHabits().map((h) => [h.id, h]));

	db.transaction((tx) => {
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

		const isCompletelyEmpty =
			(!input.reflectionNote || input.reflectionNote.trim() === '') &&
			(!input.journalText || input.journalText.trim() === '') &&
			input.tags.length === 0 &&
			input.logs.every(
				(l) =>
					(l.achievedTier === null || l.achievedTier === undefined) &&
					(l.totalActualMinutes === null || l.totalActualMinutes === 0 || l.totalActualMinutes === undefined)
			);

		if (isCompletelyEmpty) {
			tx.delete(habitLogs).where(eq(habitLogs.dateIso, input.dateIso)).run();
			tx.delete(dailyEntries).where(eq(dailyEntries.dateIso, input.dateIso)).run();
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

			if (
				!prev &&
				isUnloggedTiered &&
				habit &&
				(habit.status === 'archived' || habit.createdAtIso > input.dateIso)
			) {
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
	});
}

export function saveCadencePlansForDate(input: SaveCadencePlanBatch): void {
	const nowIso = new Date().toISOString();
	const allHabits = getAllHabits();
	const habitMap = new Map(allHabits.map((h) => [h.id, h]));

	db.transaction((tx) => {
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
						cadenceWindowMinutes: item.cadenceWindowMinutes
					})
					.where(eq(habits.id, habit.id))
					.run();

				tx.insert(habitLifecycleEvents)
					.values({
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
					})
					.run();
			}
		}
	});
}
