import type { Table } from 'dexie';
import type { PersonalOSDatabase } from '~/composables/useAppDatabase';
import { computeSmartBackupMerge } from '~/core/backup-merger';
import { getTodayIso, isoToJalaliSlash } from '~/domain/calendar';
import type {
	DatabaseBackupPayload,
	SyncOutboxMutation,
	UpsertEntityMutationPayload
} from '~/domain/schemas';
import { clonePlain } from '~/utils/clone';

async function putAndStageStandardCollection<T extends { id: string }>(params: {
	outboxPrefix: string;
	table: Table<T, string>;
	items: T[];
	nowIso: string;
	stagedMutations: SyncOutboxMutation[];
	toPayload: (record: T) => UpsertEntityMutationPayload;
}): Promise<void> {
	if (params.items.length === 0) return;
	await params.table.bulkPut(params.items);
	for (const item of params.items) {
		params.stagedMutations.push({
			id: `${params.outboxPrefix}:${item.id}`,
			kind: 'UPSERT_ENTITY',
			queuedAtIso: params.nowIso,
			payload: params.toPayload(clonePlain(item))
		});
	}
}

export function createLocalBackupOperations(
	db: PersonalOSDatabase,
	notifyMutationsStaged: () => void
) {
	async function exportBackupPayload(): Promise<DatabaseBackupPayload> {
		const todayIso = getTodayIso();
		const nowIso = new Date().toISOString();

		const [
			allHabits,
			allEntries,
			allLogs,
			allCadence,
			allBooks,
			allMedia,
			allNotes,
			allEvents,
			allLifecycle,
			allPeople
		] = await Promise.all([
			db.habits.toArray(),
			db.dailyEntries.toArray(),
			db.habitLogs.toArray(),
			db.cadencePlans.toArray(),
			db.books.toArray(),
			db.media.toArray(),
			db.notes.toArray(),
			db.calendarEvents.toArray(),
			db.lifecycleEvents.toArray(),
			db.people.toArray()
		]);

		return {
			version: 1,
			appName: 'new-life',
			exportedAtIso: nowIso,
			jalaliDate: isoToJalaliSlash(todayIso),
			data: {
				habits: allHabits,
				dailyEntries: allEntries.map((e) => ({
					...e,
					id: `entry:${e.dateIso}`
				})),
				habitLogs: allLogs.map((l) => ({
					...l,
					habitTitleSnapshot: l.habitTitleSnapshot ?? null,
					achievedRuleSnapshot: l.achievedRuleSnapshot ?? null,
					habitSnapshotJson: l.habitSnapshotJson ?? null,
					actualMinutesPerInterval: l.actualMinutesPerInterval ?? null,
					plannedMinutesSnapshot: l.plannedMinutesSnapshot ?? null,
					updatedAtIso: l.updatedAtIso || nowIso
				})),
				cadencePlans: allCadence,
				books: allBooks,
				media: allMedia,
				notes: allNotes,
				calendarEvents: allEvents,
				lifecycleEvents: allLifecycle,
				people: allPeople
			}
		};
	}

	async function restoreBackupPayload(
		payload: DatabaseBackupPayload,
		options?: { mode?: 'merge' | 'replace' }
	): Promise<{ addedOrUpdatedCount: number; skippedDuplicatesCount: number }> {
		const mode = options?.mode ?? 'merge';
		const nowMs = Date.now();
		const clearIso = new Date(nowMs - 1).toISOString();
		const nowIso = new Date(nowMs).toISOString();
		const bumpIso = new Date(nowMs + 1).toISOString();
		const emptyData: DatabaseBackupPayload['data'] = {
			habits: [],
			dailyEntries: [],
			habitLogs: [],
			cadencePlans: [],
			books: [],
			media: [],
			notes: [],
			calendarEvents: [],
			lifecycleEvents: [],
			people: []
		};
		const currentSnapshot = mode === 'replace' ? { data: emptyData } : await exportBackupPayload();
		const merged = computeSmartBackupMerge(currentSnapshot.data, payload.data);

		await db.transaction(
			'rw',
			db.workspaceAndSyncTables,
			async () => {
				const stagedMutations: SyncOutboxMutation[] = [];

				if (mode === 'replace') {
					await Promise.all(db.workspaceAndSyncTables.map((t) => t.clear()));
					stagedMutations.push({
						id: 'workspace:clear',
						kind: 'CLEAR_WORKSPACE',
						queuedAtIso: clearIso,
						payload: { clearedAtIso: clearIso }
					});
				}

				if (merged.habitsToUpsert.length > 0) {
					await db.habits.bulkPut(merged.habitsToUpsert);
					for (const h of merged.habitsToUpsert) {
						stagedMutations.push({
							id: `habit:${h.id}`,
							kind: 'UPSERT_HABIT',
							queuedAtIso: nowIso,
							payload: clonePlain(h)
						});
					}
				}
				if (merged.dailyEntriesToUpsert.length > 0) {
					await db.dailyEntries.bulkPut(
						merged.dailyEntriesToUpsert.map((e) => ({
							dateIso: e.dateIso,
							dayStatus: e.dayStatus,
							journalText: e.journalText ?? null,
							updatedAtIso: e.updatedAtIso
						}))
					);
				}
				if (merged.habitLogsToUpsert.length > 0) {
					await db.habitLogs.bulkPut(
						merged.habitLogsToUpsert.map((l) => ({
							...l,
							updatedAtIso: l.updatedAtIso || nowIso
						}))
					);
				}
				if (merged.dailyEntriesToUpsert.length > 0 || merged.habitLogsToUpsert.length > 0) {
					const affectedDates = new Set<string>([
						...merged.dailyEntriesToUpsert.map((e) => e.dateIso),
						...merged.habitLogsToUpsert.map((l) => l.dateIso)
					]);
					for (const dateIso of affectedDates) {
						const entryRec = await db.dailyEntries.get(dateIso);
						const dayLogs = await db.habitLogs.where('dateIso').equals(dateIso).toArray();
						if (entryRec) {
							stagedMutations.push({
								id: `daily:${dateIso}`,
								kind: 'SAVE_DAILY_ENTRY',
								queuedAtIso: nowIso,
								payload: clonePlain({
									dateIso,
									dayStatus: entryRec.dayStatus,
									journalText: entryRec.journalText,
									updatedAtIso: entryRec.updatedAtIso,
									logs: dayLogs
								})
							});
						}
					}
				}
				if (merged.cadencePlansToUpsert.length > 0) {
					await db.cadencePlans.bulkPut(merged.cadencePlansToUpsert);
					const affectedPlanDates = new Set(
						merged.cadencePlansToUpsert.map((p) => p.dateIso)
					);
					for (const targetDateIso of affectedPlanDates) {
						const plansOnDate = await db.cadencePlans
							.where('dateIso')
							.equals(targetDateIso)
							.toArray();
						stagedMutations.push({
							id: `cadence:${targetDateIso}`,
							kind: 'SAVE_CADENCE_PLAN',
							queuedAtIso: nowIso,
							payload: clonePlain({
								targetDateIso,
								items: plansOnDate.map((p) => ({
									habitId: p.habitId,
									plannedMinutesPerInterval: p.plannedMinutesPerInterval
								}))
							})
						});
					}
				}
				await putAndStageStandardCollection({
					outboxPrefix: 'book',
					table: db.books,
					items: merged.booksToUpsert,
					nowIso,
					stagedMutations,
					toPayload: (record) => ({ collection: 'books', record })
				});
				await putAndStageStandardCollection({
					outboxPrefix: 'media',
					table: db.media,
					items: merged.mediaToUpsert,
					nowIso,
					stagedMutations,
					toPayload: (record) => ({ collection: 'media', record })
				});
				await putAndStageStandardCollection({
					outboxPrefix: 'note',
					table: db.notes,
					items: merged.notesToUpsert,
					nowIso,
					stagedMutations,
					toPayload: (record) => ({ collection: 'notes', record })
				});
				await putAndStageStandardCollection({
					outboxPrefix: 'event',
					table: db.calendarEvents,
					items: merged.calendarEventsToUpsert,
					nowIso,
					stagedMutations,
					toPayload: (record) => ({ collection: 'calendarEvents', record })
				});
				if (merged.lifecycleEventsToUpsert.length > 0) {
					await db.lifecycleEvents.bulkPut(merged.lifecycleEventsToUpsert);
					for (const lc of merged.lifecycleEventsToUpsert) {
						stagedMutations.push({
							id: `lifecycle:${lc.id}`,
							kind: 'ADD_LIFECYCLE_EVENT',
							queuedAtIso: nowIso,
							payload: clonePlain(lc)
						});
					}
				}
				await putAndStageStandardCollection({
					outboxPrefix: 'person',
					table: db.people,
					items: merged.peopleToUpsert,
					nowIso,
					stagedMutations,
					toPayload: (record) => ({ collection: 'people', record })
				});
				if (mode === 'merge' && merged.addedOrUpdatedCount > 0) {
					stagedMutations.push({
						id: 'workspace:bump',
						kind: 'BUMP_STRUCTURAL_VERSION',
						queuedAtIso: bumpIso,
						payload: { versionIso: bumpIso }
					});
				}

				if (stagedMutations.length > 0) {
					await db.syncOutbox.bulkPut(stagedMutations);
				}
			}
		);

		notifyMutationsStaged();

		return {
			addedOrUpdatedCount: merged.addedOrUpdatedCount,
			skippedDuplicatesCount: merged.skippedDuplicatesCount
		};
	}

	return {
		exportBackupPayload,
		restoreBackupPayload
	};
}
