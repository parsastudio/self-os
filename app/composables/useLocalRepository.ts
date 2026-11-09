import { type LocalDailyEntryRecord, type LocalHabitLogRecord, type SyncMetaRecord, useAppDatabase } from '~/composables/useAppDatabase';
import { createLocalBackupOperations } from '~/composables/useLocalBackupOperations';
import { clonePlain } from '~/utils/clone';
import {
	buildCreatedHabitWithLifecycle,
	buildUpdatedHabitWithLifecycle,
	isDailyEntryEmpty,
	resolveDailyHabitLogSnapshot,
	shouldDiscardHabitLogItem
} from '~/core/habit-engine';
import {
	generateId,
	getTodayIso,
	isoToJalaliParts,
	resolveCompletedRangeDates
} from '~/domain/calendar';
import type {
	BookEntity,
	BookStatus,
	CalendarEventEntity,
	CreateBookInput,
	CreateCalendarEventInput,
	CreateHabitInput,
	CreateMediaInput,
	HabitEntity,
	LifecycleEventEntity,
	LocalWorkspaceSnapshot,
	MediaEntity,
	MediaStatus,
	MutateHabitStructureInput,
	NoteEntity,
	SaveCadencePlanBatch,
	SaveDailyEntryInput,
	SyncOutboxMutation,
	UpdateBookInput,
	UpdateMediaInput,
	UpsertNoteInput
} from '~/domain/schemas';

const mutationStagedListeners = new Set<() => void>();

export function onLocalMutationStaged(listener: () => void): () => void {
	mutationStagedListeners.add(listener);
	return () => {
		mutationStagedListeners.delete(listener);
	};
}

/**
 * Optimistic local operations repository using Dexie.js.
 * Every write operation writes instantly to indexed Dexie tables
 * and stages an atomic mutation record into `syncOutbox`.
 */
