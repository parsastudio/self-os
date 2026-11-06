import { getAppDatabase, type LocalDailyEntryRecord, type LocalHabitLogRecord, type SyncMetaRecord } from '~/composables/useAppDatabase';
import { computeSmartBackupMerge } from '~/core/backup-merger';
import {
	buildCreatedHabitWithLifecycle,
	buildUpdatedHabitWithLifecycle,
	isDailyEntryEmpty,
	resolveHabitRuleSnapshot,
	serializeHabitSpecSnapshot
} from '~/core/habit-engine';
import { getTodayIso, isoToJalaliParts, isoToJalaliSlash, resolveCompletedRangeDates } from '~/domain/calendar';
import { buildDemoSeedDataset, DEMO_ENTRY_TAG, isDemoRecordId } from '~/domain/demo-seed';
import { parseTagsJson } from '~/domain/tags';
import type {
	BookEntity,
	BookStatus,
	CalendarEventEntity,
	CreateBookInput,
	CreateCalendarEventInput,
	CreateHabitInput,
	CreateMediaInput,
	DatabaseBackupPayload,
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
function clonePlain<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

export function useLocalRepository() {
	const db = useAppDatabase();

	async function stageMutation(
		mutation: SyncOutboxMutation,
		applyLocal: () => Promise<void>
	): Promise<void> {
		const plainMutation = clonePlain(mutation);
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
			await db.syncOutbox.put(plainMutation);
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

				for (const log of input.logs) {
					const habit = habitMap.get(log.habitId);
					const logId = `log:${input.dateIso}:${log.habitId}`;

					if (
						habit?.trackingMode === 'tiered' &&
						(log.achievedTier === null || log.achievedTier === undefined)
					) {
						await db.habitLogs.delete(logId);
						continue;
					}

					const isUnscheduledAndUnloggedCadence =
						habit?.trackingMode === 'interval_cadence' &&
						(!log.plannedMinutesSnapshot || log.plannedMinutesSnapshot <= 0) &&
						(!log.actualMinutesPerInterval || log.actualMinutesPerInterval <= 0) &&
						(!log.totalActualMinutes || log.totalActualMinutes <= 0);

					if (isUnscheduledAndUnloggedCadence) {
						await db.habitLogs.delete(logId);
						continue;
					}

					const logRecord: LocalHabitLogRecord = {
						id: logId,
						dateIso: input.dateIso,
						habitId: log.habitId,
						habitTitleSnapshot: log.habitTitleSnapshot || habit?.title || null,
						achievedTier: log.achievedTier,
						achievedRuleSnapshot:
							log.achievedRuleSnapshot ||
							(habit && log.achievedTier !== null ? resolveHabitRuleSnapshot(habit, log.achievedTier) : null),
						habitSnapshotJson: habit ? serializeHabitSpecSnapshot(habit) : null,
						completedIntervals: log.completedIntervals ?? null,
						actualMinutesPerInterval: log.actualMinutesPerInterval ?? null,
						totalActualMinutes: log.totalActualMinutes ?? null,
						plannedIntervalsSnapshot: log.plannedIntervalsSnapshot ?? null,
						plannedMinutesSnapshot: log.plannedMinutesSnapshot ?? null,
						updatedAtIso: log.updatedAtIso || nowIso
					};
					await db.habitLogs.put(logRecord);
				}
			});
		},

		async saveCadencePlans(input: SaveCadencePlanBatch): Promise<void> {
			const nowIso = new Date().toISOString();
			const mutation: SyncOutboxMutation = {
				id: `cadence:${input.targetDateIso}`,
				kind: 'SAVE_CADENCE_PLAN',
				queuedAtIso: nowIso,
				payload: input
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
				{
					id: `habit:${newHabit.id}`,
					kind: 'UPSERT_HABIT',
					queuedAtIso: nowIso,
					payload: newHabit
				},
				async () => {
					await db.habits.put(newHabit);
					await db.lifecycleEvents.put(lifecycleEvent);
					await db.syncOutbox.put({
						id: `lifecycle:${lifecycleEvent.id}`,
						kind: 'ADD_LIFECYCLE_EVENT',
						queuedAtIso: nowIso,
						payload: lifecycleEvent
					});
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

			await stageMutation(
				{
					id: `habit:${input.habitId}`,
					kind: 'UPSERT_HABIT',
					queuedAtIso: nowIso,
					payload: updatedHabit
				},
				async () => {
					await db.habits.put(updatedHabit);
					await db.lifecycleEvents.put(lifecycleEvent);
					await db.syncOutbox.put({
						id: `lifecycle:${lifecycleEvent.id}`,
						kind: 'ADD_LIFECYCLE_EVENT',
						queuedAtIso: nowIso,
						payload: lifecycleEvent
					});

					if (current.status !== updatedHabit.status && !updatedHabit.parentId) {
						const children = await db.habits
							.where('parentId')
							.equals(updatedHabit.id)
							.toArray();
						for (const child of children) {
							if (child.status !== updatedHabit.status && child.status !== 'archived') {
								const cascadedChild: HabitEntity = {
									...child,
									status: updatedHabit.status,
									updatedAtIso: nowIso
								};
								await db.habits.put(cascadedChild);
								await db.syncOutbox.put({
									id: `habit:${cascadedChild.id}`,
									kind: 'UPSERT_HABIT',
									queuedAtIso: nowIso,
									payload: cascadedChild
								});
							}
						}
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
				id: params.id || crypto.randomUUID(),
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
				id: crypto.randomUUID(),
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
				id: crypto.randomUUID(),
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
		const fallback: SyncMetaRecord = {
			key: 'meta:sync',
			clientId: typeof localStorage !== 'undefined' ? (localStorage.getItem('newlife_client_id') ?? '') : '',
			knownServerVersionIso: null,
			lastSyncedAtIso: null
		};

		if (!fallback.clientId && typeof localStorage !== 'undefined') {
			fallback.clientId = crypto.randomUUID();
			try {
				localStorage.setItem('newlife_client_id', fallback.clientId);
			} catch {
				// ignore quota errors
			}
		}

		const meta = await db.syncMeta.get('meta:sync');
		return meta || fallback;
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

			// Reconcile remote deletions for collections where items can be hard-deleted
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

			// Upsert non-pending server entities
			await db.habits.bulkPut(ws.habits.filter((h) => !pendingIds.has(`habit:${h.id}`)));
			await db.cadencePlans.bulkPut(
				ws.cadencePlans.filter((c) => !pendingIds.has(`cadence:${c.dateIso}`))
			);
			await db.books.bulkPut(ws.books.filter((b) => !pendingIds.has(`book:${b.id}`)));
			await db.media.bulkPut(ws.media.filter((m) => !pendingIds.has(`media:${m.id}`)));
			await db.notes.bulkPut(ws.notes.filter((n) => !pendingIds.has(`note:${n.id}`)));
			await db.calendarEvents.bulkPut(
				ws.calendarEvents.filter((ev) => !pendingIds.has(`event:${ev.id}`))
			);
			await db.lifecycleEvents.bulkPut(ws.lifecycleEvents);

			if (ws.availableTags && ws.availableTags.length > 0) {
				const tagRecords = ws.availableTags.map((label, idx) => ({
					id: `tag-${idx + 1}`,
					label,
					sortOrder: idx + 1
				}));
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

			const entriesToPut: LocalDailyEntryRecord[] = [];
			for (const e of ws.entries) {
				if (!pendingDailyDates.has(e.dateIso)) {
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
			const logsToDelete = allLocalLogs
				.filter((l) => !serverLogIds.has(l.id) && !pendingDailyDates.has(l.dateIso))
				.map((l) => l.id);
			if (logsToDelete.length > 0) {
				await db.habitLogs.bulkDelete(logsToDelete);
			}

			const logsToPut: LocalHabitLogRecord[] = [];
			for (const l of ws.logs) {
				if (!pendingDailyDates.has(l.dateIso)) {
					logsToPut.push({
						id: l.id || `log:${l.dateIso}:${l.habitId}`,
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
		payload: DatabaseBackupPayload
	): Promise<{ addedOrUpdatedCount: number; skippedDuplicatesCount: number }> {
		const nowIso = new Date().toISOString();
		const currentSnapshot = await exportBackupPayload();
		const merged = computeSmartBackupMerge(currentSnapshot.data, payload.data);

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
			db.reflectionTags
		], async () => {
			if (merged.habitsToUpsert.length > 0) {
				await db.habits.bulkPut(merged.habitsToUpsert);
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
			if (merged.cadencePlansToUpsert.length > 0) {
				await db.cadencePlans.bulkPut(merged.cadencePlansToUpsert);
			}
			if (merged.booksToUpsert.length > 0) {
				await db.books.bulkPut(merged.booksToUpsert);
			}
			if (merged.mediaToUpsert.length > 0) {
				await db.media.bulkPut(merged.mediaToUpsert);
			}
			if (merged.notesToUpsert.length > 0) {
				await db.notes.bulkPut(merged.notesToUpsert);
			}
			if (merged.calendarEventsToUpsert.length > 0) {
				await db.calendarEvents.bulkPut(merged.calendarEventsToUpsert);
			}
			if (merged.lifecycleEventsToUpsert.length > 0) {
				await db.lifecycleEvents.bulkPut(merged.lifecycleEventsToUpsert);
			}
			if (merged.reflectionTagsToUpsert.length > 0) {
				await db.reflectionTags.bulkPut(merged.reflectionTagsToUpsert);
			}
		});

		return {
			addedOrUpdatedCount: merged.addedOrUpdatedCount,
			skippedDuplicatesCount: merged.skippedDuplicatesCount
		};
	}

	async function injectDemoSeed(): Promise<void> {
		const dataset = buildDemoSeedDataset();
		const { data } = dataset;

		await db.transaction('rw', [
			db.habits,
			db.dailyEntries,
			db.habitLogs,
			db.cadencePlans,
			db.books,
			db.media,
			db.notes,
			db.calendarEvents,
			db.lifecycleEvents
		], async () => {
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
		});
	}

	async function removeDemoSeed(): Promise<void> {
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
			db.syncOutbox
		], async () => {
			const demoHabitIds = (await db.habits.toArray())
				.filter((h) => isDemoRecordId(h.id))
				.map((h) => h.id);
			if (demoHabitIds.length > 0) await db.habits.bulkDelete(demoHabitIds);

			const demoLogIds = (await db.habitLogs.toArray())
				.filter((l) => isDemoRecordId(l.id) || isDemoRecordId(l.habitId))
				.map((l) => l.id);
			if (demoLogIds.length > 0) await db.habitLogs.bulkDelete(demoLogIds);

			const demoEntryDates = (await db.dailyEntries.toArray())
				.filter((e) => e.tags.includes(DEMO_ENTRY_TAG))
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
		});
	}

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
		exportBackupPayload,
		restoreBackupPayload,
		injectDemoSeed,
		removeDemoSeed,
		clearLocalData
	};
}
