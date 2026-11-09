import { compareTimestampsIso } from '~/domain/calendar';
import type {
	BackupDailyEntryRow,
	BackupHabitLogRow,
	BackupReflectionTagRow,
	BookEntity,
	CadencePlanEntity,
	CalendarEventEntity,
	DatabaseBackupPayload,
	ExistingWorkspaceData,
	HabitEntity,
	LifecycleEventEntity,
	MediaEntity,
	MergedBackupResult,
	NoteEntity
} from '~/domain/schemas';

function normText(str: string | null | undefined): string {
	return (str ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isIncomingNewer(
	incomingIso: string | null | undefined,
	existingIso: string | null | undefined
): boolean {
	if (!incomingIso) return false;
	if (!existingIso) return true;
	return compareTimestampsIso(incomingIso, existingIso) > 0;
}

function mergeCollectionBySignature<T extends { id: string; updatedAtIso?: string | null }>(params: {
	existingItems: ReadonlyArray<T>;
	incomingItems: ReadonlyArray<T>;
	getSignature: (item: T) => string;
	isIdentical: (existingItem: T, incomingItem: T) => boolean;
}): { toUpsert: T[]; skippedCount: number } {
	const existingById = new Map(params.existingItems.map((item) => [item.id, item]));
	const existingBySig = new Map(
		params.existingItems.map((item) => [params.getSignature(item), item])
	);
	const toUpsert: T[] = [];
	let skippedCount = 0;

	for (const inc of params.incomingItems) {
		const sig = params.getSignature(inc);
		const ext = existingById.get(inc.id) ?? existingBySig.get(sig);

		if (!ext) {
			toUpsert.push(inc);
			existingById.set(inc.id, inc);
			existingBySig.set(sig, inc);
		} else if (
			params.isIdentical(ext, inc) ||
			!isIncomingNewer(inc.updatedAtIso, ext.updatedAtIso)
		) {
			skippedCount++;
		} else {
			const merged: T = { ...inc, id: ext.id };
			toUpsert.push(merged);
			existingById.set(ext.id, merged);
			existingBySig.set(sig, merged);
		}
	}

	return { toUpsert, skippedCount };
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
	const booksMerge = mergeCollectionBySignature<BookEntity>({
		existingItems: existing.books,
		incomingItems: incoming.books,
		getSignature: (b) => `${normText(b.title)}|${normText(b.author)}|${b.finishedAtIso ?? ''}`,
		isIdentical: (ext, inc) =>
			normText(ext.title) === normText(inc.title) &&
			normText(ext.author) === normText(inc.author) &&
			ext.status === inc.status &&
			ext.rating === inc.rating &&
			normText(ext.notes) === normText(inc.notes)
	});
	const booksToUpsert = booksMerge.toUpsert;
	skippedDuplicatesCount += booksMerge.skippedCount;

	// 6. Media (Deduplicate by ID or by normalized Title + Category + FinishedAtIso)
	const mediaMerge = mergeCollectionBySignature<MediaEntity>({
		existingItems: existing.media,
		incomingItems: incoming.media,
		getSignature: (m) => `${normText(m.title)}|${m.category}|${m.finishedAtIso ?? ''}`,
		isIdentical: (ext, inc) =>
			normText(ext.title) === normText(inc.title) &&
			ext.category === inc.category &&
			ext.status === inc.status &&
			ext.rating === inc.rating &&
			normText(ext.notes) === normText(inc.notes)
	});
	const mediaToUpsert = mediaMerge.toUpsert;
	skippedDuplicatesCount += mediaMerge.skippedCount;

	// 7. Notes (Deduplicate by ID or by normalized Title + Content)
	const notesMerge = mergeCollectionBySignature<NoteEntity>({
		existingItems: existing.notes,
		incomingItems: incoming.notes,
		getSignature: (n) => `${normText(n.title)}|${normText(n.content)}`,
		isIdentical: (ext, inc) =>
			normText(ext.title) === normText(inc.title) &&
			normText(ext.content) === normText(inc.content) &&
			normText(ext.category) === normText(inc.category) &&
			ext.isPinned === inc.isPinned
	});
	const notesToUpsert = notesMerge.toUpsert;
	skippedDuplicatesCount += notesMerge.skippedCount;

	// 8. Calendar Events (Deduplicate by ID or by Title + Annual + Date/Jalali)
	const eventsMerge = mergeCollectionBySignature<CalendarEventEntity>({
		existingItems: existing.calendarEvents,
		incomingItems: incoming.calendarEvents,
		getSignature: (e) =>
			`${normText(e.title)}|${e.isAnnual ? '1' : '0'}|${e.dateIso ?? ''}|${e.jalaliMonth}-${e.jalaliDay}`,
		isIdentical: (ext, inc) =>
			normText(ext.title) === normText(inc.title) &&
			ext.isCompleted === inc.isCompleted &&
			normText(ext.notes) === normText(inc.notes)
	});
	const calendarEventsToUpsert = eventsMerge.toUpsert;
	skippedDuplicatesCount += eventsMerge.skippedCount;

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
