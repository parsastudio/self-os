import { and, asc, desc, eq, gt, like, sql } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '~~/server/database/index';
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
	reflectionTags,
	syncState
} from '~~/server/database/schema';
import { getAllHabits } from '~~/server/repositories/habits.repo';
import {
	clampClientTimestampIso,
	type DbExecutor,
	getReflectionTags,
	saveCadencePlansForDate,
	saveDailyEntryAndLogs
} from '~~/server/repositories/daily-tracker.repo';
import { compareTimestampsIso, normalizeTimestampIso } from '~/domain/calendar';
import { parseTagsJson } from '~/domain/tags';
import type {
	DeltaWorkspaceSnapshot,
	LocalWorkspaceSnapshot,
	ServerSyncResponse,
	SyncRequestPayload
} from '~/domain/schemas';

const SYNC_STATE_SINGLETON_ID = 'singleton';

function resolveSafeIso(candidateIso?: string): string {
	return normalizeTimestampIso(candidateIso, new Date().toISOString()) ?? new Date().toISOString();
}

export async function bumpServerStructuralVersion(
	iso?: string,
	txExecutor?: DbExecutor
): Promise<void> {
	const effectiveIso = resolveSafeIso(iso);
	await ensureDatabaseReady();
	const executor = txExecutor ?? db;
	await executor
		.insert(syncState)
		.values({
			id: SYNC_STATE_SINGLETON_ID,
			structuralVersionIso: effectiveIso
		})
		.onConflictDoUpdate({
			target: syncState.id,
			set: {
				structuralVersionIso: sql`GREATEST(${syncState.structuralVersionIso}, excluded.structural_version_iso)`
			}
		});
}

export async function recordServerDeletionTombstones(
	tombstoneIds: string[],
	deletedAtIso: string,
	txExecutor?: DbExecutor
): Promise<void> {
	if (tombstoneIds.length === 0) return;
	const effectiveIso = resolveSafeIso(deletedAtIso);
	await ensureDatabaseReady();
	const executor = txExecutor ?? db;
	const rows = tombstoneIds.map((id) => ({
		id,
		structuralVersionIso: effectiveIso
	}));
	await executor
		.insert(syncState)
		.values(rows)
		.onConflictDoUpdate({
			target: syncState.id,
			set: {
				structuralVersionIso: sql`GREATEST(${syncState.structuralVersionIso}, excluded.structural_version_iso)`
			}
		});
}

async function getFullResetVersionIso(): Promise<string> {
	await ensureDatabaseReady();
	const rows = await db
		.select()
		.from(syncState)
		.where(eq(syncState.id, SYNC_STATE_SINGLETON_ID))
		.limit(1);
	return rows[0]?.structuralVersionIso || '1970-01-01T00:00:00.000Z';
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

	return rows[0]?.max_iso || '1970-01-01T00:00:00.000Z';
}