export function useLocalRepository() {
	const db = useAppDatabase();

	async function stageMutation(
		mutations: SyncOutboxMutation | SyncOutboxMutation[],
		applyLocal: () => Promise<void>
	): Promise<void> {
		const mutationList = Array.isArray(mutations) ? mutations : [mutations];
		const plainMutations = mutationList.map((m) => clonePlain(m));
		await db.transaction('rw', [
			db.syncOutbox,
			db.habits,
			db.dailyEntries,
			db.habitLogs,
			db.cadencePlans,
			db.books,
			db.media,
			db.notes,
			db.calendarEvents,
			db.lifecycleEvents,
			db.reflectionTags
		], async () => {
			await applyLocal();
			if (plainMutations.length > 0) {
				await db.syncOutbox.bulkPut(plainMutations);
			}
		});

		for (const listener of mutationStagedListeners) {
			listener();
		}
	}

	const daily = {
		async saveDailyEntry(input: SaveDailyEntryInput): Promise<void> {
			const nowIso = input.updatedAtIso || new Date().toISOString();
			const outboxId = `daily:${input.dateIso}`;

			const isClearState = isDailyEntryEmpty(input);

			const mutation: SyncOutboxMutation = {
				id: outboxId,
				kind: 'SAVE_DAILY_ENTRY',
				queuedAtIso: nowIso,
				payload: {
					...input,
					updatedAtIso: nowIso
				}
			};

			await stageMutation(mutation, async () => {
				if (isClearState) {
					await db.dailyEntries.delete(input.dateIso);
					await db.habitLogs.where('dateIso').equals(input.dateIso).delete();
					return;
				}

				const entryRecord: LocalDailyEntryRecord = {
					dateIso: input.dateIso,
					dayStatus: input.dayStatus,
					reflectionNote: input.reflectionNote,
					journalText: input.journalText?.trim() || null,
					tags: [...input.tags],
					updatedAtIso: nowIso
				};
				await db.dailyEntries.put(entryRecord);

				const allHabits = await db.habits.toArray();
				const habitMap = new Map(allHabits.map((h) => [h.id, h]));
				const existingDayLogs = await db.habitLogs.where('dateIso').equals(input.dateIso).toArray();
				const existingLogByHabitId = new Map(existingDayLogs.map((l) => [l.habitId, l]));
				const incomingHabitIds = new Set(input.logs.map((l) => l.habitId));

				for (const existingLog of existingDayLogs) {
					if (!incomingHabitIds.has(existingLog.habitId)) {
						await db.habitLogs.delete(existingLog.id);
					}
				}

				for (const log of input.logs) {
					const habit = habitMap.get(log.habitId);
					const prev = existingLogByHabitId.get(log.habitId);
					const logId = prev?.id || `log:${input.dateIso}:${log.habitId}`;

					if (shouldDiscardHabitLogItem(habit, log)) {
						await db.habitLogs.delete(logId);
						continue;
					}

					const resolvedSnapshot = resolveDailyHabitLogSnapshot({
						habit,
						log,
						previousLog: prev
							? {
									achievedTier: prev.achievedTier,
									habitTitleSnapshot: prev.habitTitleSnapshot ?? null,
									achievedRuleSnapshot: prev.achievedRuleSnapshot ?? null,
									habitSnapshotJson: prev.habitSnapshotJson ?? null,
									plannedIntervalsSnapshot: prev.plannedIntervalsSnapshot ?? null,
									plannedMinutesSnapshot: prev.plannedMinutesSnapshot ?? null
								}
							: null,
						fallbackUpdatedAtIso: nowIso
					});

					const logRecord: LocalHabitLogRecord = {
						id: logId,
						dateIso: input.dateIso,
						habitId: log.habitId,
						...resolvedSnapshot
					};
					await db.habitLogs.put(logRecord);
				}
			});
		},

		async saveCadencePlans(input: SaveCadencePlanBatch): Promise<void> {
			const nowIso = input.updatedAtIso || new Date().toISOString();
			const payloadWithTimestamp: SaveCadencePlanBatch = {
				...input,
				updatedAtIso: nowIso,
				items: input.items.map((item) => ({
					...item,
					updatedAtIso: item.updatedAtIso || nowIso
				}))
			};
			const mutation: SyncOutboxMutation = {
				id: `cadence:${input.targetDateIso}`,
				kind: 'SAVE_CADENCE_PLAN',
				queuedAtIso: nowIso,
				payload: payloadWithTimestamp
			};

			await stageMutation(mutation, async () => {
				for (const item of input.items) {
					const planId = `plan:${input.targetDateIso}:${item.habitId}`;
					if (item.plannedMinutesPerInterval <= 0) {
						await db.cadencePlans.delete(planId);
					} else {
						await db.cadencePlans.put({
							id: planId,
							dateIso: input.targetDateIso,
							habitId: item.habitId,
							plannedIntervals: item.plannedIntervals,
							plannedMinutesPerInterval: item.plannedMinutesPerInterval,
							cadenceWindowMinutes: item.cadenceWindowMinutes,
							updatedAtIso: nowIso
						});
					}
				}
			});
		}
	};

	const habits = {
		async create(input: CreateHabitInput): Promise<HabitEntity> {
			const todayIso = getTodayIso();
			const nowIso = new Date().toISOString();
			const existingHabits = await db.habits.toArray();
			const maxOrder = existingHabits.reduce((max, h) => Math.max(max, h.sortOrder), 0);

			const { habit: newHabit, lifecycleEvent } = buildCreatedHabitWithLifecycle({
				input,
				maxSortOrder: maxOrder,
				todayIso,
				nowIso
			});

			await stageMutation(
				[
					{
						id: `habit:${newHabit.id}`,
						kind: 'UPSERT_HABIT',
						queuedAtIso: nowIso,
						payload: newHabit
					},
					{
						id: `lifecycle:${lifecycleEvent.id}`,
						kind: 'ADD_LIFECYCLE_EVENT',
						queuedAtIso: nowIso,
						payload: lifecycleEvent
					}
				],
				async () => {
					await db.habits.put(newHabit);
					await db.lifecycleEvents.put(lifecycleEvent);
				}
			);

			return newHabit;
		},

		async update(input: MutateHabitStructureInput): Promise<void> {
			const current = await db.habits.get(input.habitId);
			if (!current) throw new Error('طرح مورد نظر یافت نشد');

			const todayIso = getTodayIso();
			const nowIso = new Date().toISOString();
			const parent = input.parentId ? await db.habits.get(input.parentId) : undefined;

			const { updatedHabit, lifecycleEvent } = buildUpdatedHabitWithLifecycle({
				current,
				input,
				parentTitle: parent?.title ?? null,
				todayIso,
				nowIso
			});

			const cascadedChildren: HabitEntity[] = [];
			const cascadedLifecycleEvents: LifecycleEventEntity[] = [];
			if (current.status !== updatedHabit.status && !updatedHabit.parentId) {
				const children = await db.habits
					.where('parentId')
					.equals(updatedHabit.id)
					.toArray();
				for (const child of children) {
					if (child.status !== updatedHabit.status && child.status !== 'archived') {
						const { updatedHabit: nextChild, lifecycleEvent: childLc } =
							buildUpdatedHabitWithLifecycle({
								current: child,
								input: {
									habitId: child.id,
									title: child.title,
									category: child.category,
									parentId: child.parentId,
									timeSlot: child.timeSlot,
									isSituational: child.isSituational,
									status: updatedHabit.status,
									scheduleLabel: child.scheduleLabel,
									notes: child.notes,
									bronzeDesc: child.bronzeDesc,
									silverDesc: child.silverDesc,
									goldDesc: child.goldDesc,
									emergencyMinDesc: child.emergencyMinDesc,
									defaultMinutesPerInterval: child.defaultMinutesPerInterval,
									reason: input.reason
								},
								parentTitle: updatedHabit.title,
								todayIso,
								nowIso
							});
						cascadedChildren.push(nextChild);
						cascadedLifecycleEvents.push(childLc);
					}
				}
			}

			await stageMutation(
				[
					{
						id: `habit:${input.habitId}`,
						kind: 'UPSERT_HABIT',
						queuedAtIso: nowIso,
						payload: updatedHabit
					},
					{
						id: `lifecycle:${lifecycleEvent.id}`,
						kind: 'ADD_LIFECYCLE_EVENT',
						queuedAtIso: nowIso,
						payload: lifecycleEvent
					},
					...cascadedChildren.map(
						(cascadedChild): SyncOutboxMutation => ({
							id: `habit:${cascadedChild.id}`,
							kind: 'UPSERT_HABIT',
							queuedAtIso: nowIso,
							payload: cascadedChild
						})
					),
					...cascadedLifecycleEvents.map(
						(childLc): SyncOutboxMutation => ({
							id: `lifecycle:${childLc.id}`,
							kind: 'ADD_LIFECYCLE_EVENT',
							queuedAtIso: nowIso,
							payload: childLc
						})
					)
				],
				async () => {
					await db.habits.put(updatedHabit);
					await db.lifecycleEvents.put(lifecycleEvent);
					if (cascadedChildren.length > 0) {
						await db.habits.bulkPut(cascadedChildren);
					}
					if (cascadedLifecycleEvents.length > 0) {
						await db.lifecycleEvents.bulkPut(cascadedLifecycleEvents);
					}
				}
			);
		}
	};

	function buildTrackedItemMeta(params: {
		id?: string;
		title: string;
		startedJalali?: string;
		finishedJalali?: string;
		isCompleted: boolean;
		rating: number | null;
		notes?: string;
		existingCreatedAtIso?: string;
	}) {
		const { startedAtIso, finishedAtIso } = resolveCompletedRangeDates({
			startedJalali: params.startedJalali,
			finishedJalali: params.finishedJalali,
			isCompleted: params.isCompleted
		});
		const nowIso = new Date().toISOString();
		return {
			nowIso,
			base: {
				id: params.id || generateId(),
				title: params.title.trim(),
				startedAtIso,
				finishedAtIso,
				rating: params.rating,
				notes: params.notes?.trim() || null,
				createdAtIso: params.existingCreatedAtIso || nowIso,
				updatedAtIso: nowIso
			}
		};
	}

	const books = {
		async create(input: CreateBookInput): Promise<BookEntity> {
			const { nowIso, base } = buildTrackedItemMeta({
				title: input.title,
				startedJalali: input.startedJalali,
				finishedJalali: input.finishedJalali,
				isCompleted: input.status === 'completed',
				rating: input.rating,
				notes: input.notes
			});
			const newBook: BookEntity = {
				...base,
				author: input.author?.trim() || null,
				status: input.status
			};

			await stageMutation(
				{
					id: `book:${newBook.id}`,
					kind: 'UPSERT_BOOK',
					queuedAtIso: nowIso,
					payload: newBook
				},
				async () => {
					await db.books.put(newBook);
				}
			);

			return newBook;
		},

		async update(input: UpdateBookInput): Promise<void> {
			const existing = await db.books.get(input.bookId);
			const { nowIso, base } = buildTrackedItemMeta({
				id: input.bookId,
				title: input.title,
				startedJalali: input.startedJalali,
				finishedJalali: input.finishedJalali,
				isCompleted: input.status === 'completed',
				rating: input.rating,
				notes: input.notes,
				existingCreatedAtIso: existing?.createdAtIso
			});
			const updated: BookEntity = {
				...base,
				author: input.author?.trim() || null,
				status: input.status
			};

			await stageMutation(
				{
					id: `book:${input.bookId}`,
					kind: 'UPSERT_BOOK',
					queuedAtIso: nowIso,
					payload: updated
				},
				async () => {
					await db.books.put(updated);
				}
			);
		},

		async updateStatus(bookId: string, status: BookStatus): Promise<void> {
			const book = await db.books.get(bookId);
			if (!book) return;

			const nowIso = new Date().toISOString();
			const finishedAtIso = status === 'completed' ? getTodayIso() : null;
			const updated: BookEntity = {
				...book,
				status,
				finishedAtIso,
				updatedAtIso: nowIso
			};

			await stageMutation(
				{
					id: `book:${bookId}`,
					kind: 'UPSERT_BOOK',
					queuedAtIso: nowIso,
					payload: updated
				},
				async () => {
					await db.books.put(updated);
				}
			);
		},

		async delete(bookId: string): Promise<void> {
			const nowIso = new Date().toISOString();
			await stageMutation(
				{
					id: `book:${bookId}`,
					kind: 'DELETE_BOOK',
					queuedAtIso: nowIso,
					payload: { bookId }
				},
				async () => {
					await db.books.delete(bookId);
				}
			);
		}
	};

	const media = {
		async create(input: CreateMediaInput): Promise<MediaEntity> {
			const { nowIso, base } = buildTrackedItemMeta({
				title: input.title,
				startedJalali: input.startedJalali,
				finishedJalali: input.finishedJalali,
				isCompleted: input.status === 'completed',
				rating: input.rating,
				notes: input.notes
			});
			const newMedia: MediaEntity = {
				...base,
				category: input.category,
				status: input.status
			};

			await stageMutation(
				{
					id: `media:${newMedia.id}`,
					kind: 'UPSERT_MEDIA',
					queuedAtIso: nowIso,
					payload: newMedia
				},
				async () => {
					await db.media.put(newMedia);
				}
			);

			return newMedia;
		},

		async update(input: UpdateMediaInput): Promise<void> {
			const existing = await db.media.get(input.mediaId);
			const { nowIso, base } = buildTrackedItemMeta({
				id: input.mediaId,
				title: input.title,
				startedJalali: input.startedJalali,
				finishedJalali: input.finishedJalali,
				isCompleted: input.status === 'completed',
				rating: input.rating,
				notes: input.notes,
				existingCreatedAtIso: existing?.createdAtIso
			});
			const updated: MediaEntity = {
				...base,
				category: input.category,
				status: input.status
			};

			await stageMutation(
				{
					id: `media:${input.mediaId}`,
					kind: 'UPSERT_MEDIA',
					queuedAtIso: nowIso,
					payload: updated
				},
				async () => {
					await db.media.put(updated);
				}
			);
		},

		async updateStatus(mediaId: string, status: MediaStatus): Promise<void> {
			const m = await db.media.get(mediaId);
			if (!m) return;

			const nowIso = new Date().toISOString();
			const finishedAtIso = status === 'completed' ? getTodayIso() : null;
			const updated: MediaEntity = {
				...m,
				status,
				finishedAtIso,
				updatedAtIso: nowIso
			};

			await stageMutation(
				{
					id: `media:${mediaId}`,
					kind: 'UPSERT_MEDIA',
					queuedAtIso: nowIso,
					payload: updated
				},
				async () => {
					await db.media.put(updated);
				}
			);
		},

		async delete(mediaId: string): Promise<void> {
			const nowIso = new Date().toISOString();
			await stageMutation(
				{
					id: `media:${mediaId}`,
					kind: 'DELETE_MEDIA',
					queuedAtIso: nowIso,
					payload: { mediaId }
				},
				async () => {
					await db.media.delete(mediaId);
				}
			);
		}
	};

	const notes = {
		async create(input: UpsertNoteInput): Promise<NoteEntity> {
			const nowIso = new Date().toISOString();
			const newNote: NoteEntity = {
				id: generateId(),
				title: input.title.trim(),
				content: input.content.trim(),
				category: input.category.trim() || 'عمومی',
				isPinned: false,
				createdAtIso: nowIso,
				updatedAtIso: nowIso
			};

			await stageMutation(
				{
					id: `note:${newNote.id}`,
					kind: 'UPSERT_NOTE',
					queuedAtIso: nowIso,
					payload: newNote
				},
				async () => {
					await db.notes.put(newNote);
				}
			);

			return newNote;
		},

		async update(noteId: string, input: UpsertNoteInput): Promise<void> {
			const note = await db.notes.get(noteId);
			if (!note) return;

			const nowIso = new Date().toISOString();
			const updated: NoteEntity = {
				...note,
				title: input.title.trim(),
				content: input.content.trim(),
				category: input.category.trim() || 'عمومی',
				updatedAtIso: nowIso
			};

			await stageMutation(
				{
					id: `note:${noteId}`,
					kind: 'UPSERT_NOTE',
					queuedAtIso: nowIso,
					payload: updated
				},
				async () => {
					await db.notes.put(updated);
				}
			);
		},

		async togglePin(noteId: string, isPinned: boolean): Promise<void> {
			const note = await db.notes.get(noteId);
			if (!note) return;

			const nowIso = new Date().toISOString();
			const updated: NoteEntity = {
				...note,
				isPinned,
				updatedAtIso: nowIso
			};

			await stageMutation(
				{
					id: `note:${noteId}`,
					kind: 'UPSERT_NOTE',
					queuedAtIso: nowIso,
					payload: updated
				},
				async () => {
					await db.notes.put(updated);
				}
			);
		},

		async delete(noteId: string): Promise<void> {
			const nowIso = new Date().toISOString();
			await stageMutation(
				{
					id: `note:${noteId}`,
					kind: 'DELETE_NOTE',
					queuedAtIso: nowIso,
					payload: { noteId }
				},
				async () => {
					await db.notes.delete(noteId);
				}
			);
		}
	};

	const calendar = {
		async create(input: CreateCalendarEventInput): Promise<CalendarEventEntity> {
			const parts = isoToJalaliParts(input.dateIso);
			const isAnnual = Boolean(input.isAnnual);
			const nowIso = new Date().toISOString();

			const newEvent: CalendarEventEntity = {
				id: generateId(),
				title: input.title.trim(),
				eventType: input.eventType,
				isAnnual,
				dateIso: isAnnual ? null : input.dateIso,
				jalaliMonth: parts.jm,
				jalaliDay: parts.jd,
				isCompleted: false,
				notes: input.notes?.trim() || null,
				createdAtIso: nowIso,
				updatedAtIso: nowIso
			};

			await stageMutation(
				{
					id: `event:${newEvent.id}`,
					kind: 'UPSERT_CALENDAR_EVENT',
					queuedAtIso: nowIso,
					payload: newEvent
				},
				async () => {
					await db.calendarEvents.put(newEvent);
				}
			);

			return newEvent;
		},

		async toggleComplete(eventId: string, isCompleted: boolean): Promise<void> {
			const ev = await db.calendarEvents.get(eventId);
			if (!ev) return;

			const nowIso = new Date().toISOString();
			const updated: CalendarEventEntity = {
				...ev,
				isCompleted,
				updatedAtIso: nowIso
			};

			await stageMutation(
				{
					id: `event:${eventId}`,
					kind: 'UPSERT_CALENDAR_EVENT',
					queuedAtIso: nowIso,
					payload: updated
				},
				async () => {
					await db.calendarEvents.put(updated);
				}
			);
		},

		async delete(eventId: string): Promise<void> {
			const nowIso = new Date().toISOString();
			await stageMutation(
				{
					id: `event:${eventId}`,
					kind: 'DELETE_CALENDAR_EVENT',
					queuedAtIso: nowIso,
					payload: { eventId }
				},
				async () => {
					await db.calendarEvents.delete(eventId);
				}
			);
		}
	};

	async function getSyncMeta(): Promise<SyncMetaRecord> {
		const existing = await db.syncMeta.get('meta:sync');
		if (existing && existing.clientId) {
			return existing;
		}

		const initialized: SyncMetaRecord = {
			key: 'meta:sync',
			clientId: existing?.clientId || generateId(),
			knownServerVersionIso: existing?.knownServerVersionIso ?? null,
			lastSyncedAtIso: existing?.lastSyncedAtIso ?? null
		};
		await db.syncMeta.put(initialized);
		return initialized;
	}

	async function saveSyncMeta(meta: SyncMetaRecord): Promise<void> {
		await db.syncMeta.put(meta);
	}

	async function getPendingMutations(): Promise<SyncOutboxMutation[]> {
		return db.syncOutbox.orderBy('queuedAtIso').toArray();
	}

	async function removeAppliedMutations(applied: Array<{ id: string; queuedAtIso: string }>): Promise<void> {
		await db.transaction('rw', db.syncOutbox, async () => {
			for (const item of applied) {
				const existing = await db.syncOutbox.get(item.id);
				if (existing && existing.queuedAtIso <= item.queuedAtIso) {
					await db.syncOutbox.delete(item.id);
				}
			}
		});
	}

	async function applyServerWorkspace(ws: LocalWorkspaceSnapshot): Promise<void> {
		await db.transaction('rw', [
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
		], async () => {
			const pending = await db.syncOutbox.toArray();
			const pendingIds = new Set(pending.map((m) => m.id));
			const pendingDailyDates = new Set(
				pending
					.filter((m) => m.kind === 'SAVE_DAILY_ENTRY')
					.map((m) => m.payload.dateIso)
			);
			const pendingCadenceDates = new Set(
				pending
					.filter((m) => m.kind === 'SAVE_CADENCE_PLAN')
					.map((m) => m.payload.targetDateIso)
			);

			// Reconcile remote deletions for all collections (respecting staged local mutations)
			const serverHabitIds = new Set(ws.habits.map((h) => h.id));
			const localHabitIds = await db.habits.toCollection().primaryKeys();
			const habitsToDelete = localHabitIds.filter(
				(id) => !serverHabitIds.has(id) && !pendingIds.has(`habit:${id}`)
			);
			if (habitsToDelete.length > 0) await db.habits.bulkDelete(habitsToDelete);

			const serverLifecycleIds = new Set(ws.lifecycleEvents.map((lc) => lc.id));
			const localLifecycleIds = await db.lifecycleEvents.toCollection().primaryKeys();
			const lifecyclesToDelete = localLifecycleIds.filter(
				(id) => !serverLifecycleIds.has(id) && !pendingIds.has(`lifecycle:${id}`)
			);
			if (lifecyclesToDelete.length > 0) await db.lifecycleEvents.bulkDelete(lifecyclesToDelete);

			const serverBookIds = new Set(ws.books.map((b) => b.id));
			const localBookIds = await db.books.toCollection().primaryKeys();
			const booksToDelete = localBookIds.filter(
				(id) => !serverBookIds.has(id) && !pendingIds.has(`book:${id}`)
			);
			if (booksToDelete.length > 0) await db.books.bulkDelete(booksToDelete);

			const serverMediaIds = new Set(ws.media.map((m) => m.id));
			const localMediaIds = await db.media.toCollection().primaryKeys();
			const mediaToDelete = localMediaIds.filter(
				(id) => !serverMediaIds.has(id) && !pendingIds.has(`media:${id}`)
			);
			if (mediaToDelete.length > 0) await db.media.bulkDelete(mediaToDelete);

			const serverNoteIds = new Set(ws.notes.map((n) => n.id));
			const localNoteIds = await db.notes.toCollection().primaryKeys();
			const notesToDelete = localNoteIds.filter(
				(id) => !serverNoteIds.has(id) && !pendingIds.has(`note:${id}`)
			);
			if (notesToDelete.length > 0) await db.notes.bulkDelete(notesToDelete);

			const serverEventIds = new Set(ws.calendarEvents.map((ev) => ev.id));
			const localEventIds = await db.calendarEvents.toCollection().primaryKeys();
			const eventsToDelete = localEventIds.filter(
				(id) => !serverEventIds.has(id) && !pendingIds.has(`event:${id}`)
			);
			if (eventsToDelete.length > 0) await db.calendarEvents.bulkDelete(eventsToDelete);

			const serverPlanIds = new Set(ws.cadencePlans.map((c) => c.id));
			const allLocalPlans = await db.cadencePlans.toArray();
			const plansToDelete = allLocalPlans
				.filter((p) => !serverPlanIds.has(p.id) && !pendingCadenceDates.has(p.dateIso))
				.map((p) => p.id);
			if (plansToDelete.length > 0) await db.cadencePlans.bulkDelete(plansToDelete);

			const isServerRecordNewerOrEqual = (
				serverIso: string | null | undefined,
				localIso: string | null | undefined
			): boolean => {
				if (!localIso) return true;
				if (!serverIso) return false;
				return serverIso >= localIso;
			};

			const localHabitMap = new Map((await db.habits.toArray()).map((h) => [h.id, h]));
			await db.habits.bulkPut(
				ws.habits.filter(
					(h) =>
						!pendingIds.has(`habit:${h.id}`) &&
						isServerRecordNewerOrEqual(h.updatedAtIso, localHabitMap.get(h.id)?.updatedAtIso)
				)
			);

			const localPlanMap = new Map(allLocalPlans.map((p) => [p.id, p]));
			await db.cadencePlans.bulkPut(
				ws.cadencePlans.filter(
					(c) =>
						!pendingIds.has(`cadence:${c.dateIso}`) &&
						!pendingCadenceDates.has(c.dateIso) &&
						isServerRecordNewerOrEqual(c.updatedAtIso, localPlanMap.get(c.id)?.updatedAtIso)
				)
			);

			const localBookMap = new Map((await db.books.toArray()).map((b) => [b.id, b]));
			await db.books.bulkPut(
				ws.books.filter(
					(b) =>
						!pendingIds.has(`book:${b.id}`) &&
						isServerRecordNewerOrEqual(b.updatedAtIso, localBookMap.get(b.id)?.updatedAtIso)
				)
			);

			const localMediaMap = new Map((await db.media.toArray()).map((m) => [m.id, m]));
			await db.media.bulkPut(
				ws.media.filter(
					(m) =>
						!pendingIds.has(`media:${m.id}`) &&
						isServerRecordNewerOrEqual(m.updatedAtIso, localMediaMap.get(m.id)?.updatedAtIso)
				)
			);

			const localNoteMap = new Map((await db.notes.toArray()).map((n) => [n.id, n]));
			await db.notes.bulkPut(
				ws.notes.filter(
					(n) =>
						!pendingIds.has(`note:${n.id}`) &&
						isServerRecordNewerOrEqual(n.updatedAtIso, localNoteMap.get(n.id)?.updatedAtIso)
				)
			);

			const localEventMap = new Map((await db.calendarEvents.toArray()).map((ev) => [ev.id, ev]));
			await db.calendarEvents.bulkPut(
				ws.calendarEvents.filter(
					(ev) =>
						!pendingIds.has(`event:${ev.id}`) &&
						isServerRecordNewerOrEqual(ev.updatedAtIso, localEventMap.get(ev.id)?.updatedAtIso)
				)
			);
			await db.lifecycleEvents.bulkPut(
				ws.lifecycleEvents.filter((lc) => !pendingIds.has(`lifecycle:${lc.id}`))
			);

			if (ws.availableTags && ws.availableTags.length > 0) {
				const existingTags = await db.reflectionTags.toArray();
				const existingByLabel = new Map(existingTags.map((t) => [t.label, t]));
				const uniqueLabels = Array.from(new Set(ws.availableTags));
				const tagRecords = uniqueLabels.map((label, idx) => {
					const matched = existingByLabel.get(label);
					return {
						id: matched?.id ?? `tag:${label}`,
						label,
						sortOrder: idx + 1
					};
				});
				await db.reflectionTags.clear();
				await db.reflectionTags.bulkPut(tagRecords);
			}

			// Reconcile cleared daily entries and logs
			const serverEntryDates = new Set(ws.entries.map((e) => e.dateIso));
			const localEntryDates = await db.dailyEntries.toCollection().primaryKeys();
			const entriesToDelete = localEntryDates.filter(
				(dateIso) => !serverEntryDates.has(dateIso) && !pendingDailyDates.has(dateIso)
			);
			if (entriesToDelete.length > 0) {
				await db.dailyEntries.bulkDelete(entriesToDelete);
			}

			const localEntryMap = new Map(
				(await db.dailyEntries.toArray()).map((e) => [e.dateIso, e])
			);
			const entriesToPut: LocalDailyEntryRecord[] = [];
			for (const e of ws.entries) {
				const localEntry = localEntryMap.get(e.dateIso);
				if (
					!pendingDailyDates.has(e.dateIso) &&
					isServerRecordNewerOrEqual(e.updatedAtIso, localEntry?.updatedAtIso)
				) {
					entriesToPut.push({
						dateIso: e.dateIso,
						dayStatus: e.dayStatus,
						reflectionNote: e.reflectionNote,
						journalText: e.journalText ?? null,
						tags: [...e.tags],
						updatedAtIso: e.updatedAtIso
					});
				}
			}
			if (entriesToPut.length > 0) {
				await db.dailyEntries.bulkPut(entriesToPut);
			}

			const serverLogIds = new Set(ws.logs.map((l) => l.id || `log:${l.dateIso}:${l.habitId}`));
			const allLocalLogs = await db.habitLogs.toArray();
			const localLogMap = new Map(allLocalLogs.map((l) => [l.id, l]));
			const logsToDelete = allLocalLogs
				.filter((l) => !serverLogIds.has(l.id) && !pendingDailyDates.has(l.dateIso))
				.map((l) => l.id);
			if (logsToDelete.length > 0) {
				await db.habitLogs.bulkDelete(logsToDelete);
			}

			const logsToPut: LocalHabitLogRecord[] = [];
			for (const l of ws.logs) {
				const logId = l.id || `log:${l.dateIso}:${l.habitId}`;
				const localLog = localLogMap.get(logId);
				if (
					!pendingDailyDates.has(l.dateIso) &&
					isServerRecordNewerOrEqual(l.updatedAtIso, localLog?.updatedAtIso)
				) {
					logsToPut.push({
						id: logId,
						dateIso: l.dateIso,
						habitId: l.habitId,
						habitTitleSnapshot: l.habitTitleSnapshot ?? null,
						achievedTier: l.achievedTier,
						achievedRuleSnapshot: l.achievedRuleSnapshot ?? null,
						habitSnapshotJson: l.habitSnapshotJson ?? null,
						completedIntervals: l.completedIntervals ?? null,
						actualMinutesPerInterval: l.actualMinutesPerInterval ?? null,
						totalActualMinutes: l.totalActualMinutes ?? null,
						plannedIntervalsSnapshot: l.plannedIntervalsSnapshot ?? null,
						plannedMinutesSnapshot: l.plannedMinutesSnapshot ?? null,
						updatedAtIso: l.updatedAtIso || new Date().toISOString()
					});
				}
			}
			if (logsToPut.length > 0) {
				await db.habitLogs.bulkPut(logsToPut);
			}
		});
	}

	async function clearLocalData(): Promise<void> {
		await db.transaction('rw', [
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
			db.syncOutbox,
			db.syncMeta
		], async () => {
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
			await db.syncMeta.clear();
		});
	}

	const backupOps = createLocalBackupOperations(db, () => {
		for (const listener of mutationStagedListeners) {
			listener();
		}
	});

	return {
		daily,
		habits,
		books,
		media,
		notes,
		calendar,
		getSyncMeta,
		saveSyncMeta,
		getPendingMutations,
		removeAppliedMutations,
		applyServerWorkspace,
		exportBackupPayload: backupOps.exportBackupPayload,
		restoreBackupPayload: backupOps.restoreBackupPayload,
		injectDemoSeed: backupOps.injectDemoSeed,
		removeDemoSeed: backupOps.removeDemoSeed,
		clearLocalData
	};
}
