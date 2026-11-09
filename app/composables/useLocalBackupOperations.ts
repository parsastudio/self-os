import type { Table } from 'dexie';
import type { PersonalOSDatabase } from '~/composables/useAppDatabase';
import { computeSmartBackupMerge } from '~/core/backup-merger';
import { buildDemoSeedDataset } from '~/core/demo-seed';
import { getTodayIso, isoToJalaliSlash } from '~/domain/calendar';
import { DEMO_ENTRY_TAG, isDemoRecordId } from '~/domain/constants';
import type { DatabaseBackupPayload, SyncOutboxMutation } from '~/domain/schemas';
import { parseTagsJson } from '~/domain/tags';
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
			allTags
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
			db.reflectionTags.toArray()
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
					id: `entry:${e.dateIso}`,
					tagsJson: JSON.stringify(e.tags)
				})),
				habitLogs: allLogs.map((l) => ({
					...l,
					habitTitleSnapshot: l.habitTitleSnapshot ?? null,
					achievedRuleSnapshot: l.achievedRuleSnapshot ?? null,
					habitSnapshotJson: l.habitSnapshotJson ?? null,
					totalActualMinutes: l.totalActualMinutes ?? null,
					completedIntervals: l.completedIntervals ?? null,
					actualMinutesPerInterval: l.actualMinutesPerInterval ?? null,
					plannedIntervalsSnapshot: l.plannedIntervalsSnapshot ?? null,
					plannedMinutesSnapshot: l.plannedMinutesSnapshot ?? null,
					updatedAtIso: l.updatedAtIso || nowIso
				})),
				cadencePlans: allCadence,
				books: allBooks,
				media: allMedia,
				notes: allNotes,
				calendarEvents: allEvents,
				lifecycleEvents: allLifecycle,
				reflectionTags: allTags.map((t) => ({
					id: t.id,
					label: t.label,
					sortOrder: t.sortOrder
				}))
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
			reflectionTags: []
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
							reflectionNote: e.reflectionNote,
							journalText: e.journalText ?? null,
							tags: parseTagsJson(e.tagsJson),
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
									reflectionNote: entryRec.reflectionNote,
									journalText: entryRec.journalText,
									tags: entryRec.tags,
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
									plannedIntervals: p.plannedIntervals,
									plannedMinutesPerInterval: p.plannedMinutesPerInterval,
									cadenceWindowMinutes: p.cadenceWindowMinutes
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
				if (merged.reflectionTagsToUpsert.length > 0) {
					await db.reflectionTags.bulkPut(merged.reflectionTagsToUpsert);
					stagedMutations.push({
						id: 'tags:batch',
						kind: 'UPSERT_REFLECTION_TAGS',
						queuedAtIso: nowIso,
						payload: clonePlain(merged.reflectionTagsToUpsert)
					});
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

	async function injectDemoSeed(): Promise<void> {
		const dataset = buildDemoSeedDataset();
		const { data } = dataset;

		await db.transaction(
			'rw',
			db.workspaceTables,
			async () => {
				await db.habits.bulkPut(data.habits);
				await db.cadencePlans.bulkPut(data.cadencePlans);
				await db.books.bulkPut(data.books);
				await db.media.bulkPut(data.media);
				await db.notes.bulkPut(data.notes);
				await db.calendarEvents.bulkPut(data.calendarEvents);
				await db.lifecycleEvents.bulkPut(data.lifecycleEvents);

				for (const e of data.dailyEntries) {
					const existing = await db.dailyEntries.get(e.dateIso);
					if (!existing || existing.tags.includes(DEMO_ENTRY_TAG)) {
						await db.dailyEntries.put({
							dateIso: e.dateIso,
							dayStatus: e.dayStatus,
							reflectionNote: e.reflectionNote,
							journalText: e.journalText ?? null,
							tags: parseTagsJson(e.tagsJson),
							updatedAtIso: e.updatedAtIso
						});
					}
				}

				await db.habitLogs.bulkPut(
					data.habitLogs.map((l) => ({
						...l,
						updatedAtIso: l.updatedAtIso || dataset.exportedAtIso
					}))
				);
			}
		);
	}

	async function removeDemoSeed(): Promise<void> {
		const deleteMatchingById = async <T extends { id: string }>(
			table: Table<T, string>,
			predicate: (row: T) => boolean = (row) => isDemoRecordId(row.id)
		) => {
			const rows = await table.toArray();
			const keys = rows.filter(predicate).map((r) => r.id);
			if (keys.length > 0) await table.bulkDelete(keys);
		};

		await db.transaction('rw', db.workspaceAndSyncTables, async () => {
			await deleteMatchingById(db.habits);
			await deleteMatchingById(
				db.habitLogs,
				(l) => isDemoRecordId(l.id) || isDemoRecordId(l.habitId)
			);
			await deleteMatchingById(
				db.cadencePlans,
				(p) => isDemoRecordId(p.id) || isDemoRecordId(p.habitId)
			);
			await deleteMatchingById(db.books);
			await deleteMatchingById(db.media);
			await deleteMatchingById(db.notes);
			await deleteMatchingById(db.calendarEvents);
			await deleteMatchingById(
				db.lifecycleEvents,
				(lc) => isDemoRecordId(lc.id) || isDemoRecordId(lc.habitId)
			);
			await deleteMatchingById(db.syncOutbox, (m) => m.id.includes('demo:'));

			const demoEntryDates = (await db.dailyEntries.toArray())
				.filter(
					(e) =>
						e.tags.includes(DEMO_ENTRY_TAG) ||
						e.reflectionNote === 'ثبت آزمایشی جهت بررسی نمودارها'
				)
				.map((e) => e.dateIso);
			if (demoEntryDates.length > 0) await db.dailyEntries.bulkDelete(demoEntryDates);
		});
	}

	return {
		exportBackupPayload,
		restoreBackupPayload,
		injectDemoSeed,
		removeDemoSeed
	};
}
