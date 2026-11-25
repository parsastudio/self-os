import type { PersonalOSDatabase } from '~/composables/useAppDatabase';
import { computeSmartBackupMerge } from '~/core/backup-merger';
import { getTodayIso, isoToJalaliSlash } from '~/domain/calendar';
import type { DatabaseBackupPayload, SyncOutboxMutation } from '~/domain/schemas';
import { clonePlain } from '~/utils/clone';

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
		options?: { mode?: 'merge' | 'replace'; skipOutboxStaging?: boolean }
	): Promise<{ addedOrUpdatedCount: number; skippedDuplicatesCount: number }> {
		const mode = options?.mode ?? 'merge';
		const skipOutboxStaging = Boolean(options?.skipOutboxStaging);
		const nowIso = new Date().toISOString();
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
				if (mode === 'replace') {
					await Promise.all(db.workspaceAndSyncTables.map((t) => t.clear()));
				}

				const stagedMutations: SyncOutboxMutation[] = [];

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
				if (merged.booksToUpsert.length > 0) {
					await db.books.bulkPut(merged.booksToUpsert);
					for (const b of merged.booksToUpsert) {
						stagedMutations.push({
							id: `book:${b.id}`,
							kind: 'UPSERT_BOOK',
							queuedAtIso: nowIso,
							payload: clonePlain(b)
						});
					}
				}
				if (merged.mediaToUpsert.length > 0) {
					await db.media.bulkPut(merged.mediaToUpsert);
					for (const m of merged.mediaToUpsert) {
						stagedMutations.push({
							id: `media:${m.id}`,
							kind: 'UPSERT_MEDIA',
							queuedAtIso: nowIso,
							payload: clonePlain(m)
						});
					}
				}
				if (merged.notesToUpsert.length > 0) {
					await db.notes.bulkPut(merged.notesToUpsert);
					for (const n of merged.notesToUpsert) {
						stagedMutations.push({
							id: `note:${n.id}`,
							kind: 'UPSERT_NOTE',
							queuedAtIso: nowIso,
							payload: clonePlain(n)
						});
					}
				}
				if (merged.calendarEventsToUpsert.length > 0) {
					await db.calendarEvents.bulkPut(merged.calendarEventsToUpsert);
					for (const ev of merged.calendarEventsToUpsert) {
						stagedMutations.push({
							id: `event:${ev.id}`,
							kind: 'UPSERT_CALENDAR_EVENT',
							queuedAtIso: nowIso,
							payload: clonePlain(ev)
						});
					}
				}
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
				if (merged.peopleToUpsert.length > 0) {
					await db.people.bulkPut(merged.peopleToUpsert);
					for (const person of merged.peopleToUpsert) {
						stagedMutations.push({
							id: `person:${person.id}`,
							kind: 'UPSERT_PERSON',
							queuedAtIso: nowIso,
							payload: clonePlain(person)
						});
					}
				}
				if (!skipOutboxStaging && stagedMutations.length > 0) {
					await db.syncOutbox.bulkPut(stagedMutations);
				}
			}
		);

		if (!skipOutboxStaging) {
			notifyMutationsStaged();
		}

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
