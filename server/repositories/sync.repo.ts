import { asc, desc, eq, sql } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '../database/index';
import {
	books,
	cadencePlans,
	calendarEvents,
	dailyEntries,
	habitLifecycleEvents,
	habitLogs,
	habits,
	mediaLogs,
	notes,
	syncState
} from '../database/schema';
import { getAllHabits } from './habits.repo';
import {
	type DbExecutor,
	getReflectionTags,
	saveCadencePlansForDate,
	saveDailyEntryAndLogs
} from './daily-tracker.repo';
import { parseTagsJson } from '~/domain/tags';
import type {
	LocalWorkspaceSnapshot,
	ServerSyncResponse,
	SyncRequestPayload
} from '~/domain/schemas';

const SYNC_STATE_SINGLETON_ID = 'singleton';
let lastStructuralMutationIso = '1970-01-01T00:00:00.000Z';

export async function bumpServerStructuralVersion(
	iso = new Date().toISOString(),
	txExecutor?: DbExecutor
): Promise<void> {
	if (iso > lastStructuralMutationIso) {
		lastStructuralMutationIso = iso;
	}
	await ensureDatabaseReady();
	const executor = txExecutor ?? db;
	await executor
		.insert(syncState)
		.values({
			id: SYNC_STATE_SINGLETON_ID,
			structuralVersionIso: iso
		})
		.onConflictDoUpdate({
			target: syncState.id,
			set: {
				structuralVersionIso: sql`GREATEST(${syncState.structuralVersionIso}, excluded.structural_version_iso)`
			}
		});
}

export async function getServerMaxVersionIso(): Promise<string> {
	await ensureDatabaseReady();
	const rows = await db.execute<{ max_iso: string | null }>(sql`
		SELECT MAX(ts) AS max_iso FROM (
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
			UNION ALL
			SELECT MAX(created_at_iso) AS ts FROM habit_lifecycle_events
			UNION ALL
			SELECT MAX(structural_version_iso) AS ts FROM sync_state
		) AS combined_timestamps
	`);

	const dbMax = rows[0]?.max_iso || '1970-01-01T00:00:00.000Z';
	return dbMax > lastStructuralMutationIso ? dbMax : lastStructuralMutationIso;
}