export async function processClientSyncRequest(
	input: SyncRequestPayload,
	appVersion = '0.0.1'
): Promise<ServerSyncResponse> {
	await ensureDatabaseReady();
	const normalizedKnownIso = normalizeTimestampIso(input.knownServerVersionIso);
	const versionBeforeMutations = await getServerMaxVersionIso();
	const hadRemoteUpdatesBeforePush = Boolean(
		normalizedKnownIso && compareTimestampsIso(versionBeforeMutations, normalizedKnownIso) > 0
	);

	const appliedMutationIds: string[] = [];

	if (input.mutations.length > 0) {
		const sortedMutations = [...input.mutations].sort((a, b) =>
			compareTimestampsIso(a.queuedAtIso, b.queuedAtIso)
		);

		const allHabitsList = await getAllHabits();
		const preloadedHabitMap = new Map(allHabitsList.map((h) => [h.id, h]));

		const existingTombstoneRows = await db
			.select()
			.from(syncState)
			.where(like(syncState.id, 'del:%'));
		const tombstoneMap = new Map(
			existingTombstoneRows.map((r) => [r.id, r.structuralVersionIso])
		);

		const isBlockedByNewerTombstone = (tombstoneKey: string, mutationIso: string): boolean => {
			const deletedAtIso = tombstoneMap.get(tombstoneKey);
			if (!deletedAtIso) return false;
			return compareTimestampsIso(deletedAtIso, mutationIso) > 0;
		};

		const nowMs = Date.now();
		await db.transaction(async (tx) => {
			for (const mutation of sortedMutations) {
				const safeQueuedIso = clampClientTimestampIso(mutation.queuedAtIso, nowMs);
				if (mutation.kind === 'SAVE_DAILY_ENTRY') {
					await saveDailyEntryAndLogs(mutation.payload, preloadedHabitMap, tx);
				} else if (mutation.kind === 'SAVE_CADENCE_PLAN') {
					await saveCadencePlansForDate(mutation.payload, preloadedHabitMap, tx);
				} else if (mutation.kind === 'UPSERT_BOOK') {
					const effectiveIso = clampClientTimestampIso(
						mutation.payload.updatedAtIso ?? safeQueuedIso,
						nowMs
					);
					const tombstoneKey = `del:book:${mutation.payload.id}`;
					if (!isBlockedByNewerTombstone(tombstoneKey, effectiveIso)) {
						const payload = {
							...mutation.payload,
							updatedAtIso: effectiveIso
						};
						await tx
							.insert(books)
							.values(payload)
							.onConflictDoUpdate({
								target: books.id,
								set: payload,
								setWhere: sql`${books.updatedAtIso} IS NULL OR excluded.updated_at_iso >= ${books.updatedAtIso}`
							});
						if (tombstoneMap.has(tombstoneKey)) {
							await tx.delete(syncState).where(eq(syncState.id, tombstoneKey));
							tombstoneMap.delete(tombstoneKey);
						}
					}
				} else if (mutation.kind === 'DELETE_BOOK') {
					const tombstoneKey = `del:book:${mutation.payload.bookId}`;
					const existingBook = await tx
						.select({ updatedAtIso: books.updatedAtIso })
						.from(books)
						.where(eq(books.id, mutation.payload.bookId))
						.limit(1);
					if (
						!existingBook[0]?.updatedAtIso ||
						compareTimestampsIso(safeQueuedIso, existingBook[0].updatedAtIso) >= 0
					) {
						await tx.delete(books).where(eq(books.id, mutation.payload.bookId));
						await recordServerDeletionTombstones([tombstoneKey], safeQueuedIso, tx);
						tombstoneMap.set(tombstoneKey, safeQueuedIso);
					}
				} else if (mutation.kind === 'UPSERT_MEDIA') {
					const effectiveIso = clampClientTimestampIso(
						mutation.payload.updatedAtIso ?? safeQueuedIso,
						nowMs
					);
					const tombstoneKey = `del:media:${mutation.payload.id}`;
					if (!isBlockedByNewerTombstone(tombstoneKey, effectiveIso)) {
						const payload = {
							...mutation.payload,
							updatedAtIso: effectiveIso
						};
						await tx
							.insert(mediaLogs)
							.values(payload)
							.onConflictDoUpdate({
								target: mediaLogs.id,
								set: payload,
								setWhere: sql`${mediaLogs.updatedAtIso} IS NULL OR excluded.updated_at_iso >= ${mediaLogs.updatedAtIso}`
							});
						if (tombstoneMap.has(tombstoneKey)) {
							await tx.delete(syncState).where(eq(syncState.id, tombstoneKey));
							tombstoneMap.delete(tombstoneKey);
						}
					}
				} else if (mutation.kind === 'DELETE_MEDIA') {
					const tombstoneKey = `del:media:${mutation.payload.mediaId}`;
					const existingMedia = await tx
						.select({ updatedAtIso: mediaLogs.updatedAtIso })
						.from(mediaLogs)
						.where(eq(mediaLogs.id, mutation.payload.mediaId))
						.limit(1);
					if (
						!existingMedia[0]?.updatedAtIso ||
						compareTimestampsIso(safeQueuedIso, existingMedia[0].updatedAtIso) >= 0
					) {
						await tx
							.delete(mediaLogs)
							.where(eq(mediaLogs.id, mutation.payload.mediaId));
						await recordServerDeletionTombstones([tombstoneKey], safeQueuedIso, tx);
						tombstoneMap.set(tombstoneKey, safeQueuedIso);
					}
				} else if (mutation.kind === 'UPSERT_NOTE') {
					const effectiveIso = clampClientTimestampIso(mutation.payload.updatedAtIso, nowMs);
					const tombstoneKey = `del:note:${mutation.payload.id}`;
					if (!isBlockedByNewerTombstone(tombstoneKey, effectiveIso)) {
						const payload = {
							...mutation.payload,
							updatedAtIso: effectiveIso
						};
						await tx
							.insert(notes)
							.values(payload)
							.onConflictDoUpdate({
								target: notes.id,
								set: payload,
								setWhere: sql`excluded.updated_at_iso >= ${notes.updatedAtIso}`
							});
						if (tombstoneMap.has(tombstoneKey)) {
							await tx.delete(syncState).where(eq(syncState.id, tombstoneKey));
							tombstoneMap.delete(tombstoneKey);
						}
					}
				} else if (mutation.kind === 'DELETE_NOTE') {
					const tombstoneKey = `del:note:${mutation.payload.noteId}`;
					const existingNote = await tx
						.select({ updatedAtIso: notes.updatedAtIso })
						.from(notes)
						.where(eq(notes.id, mutation.payload.noteId))
						.limit(1);
					if (
						!existingNote[0]?.updatedAtIso ||
						compareTimestampsIso(safeQueuedIso, existingNote[0].updatedAtIso) >= 0
					) {
						await tx.delete(notes).where(eq(notes.id, mutation.payload.noteId));
						await recordServerDeletionTombstones([tombstoneKey], safeQueuedIso, tx);
						tombstoneMap.set(tombstoneKey, safeQueuedIso);
					}
				} else if (mutation.kind === 'UPSERT_CALENDAR_EVENT') {
					const effectiveIso = clampClientTimestampIso(
						mutation.payload.updatedAtIso ?? safeQueuedIso,
						nowMs
					);
					const tombstoneKey = `del:event:${mutation.payload.id}`;
					if (!isBlockedByNewerTombstone(tombstoneKey, effectiveIso)) {
						const payload = {
							...mutation.payload,
							updatedAtIso: effectiveIso
						};
						await tx
							.insert(calendarEvents)
							.values(payload)
							.onConflictDoUpdate({
								target: calendarEvents.id,
								set: payload,
								setWhere: sql`${calendarEvents.updatedAtIso} IS NULL OR excluded.updated_at_iso >= ${calendarEvents.updatedAtIso}`
							});
						if (tombstoneMap.has(tombstoneKey)) {
							await tx.delete(syncState).where(eq(syncState.id, tombstoneKey));
							tombstoneMap.delete(tombstoneKey);
						}
					}
				} else if (mutation.kind === 'DELETE_CALENDAR_EVENT') {
					const tombstoneKey = `del:event:${mutation.payload.eventId}`;
					const existingEvent = await tx
						.select({ updatedAtIso: calendarEvents.updatedAtIso })
						.from(calendarEvents)
						.where(eq(calendarEvents.id, mutation.payload.eventId))
						.limit(1);
					if (
						!existingEvent[0]?.updatedAtIso ||
						compareTimestampsIso(safeQueuedIso, existingEvent[0].updatedAtIso) >= 0
					) {
						await tx
							.delete(calendarEvents)
							.where(eq(calendarEvents.id, mutation.payload.eventId));
						await recordServerDeletionTombstones([tombstoneKey], safeQueuedIso, tx);
						tombstoneMap.set(tombstoneKey, safeQueuedIso);
					}
				} else if (mutation.kind === 'UPSERT_HABIT') {
					const payload = {
						...mutation.payload,
						updatedAtIso: clampClientTimestampIso(
							mutation.payload.updatedAtIso ?? safeQueuedIso,
							nowMs
						)
					};
					await tx
						.insert(habits)
						.values(payload)
						.onConflictDoUpdate({
							target: habits.id,
							set: payload,
							setWhere: sql`${habits.updatedAtIso} IS NULL OR excluded.updated_at_iso >= ${habits.updatedAtIso}`
						});
					preloadedHabitMap.set(payload.id, payload);
				} else if (mutation.kind === 'ADD_LIFECYCLE_EVENT') {
					const payload = {
						...mutation.payload,
						createdAtIso: clampClientTimestampIso(mutation.payload.createdAtIso, nowMs)
					};
					await tx
						.insert(habitLifecycleEvents)
						.values(payload)
						.onConflictDoUpdate({
							target: habitLifecycleEvents.id,
							set: payload
						});
				} else if (mutation.kind === 'UPSERT_REFLECTION_TAGS') {
					if (mutation.payload.length > 0) {
						await tx
							.insert(reflectionTags)
							.values(mutation.payload)
							.onConflictDoUpdate({
								target: reflectionTags.label,
								set: {
									sortOrder: sql`excluded.sort_order`
								}
							});
						await bumpServerStructuralVersion(safeQueuedIso, tx);
					}
				}
				appliedMutationIds.push(mutation.id);
			}
		});
	}

	const serverVersionIso = await getServerMaxVersionIso();
	const serverTimeIso = new Date().toISOString();
	const shouldSendWorkspaceChanges = !normalizedKnownIso || hadRemoteUpdatesBeforePush;

	if (!shouldSendWorkspaceChanges) {
		return {
			ok: true,
			appliedMutationIds,
			serverVersionIso,
			appBuildVersion: appVersion,
			hasRemoteUpdates: false,
			serverTimeIso
		};
	}

	const fullResetVersionIso = await getFullResetVersionIso();
	const canUseDeltaSync = Boolean(
		normalizedKnownIso && compareTimestampsIso(normalizedKnownIso, fullResetVersionIso) >= 0
	);

	if (canUseDeltaSync && normalizedKnownIso) {
		const [
			changedEntriesRaw,
			changedLogsRaw,
			changedHabits,
			availableTags,
			changedCadencePlans,
			changedBooks,
			changedMedia,
			changedNotes,
			changedCalendarEvents,
			changedLifecycleEvents,
			tombstoneRows
		] = await Promise.all([
			db
				.select()
				.from(dailyEntries)
				.where(gt(dailyEntries.updatedAtIso, normalizedKnownIso))
				.orderBy(desc(dailyEntries.dateIso)),
			db
				.select()
				.from(habitLogs)
				.where(gt(habitLogs.updatedAtIso, normalizedKnownIso))
				.orderBy(desc(habitLogs.dateIso)),
			db
				.select()
				.from(habits)
				.where(gt(habits.updatedAtIso, normalizedKnownIso))
				.orderBy(asc(habits.sortOrder)),
			getReflectionTags(),
			db
				.select()
				.from(cadencePlans)
				.where(gt(cadencePlans.updatedAtIso, normalizedKnownIso))
				.orderBy(asc(cadencePlans.dateIso)),
			db
				.select()
				.from(books)
				.where(gt(books.updatedAtIso, normalizedKnownIso))
				.orderBy(desc(books.createdAtIso)),
			db
				.select()
				.from(mediaLogs)
				.where(gt(mediaLogs.updatedAtIso, normalizedKnownIso))
				.orderBy(desc(mediaLogs.createdAtIso)),
			db
				.select()
				.from(notes)
				.where(gt(notes.updatedAtIso, normalizedKnownIso))
				.orderBy(desc(notes.isPinned), desc(notes.updatedAtIso)),
			db
				.select()
				.from(calendarEvents)
				.where(gt(calendarEvents.updatedAtIso, normalizedKnownIso))
				.orderBy(desc(calendarEvents.createdAtIso)),
			db
				.select()
				.from(habitLifecycleEvents)
				.where(gt(habitLifecycleEvents.createdAtIso, normalizedKnownIso))
				.orderBy(desc(habitLifecycleEvents.createdAtIso)),
			db
				.select()
				.from(syncState)
				.where(
					and(
						like(syncState.id, 'del:%'),
						gt(syncState.structuralVersionIso, normalizedKnownIso)
					)
				)
		]);

		const deletedHabitIds: string[] = [];
		const deletedEntryDates: string[] = [];
		const deletedLogIds: string[] = [];
		const deletedPlanIds: string[] = [];
		const deletedBookIds: string[] = [];
		const deletedMediaIds: string[] = [];
		const deletedNoteIds: string[] = [];
		const deletedEventIds: string[] = [];

		for (const t of tombstoneRows) {
			if (t.id.startsWith('del:habit:')) deletedHabitIds.push(t.id.slice('del:habit:'.length));
			else if (t.id.startsWith('del:entry:')) deletedEntryDates.push(t.id.slice('del:entry:'.length));
			else if (t.id.startsWith('del:log:')) deletedLogIds.push(t.id.slice('del:log:'.length));
			else if (t.id.startsWith('del:plan:')) deletedPlanIds.push(t.id.slice('del:plan:'.length));
			else if (t.id.startsWith('del:book:')) deletedBookIds.push(t.id.slice('del:book:'.length));
			else if (t.id.startsWith('del:media:')) deletedMediaIds.push(t.id.slice('del:media:'.length));
			else if (t.id.startsWith('del:note:')) deletedNoteIds.push(t.id.slice('del:note:'.length));
			else if (t.id.startsWith('del:event:')) deletedEventIds.push(t.id.slice('del:event:'.length));
		}

		const deltaWorkspace: DeltaWorkspaceSnapshot = {
			versionIso: serverVersionIso,
			syncedAtIso: serverTimeIso,
			habits: changedHabits,
			availableTags,
			entries: changedEntriesRaw.map((e) => ({
				id: e.id,
				dateIso: e.dateIso,
				dayStatus: e.dayStatus,
				reflectionNote: e.reflectionNote,
				journalText: e.journalText ?? null,
				tags: parseTagsJson(e.tagsJson),
				updatedAtIso: e.updatedAtIso
			})),
			logs: changedLogsRaw.map((l) => ({
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
			})),
			cadencePlans: changedCadencePlans,
			books: changedBooks,
			media: changedMedia,
			notes: changedNotes,
			calendarEvents: changedCalendarEvents,
			lifecycleEvents: changedLifecycleEvents,
			deletedHabitIds,
			deletedEntryDates,
			deletedLogIds,
			deletedPlanIds,
			deletedBookIds,
			deletedMediaIds,
			deletedNoteIds,
			deletedEventIds
		};

		return {
			ok: true,
			appliedMutationIds,
			serverVersionIso,
			appBuildVersion: appVersion,
			hasRemoteUpdates: hadRemoteUpdatesBeforePush,
			serverTimeIso,
			deltaWorkspace
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
