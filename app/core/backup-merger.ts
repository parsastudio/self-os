import type {
	BookEntity,
	CadencePlanEntity,
	CalendarEventEntity,
	DatabaseBackupPayload,
	HabitEntity,
	LifecycleEventEntity,
	MediaEntity,
	NoteEntity
} from '~/domain/schemas';

export type BackupDailyEntryRow = DatabaseBackupPayload['data']['dailyEntries'][number];
export type BackupHabitLogRow = DatabaseBackupPayload['data']['habitLogs'][number];
export type BackupReflectionTagRow = DatabaseBackupPayload['data']['reflectionTags'][number];

export interface ExistingWorkspaceData {
	habits: HabitEntity[];
	dailyEntries: BackupDailyEntryRow[];
	habitLogs: BackupHabitLogRow[];
	cadencePlans: CadencePlanEntity[];
	books: BookEntity[];
	media: MediaEntity[];
	notes: NoteEntity[];
	calendarEvents: CalendarEventEntity[];
	lifecycleEvents: LifecycleEventEntity[];
	reflectionTags: BackupReflectionTagRow[];
}

export interface MergedBackupResult {
	habitsToUpsert: HabitEntity[];
	dailyEntriesToUpsert: BackupDailyEntryRow[];
	habitLogsToUpsert: BackupHabitLogRow[];
	cadencePlansToUpsert: CadencePlanEntity[];
	booksToUpsert: BookEntity[];
	mediaToUpsert: MediaEntity[];
	notesToUpsert: NoteEntity[];
	calendarEventsToUpsert: CalendarEventEntity[];
	lifecycleEventsToUpsert: LifecycleEventEntity[];
	reflectionTagsToUpsert: BackupReflectionTagRow[];
	addedOrUpdatedCount: number;
	skippedDuplicatesCount: number;
}