export async function processClientSyncRequest(
	input: SyncRequestPayload,
	appVersion = '0.0.1'
): Promise<ServerSyncResponse> {
	await ensureDatabaseReady();
	const versionBeforeMutations = await getServerMaxVersionIso();
	const hadRemoteUpdatesBeforePush = Boolean(
		input.knownServerVersionIso && versionBeforeMutations > input.knownServerVersionIso
	);

	const appliedMutationIds: string[] = [];

	if (input.mutations.length > 0) {
		const sortedMutations = [...input.mutations].sort((a, b) =>
			a.queuedAtIso > b.queuedAtIso ? 1 : a.queuedAtIso < b.queuedAtIso ? -1 : 0
		);

		const allHabitsList = await getAllHabits();
		const preloadedHabitMap = new Map(allHabitsList.map((h) => [h.id, h]));

		await db.transaction(async (tx) => {
			for (const mutation of sortedMutations) {
				if (mutation.kind === 'SAVE_DAILY_ENTRY') {
					await saveDailyEntryAndLogs(mutation.payload, preloadedHabitMap, tx);
				} else if (mutation.kind === 'SAVE_CADENCE_PLAN') {
					await saveCadencePlansForDate(mutation.payload, preloadedHabitMap, tx);
				} else if (mutation.kind === 'UPSERT_BOOK') {
					await tx
						.insert(books)
						.values(mutation.payload)
						.onConflictDoUpdate({
							target: books.id,
							set: mutation.payload,
							setWhere: sql`${books.updatedAtIso} IS NULL OR excluded.updated_at_iso >= ${books.updatedAtIso}`
						});
				} else if (mutation.kind === 'DELETE_BOOK') {
					await tx.delete(books).where(eq(books.id, mutation.payload.bookId));
					await bumpServerStructuralVersion(mutation.queuedAtIso, tx);
				} else if (mutation.kind === 'UPSERT_MEDIA') {
					await tx
						.insert(mediaLogs)
						.values(mutation.payload)
						.onConflictDoUpdate({
							target: mediaLogs.id,
							set: mutation.payload,
							setWhere: sql`${mediaLogs.updatedAtIso} IS NULL OR excluded.updated_at_iso >= ${mediaLogs.updatedAtIso}`
						});
				} else if (mutation.kind === 'DELETE_MEDIA') {
					await tx
						.delete(mediaLogs)
						.where(eq(mediaLogs.id, mutation.payload.mediaId));
					await bumpServerStructuralVersion(mutation.queuedAtIso, tx);
				} else if (mutation.kind === 'UPSERT_NOTE') {
					await tx
						.insert(notes)
						.values(mutation.payload)
						.onConflictDoUpdate({
							target: notes.id,
							set: mutation.payload,
							setWhere: sql`excluded.updated_at_iso >= ${notes.updatedAtIso}`
						});
				} else if (mutation.kind === 'DELETE_NOTE') {
					await tx.delete(notes).where(eq(notes.id, mutation.payload.noteId));
					await bumpServerStructuralVersion(mutation.queuedAtIso, tx);
				} else if (mutation.kind === 'UPSERT_CALENDAR_EVENT') {
					await tx
						.insert(calendarEvents)
						.values(mutation.payload)
						.onConflictDoUpdate({
							target: calendarEvents.id,
							set: mutation.payload,
							setWhere: sql`${calendarEvents.updatedAtIso} IS NULL OR excluded.updated_at_iso >= ${calendarEvents.updatedAtIso}`
						});
				} else if (mutation.kind === 'DELETE_CALENDAR_EVENT') {
					await tx
						.delete(calendarEvents)
						.where(eq(calendarEvents.id, mutation.payload.eventId));
					await bumpServerStructuralVersion(mutation.queuedAtIso, tx);
				} else if (mutation.kind === 'UPSERT_HABIT') {
					await tx
						.insert(habits)
						.values(mutation.payload)
						.onConflictDoUpdate({
							target: habits.id,
							set: mutation.payload,
							setWhere: sql`${habits.updatedAtIso} IS NULL OR excluded.updated_at_iso >= ${habits.updatedAtIso}`
						});
					preloadedHabitMap.set(mutation.payload.id, mutation.payload);
				} else if (mutation.kind === 'ADD_LIFECYCLE_EVENT') {
					await tx
						.insert(habitLifecycleEvents)
						.values(mutation.payload)
						.onConflictDoUpdate({
							target: habitLifecycleEvents.id,
							set: mutation.payload
						});
				}
				appliedMutationIds.push(mutation.id);
			}
		});
	}

	const serverVersionIso = await getServerMaxVersionIso();
	const serverTimeIso = new Date().toISOString();
	const shouldSendFullWorkspace =
		!input.knownServerVersionIso || hadRemoteUpdatesBeforePush;

	if (!shouldSendFullWorkspace) {
		return {
			ok: true,
			appliedMutationIds,
			serverVersionIso,
			appBuildVersion: appVersion,
			hasRemoteUpdates: false,
			serverTimeIso
		};
	}

	const [
		allEntriesRaw,
		allLogsRaw,
		allHabits,
		availableTags,
		allCadencePlans,
		allBooks,
		allMedia,
		allNotes,
		allCalendarEvents,
		allLifecycleEvents
	] = await Promise.all([
		db.select().from(dailyEntries).orderBy(desc(dailyEntries.dateIso)),
		db.select().from(habitLogs).orderBy(desc(habitLogs.dateIso)),
		getAllHabits(),
		getReflectionTags(),
		db.select().from(cadencePlans).orderBy(asc(cadencePlans.dateIso)),
		db.select().from(books).orderBy(desc(books.createdAtIso)),
		db.select().from(mediaLogs).orderBy(desc(mediaLogs.createdAtIso)),
		db
			.select()
			.from(notes)
			.orderBy(desc(notes.isPinned), desc(notes.updatedAtIso)),
		db.select().from(calendarEvents).orderBy(desc(calendarEvents.createdAtIso)),
		db
			.select()
			.from(habitLifecycleEvents)
			.orderBy(desc(habitLifecycleEvents.createdAtIso))
	]);

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
		habits: allHabits,
		availableTags,
		entries: mappedEntries,
		logs: mappedLogs,
		cadencePlans: allCadencePlans,
		books: allBooks,
		media: allMedia,
		notes: allNotes,
		calendarEvents: allCalendarEvents,
		lifecycleEvents: allLifecycleEvents
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
