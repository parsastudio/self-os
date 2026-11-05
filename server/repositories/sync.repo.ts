import { db } from '../database/index';
import {
	books,
	cadencePlans,
	calendarEvents,
	dailyEntries,
	habitLifecycleEvents,
	habitLogs,
	habits,
	mediaLogs,
	notes
} from '../database/schema';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { getAllHabits } from './habits.repo';
import { getReflectionTags, saveCadencePlansForDate, saveDailyEntryAndLogs } from './daily-tracker.repo';
import { parseTagsJson } from '~/domain/tags';
import type {
	LocalWorkspaceSnapshot,
	ServerSyncResponse,
	SyncRequestPayload
} from '~/domain/schemas';

export function getServerMaxVersionIso(): string {
	const row = db.get<{ maxIso: string | null }>(sql`
		SELECT MAX(ts) AS maxIso FROM (
			SELECT MAX(updated_at_iso) AS ts FROM daily_entries
			UNION ALL
			SELECT MAX(updated_at_iso) AS ts FROM habit_logs
			UNION ALL
			SELECT MAX(updated_at_iso) AS ts FROM habits
			UNION ALL
			SELECT MAX(updated_at_iso) AS ts FROM cadence_plans
			UNION ALL
			SELECT MAX(updated_at_iso) AS ts FROM notes
			UNION ALL
			SELECT MAX(updated_at_iso) AS ts FROM books
			UNION ALL
			SELECT MAX(updated_at_iso) AS ts FROM media_logs
			UNION ALL
			SELECT MAX(updated_at_iso) AS ts FROM calendar_events
		)
	`);

	return row?.maxIso || '1970-01-01T00:00:00.000Z';
}

