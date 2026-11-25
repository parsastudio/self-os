import { and, asc, desc, eq, gt, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable, PgUpdateSetSource } from 'drizzle-orm/pg-core';
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
	people,
	syncState
} from '~~/server/database/schema';
import { buildConflictUpdateSet } from '~~/server/repositories/backup.repo';
import {
	clampClientTimestampIso,
	type DbExecutor,
	getAllHabits,
	saveCadencePlansForDate,
	saveDailyEntryAndLogs
} from '~~/server/repositories/daily-tracker.repo';
import { compareTimestampsIso, normalizeTimestampIso } from '~/domain/calendar';
import type {
	BookEntity,
	CalendarEventEntity,
	DeltaWorkspaceSnapshot,
	LocalWorkspaceSnapshot,
	MediaEntity,
	NoteEntity,
	PersonEntity,
	ServerSyncResponse,
	SyncEntityCollection,
	SyncRequestPayload,
	UpsertEntityMutationPayload
} from '~/domain/schemas';

const SYNC_STATE_SINGLETON_ID = 'singleton';

function stripDeletedAt<T extends { deletedAtIso: string | null }>(
	row: T
): Omit<T, 'deletedAtIso'> {
	const { deletedAtIso: _deletedAtIso, ...publicRow } = row;
	return publicRow;
}

function createStandardCollectionAdapter<
	TTable extends PgTable,
	TRow extends TTable['$inferSelect'] & {
		id: string;
		updatedAtIso: string | null;
		deletedAtIso: string | null;
	},
	TPayload extends { id: string; updatedAtIso?: string | null }
>(config: {
	table: TTable;
	idCol: PgColumn;
	updatedAtCol: PgColumn;
	deletedAtCol: PgColumn;
	toInsertRow: (payload: TPayload, effectiveIso: string) => TTable['$inferInsert'];
	toSoftDeleteSet: (iso: string) => PgUpdateSetSource<TTable>;
	selectRows: (whereClause?: SQL) => Promise<TRow[]>;
}) {
	const conflictSet = buildConflictUpdateSet(config.table, ['id']);

	return {
		async upsert(
			tx: DbExecutor,
			payload: TPayload,
			fallbackIso: string,
			referenceNowMs: number
		): Promise<void> {
			const effectiveIso = clampClientTimestampIso(
				payload.updatedAtIso ?? fallbackIso,
				referenceNowMs
			);
			const row = config.toInsertRow(payload, effectiveIso);
			await tx
				.insert(config.table)
				.values(row)
				.onConflictDoUpdate({
					target: config.idCol,
					set: conflictSet,
					setWhere: sql`${config.updatedAtCol} IS NULL OR excluded.updated_at_iso >= ${config.updatedAtCol}`
				});
		},

		async softDelete(tx: DbExecutor, entityId: string, deletedAtIso: string): Promise<void> {
			await tx
				.update(config.table)
				.set(config.toSoftDeleteSet(deletedAtIso))
				.where(
					and(
						eq(config.idCol, entityId),
						or(isNull(config.updatedAtCol), lte(config.updatedAtCol, deletedAtIso))
					)
				);
		},

		async fetchDelta(sinceIso: string): Promise<{
			upserted: Omit<TRow, 'deletedAtIso'>[];
			deletedIds: string[];
		}> {
			const rows = await config.selectRows(gt(config.updatedAtCol, sinceIso));
			const upserted: Omit<TRow, 'deletedAtIso'>[] = [];
			const deletedIds: string[] = [];

			for (const row of rows) {
				if (row.deletedAtIso !== null) {
					deletedIds.push(row.id);
				} else {
					upserted.push(stripDeletedAt(row));
				}
			}

			return { upserted, deletedIds };
		},

		async fetchActive(): Promise<Omit<TRow, 'deletedAtIso'>[]> {
			const rows = await config.selectRows(isNull(config.deletedAtCol));
			return rows.map(stripDeletedAt);
		}
	};
}

