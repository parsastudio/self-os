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
			[
				db.habits,
				db.dailyEntries,
				db.habitLogs,
				db.cadencePlans,
				db.books,
				db.media,
				db.notes,
				db.calendarEvents,
				db.lifecycleEvents,
				db.reflectionTags,
				db.syncOutbox
			],
			async () => {
				if (mode === 'replace') {
					await db.habits.clear();
					await db.dailyEntries.clear();
					await db.habitLogs.clear();
					await db.cadencePlans.clear();
					await db.books.clear();
					await db.media.clear();
					await db.notes.clear();
					await db.calendarEvents.clear();
					await db.lifecycleEvents.clear();
					await db.reflectionTags.clear();
					await db.syncOutbox.clear();
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
			[
				db.habits,
				db.dailyEntries,
				db.habitLogs,
				db.cadencePlans,
				db.books,
				db.media,
				db.notes,
				db.calendarEvents,
				db.lifecycleEvents
			],
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
		await db.transaction(
			'rw',
			[
				db.habits,
				db.dailyEntries,
				db.habitLogs,
				db.cadencePlans,
				db.books,
				db.media,
				db.notes,
				db.calendarEvents,
				db.lifecycleEvents,
				db.syncOutbox
			],
			async () => {
				const demoHabitIds = (await db.habits.toArray())
					.filter((h) => isDemoRecordId(h.id))
					.map((h) => h.id);
				if (demoHabitIds.length > 0) await db.habits.bulkDelete(demoHabitIds);

				const demoLogIds = (await db.habitLogs.toArray())
					.filter((l) => isDemoRecordId(l.id) || isDemoRecordId(l.habitId))
					.map((l) => l.id);
				if (demoLogIds.length > 0) await db.habitLogs.bulkDelete(demoLogIds);

				const demoEntryDates = (await db.dailyEntries.toArray())
					.filter(
						(e) =>
							e.tags.includes(DEMO_ENTRY_TAG) ||
							e.reflectionNote === 'ثبت آزمایشی جهت بررسی نمودارها'
					)
					.map((e) => e.dateIso);
				if (demoEntryDates.length > 0) await db.dailyEntries.bulkDelete(demoEntryDates);

				const demoPlanIds = (await db.cadencePlans.toArray())
					.filter((p) => isDemoRecordId(p.id) || isDemoRecordId(p.habitId))
					.map((p) => p.id);
				if (demoPlanIds.length > 0) await db.cadencePlans.bulkDelete(demoPlanIds);

				const demoBookIds = (await db.books.toArray())
					.filter((b) => isDemoRecordId(b.id))
					.map((b) => b.id);
				if (demoBookIds.length > 0) await db.books.bulkDelete(demoBookIds);

				const demoMediaIds = (await db.media.toArray())
					.filter((m) => isDemoRecordId(m.id))
					.map((m) => m.id);
				if (demoMediaIds.length > 0) await db.media.bulkDelete(demoMediaIds);

				const demoNoteIds = (await db.notes.toArray())
					.filter((n) => isDemoRecordId(n.id))
					.map((n) => n.id);
				if (demoNoteIds.length > 0) await db.notes.bulkDelete(demoNoteIds);

				const demoEventIds = (await db.calendarEvents.toArray())
					.filter((ev) => isDemoRecordId(ev.id))
					.map((ev) => ev.id);
				if (demoEventIds.length > 0) await db.calendarEvents.bulkDelete(demoEventIds);

				const demoLifecycleIds = (await db.lifecycleEvents.toArray())
					.filter((lc) => isDemoRecordId(lc.id) || isDemoRecordId(lc.habitId))
					.map((lc) => lc.id);
				if (demoLifecycleIds.length > 0) await db.lifecycleEvents.bulkDelete(demoLifecycleIds);

				const demoOutboxIds = (await db.syncOutbox.toArray())
					.filter((m) => m.id.includes('demo:'))
					.map((m) => m.id);
				if (demoOutboxIds.length > 0) await db.syncOutbox.bulkDelete(demoOutboxIds);
			}
		);
	}

	return {
		exportBackupPayload,
		restoreBackupPayload,
		injectDemoSeed,
		removeDemoSeed
	};
}