function normText(str: string | null | undefined): string {
	return (str ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isIncomingNewer(
	incomingIso: string | null | undefined,
	existingIso: string | null | undefined
): boolean {
	if (!incomingIso) return false;
	if (!existingIso) return true;
	return incomingIso > existingIso;
}

export function computeSmartBackupMerge(
	existing: ExistingWorkspaceData,
	incoming: DatabaseBackupPayload['data']
): MergedBackupResult {
	let skippedDuplicatesCount = 0;

	// 1. Habits deduplication (by ID or by normalized Title + TrackingMode) & ID Remapping
	const habitIdRemap = new Map<string, string>();
	const existingHabitById = new Map(existing.habits.map((h) => [h.id, h]));
	const existingHabitBySignature = new Map<string, HabitEntity>();

	for (const h of existing.habits) {
		const parentTitle = h.parentId ? existingHabitById.get(h.parentId)?.title : '';
		const sig = `${normText(h.title)}|${h.trackingMode}|${normText(parentTitle)}`;
		existingHabitBySignature.set(sig, h);
	}

	const incomingHabitById = new Map(incoming.habits.map((h) => [h.id, h]));
	const habitsToUpsert: HabitEntity[] = [];

	// First pass: map IDs
	for (const incHabit of incoming.habits) {
		const byId = existingHabitById.get(incHabit.id);
		if (byId) {
			habitIdRemap.set(incHabit.id, byId.id);
			continue;
		}
		const incParentTitle = incHabit.parentId
			? incomingHabitById.get(incHabit.parentId)?.title
			: '';
		const sig = `${normText(incHabit.title)}|${incHabit.trackingMode}|${normText(incParentTitle)}`;
		const bySig = existingHabitBySignature.get(sig);
		if (bySig) {
			habitIdRemap.set(incHabit.id, bySig.id);
		} else {
			habitIdRemap.set(incHabit.id, incHabit.id);
		}
	}

	// Second pass: decide which habits to insert/update
	for (const incHabit of incoming.habits) {
		const targetId = habitIdRemap.get(incHabit.id) ?? incHabit.id;
		const remappedParentId = incHabit.parentId
			? (habitIdRemap.get(incHabit.parentId) ?? incHabit.parentId)
			: null;

		const normalizedIncoming: HabitEntity = {
			...incHabit,
			id: targetId,
			parentId: remappedParentId
		};

		const existingMatch = existingHabitById.get(targetId);
		if (!existingMatch) {
			habitsToUpsert.push(normalizedIncoming);
			existingHabitById.set(targetId, normalizedIncoming);
		} else if (isIncomingNewer(incHabit.updatedAtIso, existingMatch.updatedAtIso)) {
			habitsToUpsert.push(normalizedIncoming);
			existingHabitById.set(targetId, normalizedIncoming);
		} else {
			skippedDuplicatesCount++;
		}
	}

	// 2. Daily Entries (Natural key: dateIso)
	const existingEntryByDate = new Map(existing.dailyEntries.map((e) => [e.dateIso, e]));
	const dailyEntriesToUpsert: BackupDailyEntryRow[] = [];

	for (const incEntry of incoming.dailyEntries) {
		const ext = existingEntryByDate.get(incEntry.dateIso);
		if (!ext) {
			dailyEntriesToUpsert.push({
				...incEntry,
				id: `entry:${incEntry.dateIso}`
			});
		} else {
			const sameContent =
				ext.dayStatus === incEntry.dayStatus &&
				normText(ext.reflectionNote) === normText(incEntry.reflectionNote) &&
				normText(ext.journalText) === normText(incEntry.journalText) &&
				ext.tagsJson === incEntry.tagsJson;

			if (sameContent || !isIncomingNewer(incEntry.updatedAtIso, ext.updatedAtIso)) {
				skippedDuplicatesCount++;
			} else {
				dailyEntriesToUpsert.push({
					...incEntry,
					id: ext.id || `entry:${incEntry.dateIso}`
				});
			}
		}
	}

	// 3. Habit Logs (Natural key: dateIso + remapped habitId)
	const existingLogByKey = new Map(
		existing.habitLogs.map((l) => [`${l.dateIso}|${l.habitId}`, l])
	);
	const habitLogsToUpsert: BackupHabitLogRow[] = [];

	for (const incLog of incoming.habitLogs) {
		const remappedHabitId = habitIdRemap.get(incLog.habitId) ?? incLog.habitId;
		const key = `${incLog.dateIso}|${remappedHabitId}`;
		const ext = existingLogByKey.get(key);

		const normalizedLog: BackupHabitLogRow = {
			...incLog,
			id: ext?.id || `log:${incLog.dateIso}:${remappedHabitId}`,
			habitId: remappedHabitId
		};

		if (!ext) {
			habitLogsToUpsert.push(normalizedLog);
			existingLogByKey.set(key, normalizedLog);
		} else {
			const isIdentical =
				ext.achievedTier === normalizedLog.achievedTier &&
				(ext.actualMinutesPerInterval ?? null) ===
					(normalizedLog.actualMinutesPerInterval ?? null) &&
				(ext.totalActualMinutes ?? null) === (normalizedLog.totalActualMinutes ?? null);

			if (isIdentical || !isIncomingNewer(normalizedLog.updatedAtIso, ext.updatedAtIso)) {
				skippedDuplicatesCount++;
			} else {
				habitLogsToUpsert.push(normalizedLog);
				existingLogByKey.set(key, normalizedLog);
			}
		}
	}

	// 4. Cadence Plans (Natural key: dateIso + remapped habitId)
	const existingPlanByKey = new Map(
		existing.cadencePlans.map((p) => [`${p.dateIso}|${p.habitId}`, p])
	);
	const cadencePlansToUpsert: CadencePlanEntity[] = [];

	for (const incPlan of incoming.cadencePlans) {
		const remappedHabitId = habitIdRemap.get(incPlan.habitId) ?? incPlan.habitId;
		const key = `${incPlan.dateIso}|${remappedHabitId}`;
		const ext = existingPlanByKey.get(key);

		const normalizedPlan: CadencePlanEntity = {
			...incPlan,
			id: ext?.id || `plan:${incPlan.dateIso}:${remappedHabitId}`,
			habitId: remappedHabitId
		};

		if (!ext) {
			cadencePlansToUpsert.push(normalizedPlan);
			existingPlanByKey.set(key, normalizedPlan);
		} else {
			const isIdentical =
				ext.plannedIntervals === normalizedPlan.plannedIntervals &&
				ext.plannedMinutesPerInterval === normalizedPlan.plannedMinutesPerInterval &&
				ext.cadenceWindowMinutes === normalizedPlan.cadenceWindowMinutes;

			if (isIdentical || !isIncomingNewer(normalizedPlan.updatedAtIso, ext.updatedAtIso)) {
				skippedDuplicatesCount++;
			} else {
				cadencePlansToUpsert.push(normalizedPlan);
				existingPlanByKey.set(key, normalizedPlan);
			}
		}
	}

	// 5. Books (Deduplicate by ID or by normalized Title + Author + FinishedAtIso)
	const existingBookById = new Map(existing.books.map((b) => [b.id, b]));
	const existingBookBySig = new Map(
		existing.books.map((b) => [
			`${normText(b.title)}|${normText(b.author)}|${b.finishedAtIso ?? ''}`,
			b
		])
	);
	const booksToUpsert: BookEntity[] = [];

	for (const incBook of incoming.books) {
		const sig = `${normText(incBook.title)}|${normText(incBook.author)}|${incBook.finishedAtIso ?? ''}`;
		const ext = existingBookById.get(incBook.id) ?? existingBookBySig.get(sig);

		if (!ext) {
			booksToUpsert.push(incBook);
			existingBookById.set(incBook.id, incBook);
			existingBookBySig.set(sig, incBook);
		} else {
			const isIdentical =
				normText(ext.title) === normText(incBook.title) &&
				normText(ext.author) === normText(incBook.author) &&
				ext.status === incBook.status &&
				ext.rating === incBook.rating &&
				normText(ext.notes) === normText(incBook.notes);

			if (isIdentical || !isIncomingNewer(incBook.updatedAtIso, ext.updatedAtIso)) {
				skippedDuplicatesCount++;
			} else {
				const mergedBook: BookEntity = { ...incBook, id: ext.id };
				booksToUpsert.push(mergedBook);
				existingBookById.set(ext.id, mergedBook);
				existingBookBySig.set(sig, mergedBook);
			}
		}
	}

	// 6. Media (Deduplicate by ID or by normalized Title + Category + FinishedAtIso)
	const existingMediaById = new Map(existing.media.map((m) => [m.id, m]));
	const existingMediaBySig = new Map(
		existing.media.map((m) => [
			`${normText(m.title)}|${m.category}|${m.finishedAtIso ?? ''}`,
			m
		])
	);
	const mediaToUpsert: MediaEntity[] = [];

	for (const incMedia of incoming.media) {
		const sig = `${normText(incMedia.title)}|${incMedia.category}|${incMedia.finishedAtIso ?? ''}`;
		const ext = existingMediaById.get(incMedia.id) ?? existingMediaBySig.get(sig);

		if (!ext) {
			mediaToUpsert.push(incMedia);
			existingMediaById.set(incMedia.id, incMedia);
			existingMediaBySig.set(sig, incMedia);
		} else {
			const isIdentical =
				normText(ext.title) === normText(incMedia.title) &&
				ext.category === incMedia.category &&
				ext.status === incMedia.status &&
				ext.rating === incMedia.rating &&
				normText(ext.notes) === normText(incMedia.notes);

			if (isIdentical || !isIncomingNewer(incMedia.updatedAtIso, ext.updatedAtIso)) {
				skippedDuplicatesCount++;
			} else {
				const mergedMedia: MediaEntity = { ...incMedia, id: ext.id };
				mediaToUpsert.push(mergedMedia);
				existingMediaById.set(ext.id, mergedMedia);
				existingMediaBySig.set(sig, mergedMedia);
			}
		}
	}

	// 7. Notes (Deduplicate by ID or by normalized Title + Content)
	const existingNoteById = new Map(existing.notes.map((n) => [n.id, n]));
	const existingNoteBySig = new Map(
		existing.notes.map((n) => [`${normText(n.title)}|${normText(n.content)}`, n])
	);
	const notesToUpsert: NoteEntity[] = [];

	for (const incNote of incoming.notes) {
		const sig = `${normText(incNote.title)}|${normText(incNote.content)}`;
		const ext = existingNoteById.get(incNote.id) ?? existingNoteBySig.get(sig);

		if (!ext) {
			notesToUpsert.push(incNote);
			existingNoteById.set(incNote.id, incNote);
			existingNoteBySig.set(sig, incNote);
		} else {
			const isIdentical =
				normText(ext.title) === normText(incNote.title) &&
				normText(ext.content) === normText(incNote.content) &&
				normText(ext.category) === normText(incNote.category) &&
				ext.isPinned === incNote.isPinned;

			if (isIdentical || !isIncomingNewer(incNote.updatedAtIso, ext.updatedAtIso)) {
				skippedDuplicatesCount++;
			} else {
				const mergedNote: NoteEntity = { ...incNote, id: ext.id };
				notesToUpsert.push(mergedNote);
				existingNoteById.set(ext.id, mergedNote);
				existingNoteBySig.set(sig, mergedNote);
			}
		}
	}

	// 8. Calendar Events (Deduplicate by ID or by Title + Annual + Date/Jalali)
	const existingEventById = new Map(existing.calendarEvents.map((e) => [e.id, e]));
	const existingEventBySig = new Map(
		existing.calendarEvents.map((e) => [
			`${normText(e.title)}|${e.isAnnual ? '1' : '0'}|${e.dateIso ?? ''}|${e.jalaliMonth}-${e.jalaliDay}`,
			e
		])
	);
	const calendarEventsToUpsert: CalendarEventEntity[] = [];

	for (const incEv of incoming.calendarEvents) {
		const sig = `${normText(incEv.title)}|${incEv.isAnnual ? '1' : '0'}|${incEv.dateIso ?? ''}|${incEv.jalaliMonth}-${incEv.jalaliDay}`;
		const ext = existingEventById.get(incEv.id) ?? existingEventBySig.get(sig);

		if (!ext) {
			calendarEventsToUpsert.push(incEv);
			existingEventById.set(incEv.id, incEv);
			existingEventBySig.set(sig, incEv);
		} else {
			const isIdentical =
				normText(ext.title) === normText(incEv.title) &&
				ext.isCompleted === incEv.isCompleted &&
				normText(ext.notes) === normText(incEv.notes);

			if (isIdentical || !isIncomingNewer(incEv.updatedAtIso, ext.updatedAtIso)) {
				skippedDuplicatesCount++;
			} else {
				const mergedEv: CalendarEventEntity = { ...incEv, id: ext.id };
				calendarEventsToUpsert.push(mergedEv);
				existingEventById.set(ext.id, mergedEv);
				existingEventBySig.set(sig, mergedEv);
			}
		}
	}

	// 9. Lifecycle Events (Deduplicate by ID or by remappedHabitId + eventType + effectiveDateIso + summary)
	const existingLcById = new Set(existing.lifecycleEvents.map((lc) => lc.id));
	const existingLcBySig = new Set(
		existing.lifecycleEvents.map(
			(lc) => `${lc.habitId ?? ''}|${lc.eventType}|${lc.effectiveDateIso}|${normText(lc.summary)}`
		)
	);
	const lifecycleEventsToUpsert: LifecycleEventEntity[] = [];

	for (const incLc of incoming.lifecycleEvents) {
		const remappedHabitId = incLc.habitId
			? (habitIdRemap.get(incLc.habitId) ?? incLc.habitId)
			: null;
		const sig = `${remappedHabitId ?? ''}|${incLc.eventType}|${incLc.effectiveDateIso}|${normText(incLc.summary)}`;

		if (existingLcById.has(incLc.id) || existingLcBySig.has(sig)) {
			skippedDuplicatesCount++;
		} else {
			const normalizedLc: LifecycleEventEntity = {
				...incLc,
				habitId: remappedHabitId
			};
			lifecycleEventsToUpsert.push(normalizedLc);
			existingLcById.add(normalizedLc.id);
			existingLcBySig.add(sig);
		}
	}

	// 10. Reflection Tags (Deduplicate by normalized label & avoid ID collisions)
	const existingTagLabels = new Set(existing.reflectionTags.map((t) => normText(t.label)));
	const usedTagIds = new Set(existing.reflectionTags.map((t) => t.id));
	const reflectionTagsToUpsert: BackupReflectionTagRow[] = [];

	for (const incTag of incoming.reflectionTags) {
		const normLabel = normText(incTag.label);
		if (existingTagLabels.has(normLabel)) {
			skippedDuplicatesCount++;
		} else {
			const safeId = usedTagIds.has(incTag.id) ? `tag:${normLabel}` : incTag.id;
			reflectionTagsToUpsert.push({
				...incTag,
				id: safeId
			});
			existingTagLabels.add(normLabel);
			usedTagIds.add(safeId);
		}
	}

	const addedOrUpdatedCount =
		habitsToUpsert.length +
		dailyEntriesToUpsert.length +
		habitLogsToUpsert.length +
		cadencePlansToUpsert.length +
		booksToUpsert.length +
		mediaToUpsert.length +
		notesToUpsert.length +
		calendarEventsToUpsert.length +
		lifecycleEventsToUpsert.length +
		reflectionTagsToUpsert.length;

	return {
		habitsToUpsert,
		dailyEntriesToUpsert,
		habitLogsToUpsert,
		cadencePlansToUpsert,
		booksToUpsert,
		mediaToUpsert,
		notesToUpsert,
		calendarEventsToUpsert,
		lifecycleEventsToUpsert,
		reflectionTagsToUpsert,
		addedOrUpdatedCount,
		skippedDuplicatesCount
	};
}