const standardAdapters = {
	books: createStandardCollectionAdapter({
		table: books,
		idCol: books.id,
		updatedAtCol: books.updatedAtIso,
		deletedAtCol: books.deletedAtIso,
		toInsertRow: (payload: BookEntity, effectiveIso: string) => ({
			...payload,
			updatedAtIso: effectiveIso,
			deletedAtIso: null
		}),
		toSoftDeleteSet: (iso: string) => ({ deletedAtIso: iso, updatedAtIso: iso }),
		selectRows: (whereClause) =>
			db.select().from(books).where(whereClause).orderBy(desc(books.createdAtIso))
	}),
	media: createStandardCollectionAdapter({
		table: mediaLogs,
		idCol: mediaLogs.id,
		updatedAtCol: mediaLogs.updatedAtIso,
		deletedAtCol: mediaLogs.deletedAtIso,
		toInsertRow: (payload: MediaEntity, effectiveIso: string) => ({
			...payload,
			updatedAtIso: effectiveIso,
			deletedAtIso: null
		}),
		toSoftDeleteSet: (iso: string) => ({ deletedAtIso: iso, updatedAtIso: iso }),
		selectRows: (whereClause) =>
			db.select().from(mediaLogs).where(whereClause).orderBy(desc(mediaLogs.createdAtIso))
	}),
	notes: createStandardCollectionAdapter({
		table: notes,
		idCol: notes.id,
		updatedAtCol: notes.updatedAtIso,
		deletedAtCol: notes.deletedAtIso,
		toInsertRow: (payload: NoteEntity, effectiveIso: string) => ({
			...payload,
			updatedAtIso: effectiveIso,
			deletedAtIso: null
		}),
		toSoftDeleteSet: (iso: string) => ({ deletedAtIso: iso, updatedAtIso: iso }),
		selectRows: (whereClause) =>
			db
				.select()
				.from(notes)
				.where(whereClause)
				.orderBy(desc(notes.isPinned), desc(notes.updatedAtIso))
	}),
	calendarEvents: createStandardCollectionAdapter({
		table: calendarEvents,
		idCol: calendarEvents.id,
		updatedAtCol: calendarEvents.updatedAtIso,
		deletedAtCol: calendarEvents.deletedAtIso,
		toInsertRow: (payload: CalendarEventEntity, effectiveIso: string) => ({
			...payload,
			updatedAtIso: effectiveIso,
			deletedAtIso: null
		}),
		toSoftDeleteSet: (iso: string) => ({ deletedAtIso: iso, updatedAtIso: iso }),
		selectRows: (whereClause) =>
			db
				.select()
				.from(calendarEvents)
				.where(whereClause)
				.orderBy(desc(calendarEvents.createdAtIso))
	}),
	people: createStandardCollectionAdapter({
		table: people,
		idCol: people.id,
		updatedAtCol: people.updatedAtIso,
		deletedAtCol: people.deletedAtIso,
		toInsertRow: (payload: PersonEntity, effectiveIso: string) => ({
			...payload,
			updatedAtIso: effectiveIso,
			deletedAtIso: null
		}),
		toSoftDeleteSet: (iso: string) => ({ deletedAtIso: iso, updatedAtIso: iso }),
		selectRows: (whereClause) =>
			db
				.select()
				.from(people)
				.where(whereClause)
				.orderBy(desc(people.isPinned), desc(people.updatedAtIso))
	})
} as const;

async function dispatchStandardUpsert(
	tx: DbExecutor,
	payload: UpsertEntityMutationPayload,
	fallbackIso: string,
	referenceNowMs: number
): Promise<void> {
	if (payload.collection === 'books') {
		await standardAdapters.books.upsert(tx, payload.record, fallbackIso, referenceNowMs);
	} else if (payload.collection === 'media') {
		await standardAdapters.media.upsert(tx, payload.record, fallbackIso, referenceNowMs);
	} else if (payload.collection === 'notes') {
		await standardAdapters.notes.upsert(tx, payload.record, fallbackIso, referenceNowMs);
	} else if (payload.collection === 'calendarEvents') {
		await standardAdapters.calendarEvents.upsert(tx, payload.record, fallbackIso, referenceNowMs);
	} else {
		await standardAdapters.people.upsert(tx, payload.record, fallbackIso, referenceNowMs);
	}
}

