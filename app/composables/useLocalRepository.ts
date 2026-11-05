import { getAppDatabase, type LocalDailyEntryRecord, type LocalHabitLogRecord, type SyncMetaRecord } from '~/composables/useAppDatabase';
import { serializeHabitSpecSnapshot, resolveHabitRuleSnapshot } from '~/core/habit-engine';
import { getTodayIso, isoToJalaliParts, resolveCompletedRangeDates } from '~/domain/calendar';
import { DEFAULT_HABIT_CATEGORY, DEFAULT_REFLECTION_TAGS } from '~/domain/constants';
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

/**
 * Optimistic local operations repository using Dexie.js.
 * Every write operation writes instantly to indexed Dexie tables
 * and stages an atomic mutation record into `syncOutbox`.
 */
export function useLocalRepository() {
	const db = useAppDatabase();

	async function stageMutation(
		mutation: SyncOutboxMutation,
		applyLocal: () => Promise<void>
	): Promise<void> {
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
			await db.syncOutbox.put(mutation);
		});
	}

	const daily = {
		async saveDailyEntry(input: SaveDailyEntryInput): Promise<void> {
			const nowIso = input.updatedAtIso || new Date().toISOString();
			const outboxId = `daily:${input.dateIso}`;

			const isClearState =
				(!input.reflectionNote || input.reflectionNote.trim() === '') &&
				(!input.journalText || input.journalText.trim() === '') &&
				input.tags.length === 0 &&
				input.logs.every(
					(l) =>
						(l.achievedTier === null || l.achievedTier === undefined) &&
						(l.totalActualMinutes === null || l.totalActualMinutes === 0 || l.totalActualMinutes === undefined)
				);

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
					const logRecord: LocalHabitLogRecord = {
						id: `log:${input.dateIso}:${log.habitId}`,
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
					await db.cadencePlans.put({
						id: `plan:${input.targetDateIso}:${item.habitId}`,
						dateIso: input.targetDateIso,
						habitId: item.habitId,
						plannedIntervals: item.plannedIntervals,
						plannedMinutesPerInterval: item.plannedMinutesPerInterval,
						cadenceWindowMinutes: item.cadenceWindowMinutes,
						updatedAtIso: nowIso
					});

					const habit = await db.habits.get(item.habitId);
					if (
						habit &&
						(habit.defaultIntervals !== item.plannedIntervals ||
							habit.defaultMinutesPerInterval !== item.plannedMinutesPerInterval ||
							habit.cadenceWindowMinutes !== item.cadenceWindowMinutes)
					) {
						await db.habits.update(habit.id, {
							defaultIntervals: item.plannedIntervals,
							defaultMinutesPerInterval: item.plannedMinutesPerInterval,
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

			const newHabit: HabitEntity = {
				id: crypto.randomUUID(),
				parentId: input.parentId ?? null,
				title: input.title.trim(),
				category: input.category.trim() || DEFAULT_HABIT_CATEGORY,
				trackingMode: input.trackingMode,
				timeSlot: input.timeSlot ?? 'day',
				isSituational: input.isSituational ?? false,
				status: 'active',
				scheduleLabel: input.scheduleLabel?.trim() || null,
				notes: input.notes?.trim() || null,
				bronzeDesc: input.bronzeDesc?.trim() || null,
				silverDesc: input.silverDesc?.trim() || null,
				goldDesc: input.goldDesc?.trim() || null,
				emergencyMinDesc: input.emergencyMinDesc?.trim() || null,
				defaultIntervals: input.defaultIntervals,
				defaultMinutesPerInterval: input.defaultMinutesPerInterval,
				cadenceWindowMinutes: input.cadenceWindowMinutes,
				sortOrder: maxOrder + 1,
				createdAtIso: todayIso,
				updatedAtIso: nowIso
			};

			const lifecycleEvent: LifecycleEventEntity = {
				id: crypto.randomUUID(),
				habitId: newHabit.id,
				habitTitleSnapshot: newHabit.title,
				eventType: newHabit.parentId ? 'CONVERTED_TO_SUBHABIT' : 'CREATED',
				effectiveDateIso: todayIso,
				summary: newHabit.parentId
					? `ایجاد زیرطرح «${newHabit.title}»`
					: `ایجاد طرح «${newHabit.title}»`,
				reason: input.reason?.trim() || 'تعریف طرح جدید',
				previousStateJson: null,
				newStateJson: JSON.stringify(newHabit),
				createdAtIso: nowIso
			};

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

			let eventType: LifecycleEventEntity['eventType'] = 'UPDATED_RULES';
			let summary = `ویرایش شرایط طرح «${input.title}»`;

			if (current.parentId !== input.parentId) {
				if (input.parentId) {
					eventType = 'CONVERTED_TO_SUBHABIT';
					const parent = await db.habits.get(input.parentId);
					summary = `تبدیل «${input.title}» به زیرطرحِ «${parent?.title ?? 'والد'}»`;
				} else {
					eventType = 'PROMOTED_TO_ROOT';
					summary = `تبدیل «${input.title}» به طرح مستقل`;
				}
			} else if (current.status !== input.status) {
				eventType = input.status === 'archived' ? 'DELETED' : 'STATUS_CHANGED';
				summary = `تغییر وضعیت «${input.title}» به ${input.status}`;
			}

			const lifecycleEvent: LifecycleEventEntity = {
				id: crypto.randomUUID(),
				habitId: input.habitId,
				habitTitleSnapshot: input.title,
				eventType,
				effectiveDateIso: todayIso,
				summary,
				reason: input.reason,
				previousStateJson: JSON.stringify(current),
				newStateJson: JSON.stringify(input),
				createdAtIso: nowIso
			};

			const updatedHabit: HabitEntity = {
				...current,
				title: input.title.trim(),
				category: input.category.trim() || current.category,
				parentId: input.parentId,
				timeSlot: input.timeSlot ?? current.timeSlot,
				isSituational: input.isSituational,
				status: input.status,
				scheduleLabel: input.scheduleLabel?.trim() || null,
				notes: input.notes?.trim() || null,
				bronzeDesc: input.bronzeDesc?.trim() || null,
				silverDesc: input.silverDesc?.trim() || null,
				goldDesc: input.goldDesc?.trim() || null,
				emergencyMinDesc: input.emergencyMinDesc?.trim() || null,
				updatedAtIso: nowIso
			};

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
				}
			);
		}
	};

	const books = {
		async create(input: CreateBookInput): Promise<BookEntity> {
			const { startedAtIso, finishedAtIso } = resolveCompletedRangeDates({
				startedJalali: input.startedJalali,
				finishedJalali: input.finishedJalali,
				isCompleted: input.status === 'completed'
			});

			const nowIso = new Date().toISOString();
			const newBook: BookEntity = {
				id: crypto.randomUUID(),
				title: input.title.trim(),
				author: input.author?.trim() || null,
				status: input.status,
				startedAtIso,
				finishedAtIso,
				rating: input.rating,
				notes: input.notes?.trim() || null,
				createdAtIso: nowIso,
				updatedAtIso: nowIso
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
			const { startedAtIso, finishedAtIso } = resolveCompletedRangeDates({
				startedJalali: input.startedJalali,
				finishedJalali: input.finishedJalali,
				isCompleted: input.status === 'completed'
			});

			const nowIso = new Date().toISOString();
			const updated: BookEntity = {
				id: input.bookId,
				title: input.title.trim(),
				author: input.author?.trim() || null,
				status: input.status,
				startedAtIso,
				finishedAtIso,
				rating: input.rating,
				notes: input.notes?.trim() || null,
				createdAtIso: existing?.createdAtIso || nowIso,
				updatedAtIso: nowIso
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
			const { startedAtIso, finishedAtIso } = resolveCompletedRangeDates({
				startedJalali: input.startedJalali,
				finishedJalali: input.finishedJalali,
				isCompleted: input.status === 'completed'
			});

			const nowIso = new Date().toISOString();
			const newMedia: MediaEntity = {
				id: crypto.randomUUID(),
				title: input.title.trim(),
				category: input.category,
				status: input.status,
				startedAtIso,
				finishedAtIso,
				rating: input.rating,
				notes: input.notes?.trim() || null,
				createdAtIso: nowIso,
				updatedAtIso: nowIso
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
			const { startedAtIso, finishedAtIso } = resolveCompletedRangeDates({
				startedJalali: input.startedJalali,
				finishedJalali: input.finishedJalali,
				isCompleted: input.status === 'completed'
			});

			const nowIso = new Date().toISOString();
			const updated: MediaEntity = {
				id: input.mediaId,
				title: input.title.trim(),
				category: input.category,
				status: input.status,
				startedAtIso,
				finishedAtIso,
				rating: input.rating,
				notes: input.notes?.trim() || null,
				createdAtIso: existing?.createdAtIso || nowIso,
				updatedAtIso: nowIso
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

			for (const e of ws.entries) {
				if (!pendingDailyDates.has(e.dateIso)) {
					await db.dailyEntries.put({
						dateIso: e.dateIso,
						dayStatus: e.dayStatus,
						reflectionNote: e.reflectionNote,
						journalText: e.journalText ?? null,
						tags: [...e.tags],
						updatedAtIso: e.updatedAtIso
					});
				}
			}

			for (const l of ws.logs) {
				if (!pendingDailyDates.has(l.dateIso)) {
					await db.habitLogs.put({
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
		clearLocalData
	};
}