export function processClientSyncRequest(input: SyncRequestPayload, appVersion = '0.0.1'): ServerSyncResponse {
	const versionBeforeMutations = getServerMaxVersionIso();
	const hadRemoteUpdatesBeforePush = Boolean(
		input.knownServerVersionIso && versionBeforeMutations > input.knownServerVersionIso
	);

	const appliedMutationIds: string[] = [];

	if (input.mutations.length > 0) {
		const sortedMutations = [...input.mutations].sort((a, b) =>
			a.queuedAtIso > b.queuedAtIso ? 1 : a.queuedAtIso < b.queuedAtIso ? -1 : 0
		);

		db.transaction((tx) => {
			const preloadedHabitMap = new Map(getAllHabits().map((h) => [h.id, h]));

			for (const mutation of sortedMutations) {
				try {
					if (mutation.kind === 'SAVE_DAILY_ENTRY') {
						saveDailyEntryAndLogs(mutation.payload, preloadedHabitMap, tx);
						appliedMutationIds.push(mutation.id);
					} else if (mutation.kind === 'SAVE_CADENCE_PLAN') {
						saveCadencePlansForDate(mutation.payload, preloadedHabitMap, tx);
						appliedMutationIds.push(mutation.id);
					} else if (mutation.kind === 'UPSERT_BOOK') {
						tx.insert(books)
							.values(mutation.payload)
							.onConflictDoUpdate({
								target: books.id,
								set: mutation.payload
							})
							.run();
						appliedMutationIds.push(mutation.id);
					} else if (mutation.kind === 'DELETE_BOOK') {
						tx.delete(books).where(eq(books.id, mutation.payload.bookId)).run();
						appliedMutationIds.push(mutation.id);
					} else if (mutation.kind === 'UPSERT_MEDIA') {
						tx.insert(mediaLogs)
							.values(mutation.payload)
							.onConflictDoUpdate({
								target: mediaLogs.id,
								set: mutation.payload
							})
							.run();
						appliedMutationIds.push(mutation.id);
					} else if (mutation.kind === 'DELETE_MEDIA') {
						tx.delete(mediaLogs).where(eq(mediaLogs.id, mutation.payload.mediaId)).run();
						appliedMutationIds.push(mutation.id);
					} else if (mutation.kind === 'UPSERT_NOTE') {
						tx.insert(notes)
							.values(mutation.payload)
							.onConflictDoUpdate({
								target: notes.id,
								set: mutation.payload
							})
							.run();
						appliedMutationIds.push(mutation.id);
					} else if (mutation.kind === 'DELETE_NOTE') {
						tx.delete(notes).where(eq(notes.id, mutation.payload.noteId)).run();
						appliedMutationIds.push(mutation.id);
					} else if (mutation.kind === 'UPSERT_CALENDAR_EVENT') {
						tx.insert(calendarEvents)
							.values(mutation.payload)
							.onConflictDoUpdate({
								target: calendarEvents.id,
								set: mutation.payload
							})
							.run();
						appliedMutationIds.push(mutation.id);
					} else if (mutation.kind === 'DELETE_CALENDAR_EVENT') {
						tx.delete(calendarEvents).where(eq(calendarEvents.id, mutation.payload.eventId)).run();
						appliedMutationIds.push(mutation.id);
					} else if (mutation.kind === 'UPSERT_HABIT') {
						tx.insert(habits)
							.values(mutation.payload)
							.onConflictDoUpdate({
								target: habits.id,
								set: mutation.payload
							})
							.run();
						preloadedHabitMap.set(mutation.payload.id, mutation.payload);
						appliedMutationIds.push(mutation.id);
					} else if (mutation.kind === 'ADD_LIFECYCLE_EVENT') {
						tx.insert(habitLifecycleEvents)
							.values(mutation.payload)
							.onConflictDoUpdate({
								target: habitLifecycleEvents.id,
								set: mutation.payload
							})
							.run();
						appliedMutationIds.push(mutation.id);
					}
				} catch {
					// Single mutation failure does not abort the remaining valid items
				}
			}
		});
	}

	const serverVersionIso = getServerMaxVersionIso();
	const serverTimeIso = new Date().toISOString();

	const allEntriesRaw = db
		.select()
		.from(dailyEntries)
		.orderBy(desc(dailyEntries.dateIso))
		.all();

	const allLogsRaw = db
		.select()
		.from(habitLogs)
		.orderBy(desc(habitLogs.dateIso))
		.all();

	const mappedEntries = allEntriesRaw.map((e) => ({
		id: e.id,
		dateIso: e.dateIso,
		dayStatus: e.dayStatus,
		reflectionNote: e.reflectionNote,
		journalText: e.journalText ?? null,
		tags: parseTagsJson(e.tagsJson),
		updatedAtIso: e.updatedAtIso
	}));

	const mappedLogs = allLogsRaw.map((l) => ({
		id: l.id,
		dateIso: l.dateIso,
		habitId: l.habitId,
		habitTitleSnapshot: l.habitTitleSnapshot,
		achievedTier: l.achievedTier,
		achievedRuleSnapshot: l.achievedRuleSnapshot,
		habitSnapshotJson: l.habitSnapshotJson ?? null,
		completedIntervals: l.completedIntervals,
		actualMinutesPerInterval: l.actualMinutesPerInterval,
		totalActualMinutes: l.totalActualMinutes,
		plannedIntervalsSnapshot: l.plannedIntervalsSnapshot,
		plannedMinutesSnapshot: l.plannedMinutesSnapshot,
		updatedAtIso: l.updatedAtIso ?? null
	}));

	const fullWorkspace: LocalWorkspaceSnapshot = {
		versionIso: serverVersionIso,
		syncedAtIso: serverTimeIso,
		habits: getAllHabits(),
		availableTags: getReflectionTags(),
		entries: mappedEntries,
		logs: mappedLogs,
		cadencePlans: db.select().from(cadencePlans).orderBy(asc(cadencePlans.dateIso)).all(),
		books: db.select().from(books).orderBy(desc(books.createdAtIso)).all(),
		media: db.select().from(mediaLogs).orderBy(desc(mediaLogs.createdAtIso)).all(),
		notes: db
			.select()
			.from(notes)
			.orderBy(desc(notes.isPinned), desc(notes.updatedAtIso))
			.all(),
		calendarEvents: db
			.select()
			.from(calendarEvents)
			.orderBy(desc(calendarEvents.createdAtIso))
			.all(),
		lifecycleEvents: db
			.select()
			.from(habitLifecycleEvents)
			.orderBy(desc(habitLifecycleEvents.createdAtIso))
			.all()
	};

	return {
		ok: true,
		appliedMutationIds,
		serverVersionIso,
		appBuildVersion: appVersion,
		hasRemoteUpdates: hadRemoteUpdatesBeforePush,
		serverTimeIso,
		fullWorkspace
	};
}