function mapEntryRow(e: typeof dailyEntries.$inferSelect) {
	return {
		id: e.id,
		dateIso: e.dateIso,
		dayStatus: e.dayStatus,
		journalText: e.journalText ?? null,
		updatedAtIso: e.updatedAtIso
	};
}

function mapLogRow(l: typeof habitLogs.$inferSelect) {
	return {
		id: l.id,
		dateIso: l.dateIso,
		habitId: l.habitId,
		habitTitleSnapshot: l.habitTitleSnapshot,
		achievedTier: l.achievedTier,
		achievedRuleSnapshot: l.achievedRuleSnapshot,
		habitSnapshotJson: l.habitSnapshotJson ?? null,
		actualMinutesPerInterval: l.actualMinutesPerInterval,
		plannedMinutesSnapshot: l.plannedMinutesSnapshot,
		updatedAtIso: l.updatedAtIso ?? null
	};
}

function resolveSafeIso(candidateIso?: string): string {
	return normalizeTimestampIso(candidateIso, new Date().toISOString());
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
			SELECT MAX(updated_at_iso) AS ts FROM people
			UNION ALL
			SELECT MAX(created_at_iso) AS ts FROM habit_lifecycle_events
			UNION ALL
			SELECT MAX(structural_version_iso) AS ts FROM sync_state
		) AS combined_timestamps
	`);

	return rows[0]?.max_iso || '1970-01-01T00:00:00.000Z';
}

export async function processClientSyncRequest(
	input: SyncRequestPayload
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
		const nowMs = Date.now();

		await db.transaction(async (tx) => {
			for (const mutation of sortedMutations) {
				const safeQueuedIso = clampClientTimestampIso(mutation.queuedAtIso, nowMs);

				if (mutation.kind === 'SAVE_DAILY_ENTRY') {
					await saveDailyEntryAndLogs(mutation.payload, preloadedHabitMap, tx);
				} else if (mutation.kind === 'SAVE_CADENCE_PLAN') {
					await saveCadencePlansForDate(mutation.payload, tx);
				} else if (mutation.kind === 'UPSERT_ENTITY') {
					await dispatchStandardUpsert(tx, mutation.payload, safeQueuedIso, nowMs);
				} else if (mutation.kind === 'DELETE_ENTITY') {
					const collection: SyncEntityCollection = mutation.payload.collection;
					await standardAdapters[collection].softDelete(
						tx,
						mutation.payload.entityId,
						safeQueuedIso
					);
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
			changedCadencePlansRaw,
			changedLifecycleEvents,
			booksDelta,
			mediaDelta,
			notesDelta,
			eventsDelta,
			peopleDelta
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
			db
				.select()
				.from(cadencePlans)
				.where(gt(cadencePlans.updatedAtIso, normalizedKnownIso))
				.orderBy(asc(cadencePlans.dateIso)),
			db
				.select()
				.from(habitLifecycleEvents)
				.where(gt(habitLifecycleEvents.createdAtIso, normalizedKnownIso))
				.orderBy(desc(habitLifecycleEvents.createdAtIso)),
			standardAdapters.books.fetchDelta(normalizedKnownIso),
			standardAdapters.media.fetchDelta(normalizedKnownIso),
			standardAdapters.notes.fetchDelta(normalizedKnownIso),
			standardAdapters.calendarEvents.fetchDelta(normalizedKnownIso),
			standardAdapters.people.fetchDelta(normalizedKnownIso)
		]);

		const entries: LocalWorkspaceSnapshot['entries'] = [];
		const deletedEntryDates: string[] = [];
		for (const row of changedEntriesRaw) {
			if (row.deletedAtIso !== null) {
				deletedEntryDates.push(row.dateIso);
			} else {
				entries.push(mapEntryRow(row));
			}
		}

		const logs: LocalWorkspaceSnapshot['logs'] = [];
		const deletedLogIds: string[] = [];
		for (const row of changedLogsRaw) {
			if (row.deletedAtIso !== null) {
				deletedLogIds.push(row.id);
			} else {
				logs.push(mapLogRow(row));
			}
		}

		const activeCadencePlans: LocalWorkspaceSnapshot['cadencePlans'] = [];
		const deletedPlanIds: string[] = [];
		for (const row of changedCadencePlansRaw) {
			if (row.deletedAtIso !== null) {
				deletedPlanIds.push(row.id);
			} else {
				activeCadencePlans.push(stripDeletedAt(row));
			}
		}

		const deltaWorkspace: DeltaWorkspaceSnapshot = {
			versionIso: serverVersionIso,
			syncedAtIso: serverTimeIso,
			habits: changedHabits,
			entries,
			logs,
			cadencePlans: activeCadencePlans,
			books: booksDelta.upserted,
			media: mediaDelta.upserted,
			notes: notesDelta.upserted,
			calendarEvents: eventsDelta.upserted,
			lifecycleEvents: changedLifecycleEvents,
			people: peopleDelta.upserted,
			deleted: {
				dailyEntries: deletedEntryDates,
				habitLogs: deletedLogIds,
				cadencePlans: deletedPlanIds,
				books: booksDelta.deletedIds,
				media: mediaDelta.deletedIds,
				notes: notesDelta.deletedIds,
				calendarEvents: eventsDelta.deletedIds,
				people: peopleDelta.deletedIds
			}
		};

		return {
			ok: true,
			appliedMutationIds,
			serverVersionIso,
			serverTimeIso,
			deltaWorkspace
		};
	}

	const [
		allEntriesRaw,
		allLogsRaw,
		allHabits,
		allCadencePlansRaw,
		allLifecycleEvents,
		allBooks,
		allMedia,
		allNotes,
		allCalendarEvents,
		allPeople
	] = await Promise.all([
		db
			.select()
			.from(dailyEntries)
			.where(isNull(dailyEntries.deletedAtIso))
			.orderBy(desc(dailyEntries.dateIso)),
		db
			.select()
			.from(habitLogs)
			.where(isNull(habitLogs.deletedAtIso))
			.orderBy(desc(habitLogs.dateIso)),
		getAllHabits(),
		db
			.select()
			.from(cadencePlans)
			.where(isNull(cadencePlans.deletedAtIso))
			.orderBy(asc(cadencePlans.dateIso)),
		db
			.select()
			.from(habitLifecycleEvents)
			.orderBy(desc(habitLifecycleEvents.createdAtIso)),
		standardAdapters.books.fetchActive(),
		standardAdapters.media.fetchActive(),
		standardAdapters.notes.fetchActive(),
		standardAdapters.calendarEvents.fetchActive(),
		standardAdapters.people.fetchActive()
	]);

	const fullWorkspace: LocalWorkspaceSnapshot = {
		versionIso: serverVersionIso,
		syncedAtIso: serverTimeIso,
		habits: allHabits,
		entries: allEntriesRaw.map(mapEntryRow),
		logs: allLogsRaw.map(mapLogRow),
		cadencePlans: allCadencePlansRaw.map(stripDeletedAt),
		books: allBooks,
		media: allMedia,
		notes: allNotes,
		calendarEvents: allCalendarEvents,
		lifecycleEvents: allLifecycleEvents,
		people: allPeople
	};

	return {
		ok: true,
		appliedMutationIds,
		serverVersionIso,
		serverTimeIso,
		fullWorkspace
	};
}
