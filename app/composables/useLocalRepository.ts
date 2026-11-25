import type { Table } from 'dexie';
import { useAppDatabase } from '~/composables/useAppDatabase';
import { createLocalBackupOperations } from '~/composables/useLocalBackupOperations';
import { clonePlain } from '~/utils/clone';
import {
	buildCreatedHabitWithLifecycle,
	buildUpdatedHabitWithLifecycle
} from '~/core/habit-engine';
import {
	compareTimestampsIso,
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
	DayStatusColor,
	DeltaWorkspaceSnapshot,
	HabitEntity,
	LifecycleEventEntity,
	LocalDailyEntryRecord,
	LocalHabitLogRecord,
	LocalWorkspaceSnapshot,
	MediaEntity,
	MediaStatus,
	MutateHabitStructureInput,
	NoteEntity,
	PersonEntity,
	SaveCadencePlanBatch,
	SyncEntityCollection,
	SyncMetaRecord,
	SyncOutboxMutation,
	UpdateBookInput,
	UpdateCalendarEventInput,
	UpdateMediaInput,
	UpsertEntityMutationPayload,
	UpsertNoteInput,
	UpsertPersonInput
} from '~/domain/schemas';

interface SyncApplyContext {
	pendingIds: Set<string>;
	pendingEntryDates: Set<string>;
	pendingFullDayDates: Set<string>;
	pendingLogIds: Set<string>;
	pendingCadenceDates: Set<string>;
	fallbackNowIso: string;
}

function isServerRecordNewerOrEqual(
	serverIso: string | null | undefined,
	localIso: string | null | undefined
): boolean {
	if (!localIso) return true;
	if (!serverIso) return false;
	return compareTimestampsIso(serverIso, localIso) >= 0;
}

function createTableSyncRunner<TLocal, TIncoming>(config: {
	table: Table<TLocal, string>;
	getLocalKey: (row: TLocal) => string;
	getIncomingKey: (row: TIncoming) => string;
	getIncomingUpdatedAt: (row: TIncoming) => string | null | undefined;
	getLocalUpdatedAt: (row: TLocal) => string | null | undefined;
	isProtectedLocal: (row: TLocal, ctx: SyncApplyContext) => boolean;
	isProtectedIncoming: (row: TIncoming, ctx: SyncApplyContext) => boolean;
	toLocalRecord: (row: TIncoming, fallbackNowIso: string) => TLocal;
}) {
	return {
		async applyFull(incomingRows: ReadonlyArray<TIncoming>, ctx: SyncApplyContext): Promise<void> {
			const localRows = await config.table.toArray();
			const localByKey = new Map(localRows.map((r) => [config.getLocalKey(r), r]));
			const serverKeys = new Set(incomingRows.map(config.getIncomingKey));

			const keysToDelete = localRows
				.filter((r) => !serverKeys.has(config.getLocalKey(r)) && !config.isProtectedLocal(r, ctx))
				.map(config.getLocalKey);
			if (keysToDelete.length > 0) {
				await config.table.bulkDelete(keysToDelete);
			}

			const rowsToPut = incomingRows
				.filter((r) => {
					if (config.isProtectedIncoming(r, ctx)) return false;
					const existing = localByKey.get(config.getIncomingKey(r));
					return isServerRecordNewerOrEqual(
						config.getIncomingUpdatedAt(r),
						existing ? config.getLocalUpdatedAt(existing) : undefined
					);
				})
				.map((r) => config.toLocalRecord(r, ctx.fallbackNowIso));

			if (rowsToPut.length > 0) {
				await config.table.bulkPut(rowsToPut);
			}
		},

		async applyDelta(
			incomingRows: ReadonlyArray<TIncoming>,
			deletedKeys: ReadonlyArray<string>,
			ctx: SyncApplyContext
		): Promise<void> {
			if (incomingRows.length === 0 && deletedKeys.length === 0) return;
			const localRows = await config.table.toArray();
			const localByKey = new Map(localRows.map((r) => [config.getLocalKey(r), r]));

			if (deletedKeys.length > 0) {
				const safeDeleteKeys = deletedKeys.filter((key) => {
					const existing = localByKey.get(key);
					return !existing || !config.isProtectedLocal(existing, ctx);
				});
				if (safeDeleteKeys.length > 0) {
					await config.table.bulkDelete(safeDeleteKeys);
				}
			}

			if (incomingRows.length > 0) {
				const rowsToPut = incomingRows
					.filter((r) => {
						if (config.isProtectedIncoming(r, ctx)) return false;
						const existing = localByKey.get(config.getIncomingKey(r));
						return isServerRecordNewerOrEqual(
							config.getIncomingUpdatedAt(r),
							existing ? config.getLocalUpdatedAt(existing) : undefined
						);
					})
					.map((r) => config.toLocalRecord(r, ctx.fallbackNowIso));

				if (rowsToPut.length > 0) {
					await config.table.bulkPut(rowsToPut);
				}
			}
		}
	};
}

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
		await db.transaction('rw', db.workspaceAndSyncTables, async () => {
			await applyLocal();
			if (plainMutations.length > 0) {
				await db.syncOutbox.bulkPut(plainMutations);
			}
		});

		for (const listener of mutationStagedListeners) {
			listener();
		}
	}

	async function upsertStandardEntity<T extends { id: string }>(params: {
		outboxPrefix: string;
		table: Table<T, string>;
		record: T;
		queuedAtIso: string;
		toPayload: (record: T) => UpsertEntityMutationPayload;
	}): Promise<T> {
		const plainRecord = clonePlain(params.record);
		await stageMutation(
			{
				id: `${params.outboxPrefix}:${plainRecord.id}`,
				kind: 'UPSERT_ENTITY',
				queuedAtIso: params.queuedAtIso,
				payload: params.toPayload(plainRecord)
			},
			async () => {
				await params.table.put(plainRecord);
			}
		);
		return plainRecord;
	}

	async function deleteStandardEntity<T extends { id: string }>(params: {
		collection: SyncEntityCollection;
		outboxPrefix: string;
		table: Table<T, string>;
		entityId: string;
	}): Promise<void> {
		const nowIso = new Date().toISOString();
		await stageMutation(
			{
				id: `${params.outboxPrefix}:${params.entityId}`,
				kind: 'DELETE_ENTITY',
				queuedAtIso: nowIso,
				payload: {
					collection: params.collection,
					entityId: params.entityId
				}
			},
			async () => {
				await params.table.delete(params.entityId);
			}
		);
	}

	const daily = {
		async applyHabitLogChanges(params: {
			dateIso: string;
			dayStatus: DayStatusColor;
			journalText?: string | null;
			hasJournal: boolean;
			upserts: LocalHabitLogRecord[];
			deleteHabitIds: string[];
			updatedAtIso?: string;
		}): Promise<void> {
			const nowIso = params.updatedAtIso || new Date().toISOString();
			const mutations: SyncOutboxMutation[] = [];
			const hasExplicitJournal = params.journalText !== undefined;
			const normalizedExplicitJournal = params.journalText?.trim() ? params.journalText : null;

			await db.transaction('rw', db.workspaceAndSyncTables, async () => {
				if (params.deleteHabitIds.length > 0) {
					const existingLogs = await db.habitLogs
						.where('dateIso')
						.equals(params.dateIso)
						.toArray();
					const existingByHabit = new Map(existingLogs.map((l) => [l.habitId, l]));

					for (const habitId of params.deleteHabitIds) {
						const prev = existingByHabit.get(habitId);
						const logId = prev?.id ?? `log:${params.dateIso}:${habitId}`;
						if (prev) {
							await db.habitLogs.delete(prev.id);
						}
						mutations.push({
							id: `log:${params.dateIso}:${habitId}`,
							kind: 'DELETE_HABIT_LOG',
							queuedAtIso: nowIso,
							payload: {
								logId,
								dateIso: params.dateIso,
								habitId,
								updatedAtIso: nowIso
							}
						});
					}
				}

				if (params.upserts.length > 0) {
					const plainUpserts = params.upserts.map((u) => clonePlain(u));
					await db.habitLogs.bulkPut(plainUpserts);
					for (const u of plainUpserts) {
						mutations.push({
							id: `log:${params.dateIso}:${u.habitId}`,
							kind: 'UPSERT_HABIT_LOG',
							queuedAtIso: u.updatedAtIso || nowIso,
							payload: u
						});
					}
				}

				const remainingLogsCount = await db.habitLogs
					.where('dateIso')
					.equals(params.dateIso)
					.count();

				if (remainingLogsCount === 0 && !params.hasJournal) {
					await db.dailyEntries.delete(params.dateIso);
					await db.syncOutbox.delete(`entry:${params.dateIso}`);
					mutations.push({
						id: `clear-entry:${params.dateIso}`,
						kind: 'CLEAR_DAILY_ENTRY',
						queuedAtIso: nowIso,
						payload: {
							dateIso: params.dateIso,
							updatedAtIso: nowIso
						}
					});
				} else {
					const existingEntry = await db.dailyEntries.get(params.dateIso);
					const existingOutbox = await db.syncOutbox.get(`entry:${params.dateIso}`);
					const nextJournalText = hasExplicitJournal
						? normalizedExplicitJournal
						: (existingEntry?.journalText ?? null);

					await db.dailyEntries.put({
						dateIso: params.dateIso,
						dayStatus: params.dayStatus,
						journalText: nextJournalText,
						updatedAtIso: nowIso
					});

					const stagedJournalText = hasExplicitJournal
						? normalizedExplicitJournal
						: existingOutbox?.kind === 'UPSERT_DAILY_ENTRY'
							? existingOutbox.payload.journalText
							: undefined;

					mutations.push({
						id: `entry:${params.dateIso}`,
						kind: 'UPSERT_DAILY_ENTRY',
						queuedAtIso: nowIso,
						payload: {
							dateIso: params.dateIso,
							dayStatus: params.dayStatus,
							...(stagedJournalText !== undefined ? { journalText: stagedJournalText } : {}),
							updatedAtIso: nowIso
						}
					});
				}

				if (mutations.length > 0) {
					await db.syncOutbox.bulkPut(mutations.map((m) => clonePlain(m)));
				}
			});

			for (const listener of mutationStagedListeners) {
				listener();
			}
		},

		async saveJournalEntry(params: {
			dateIso: string;
			dayStatus: DayStatusColor;
			journalText: string | null;
			updatedAtIso?: string;
		}): Promise<void> {
			const nowIso = params.updatedAtIso || new Date().toISOString();
			const normalizedJournal = params.journalText?.trim() ? params.journalText : null;

			await db.transaction('rw', db.workspaceAndSyncTables, async () => {
				const logsCount = await db.habitLogs
					.where('dateIso')
					.equals(params.dateIso)
					.count();

				if (normalizedJournal === null && logsCount === 0) {
					await db.dailyEntries.delete(params.dateIso);
					await db.syncOutbox.delete(`entry:${params.dateIso}`);
					await db.syncOutbox.put({
						id: `clear-entry:${params.dateIso}`,
						kind: 'CLEAR_DAILY_ENTRY',
						queuedAtIso: nowIso,
						payload: {
							dateIso: params.dateIso,
							updatedAtIso: nowIso
						}
					});
					return;
				}

				await db.dailyEntries.put({
					dateIso: params.dateIso,
					dayStatus: params.dayStatus,
					journalText: normalizedJournal,
					updatedAtIso: nowIso
				});

				await db.syncOutbox.put({
					id: `entry:${params.dateIso}`,
					kind: 'UPSERT_DAILY_ENTRY',
					queuedAtIso: nowIso,
					payload: {
						dateIso: params.dateIso,
						dayStatus: params.dayStatus,
						journalText: normalizedJournal,
						updatedAtIso: nowIso
					}
				});
			});

			for (const listener of mutationStagedListeners) {
				listener();
			}
		},

		async clearDayEntry(dateIso: string): Promise<void> {
			const nowIso = new Date().toISOString();

			await db.transaction('rw', db.workspaceAndSyncTables, async () => {
				await db.dailyEntries.delete(dateIso);
				await db.habitLogs.where('dateIso').equals(dateIso).delete();

				const pendingForDay = await db.syncOutbox
					.filter(
						(m) =>
							m.id === `entry:${dateIso}` ||
							m.id.startsWith(`log:${dateIso}:`) ||
							(m.kind === 'SAVE_DAILY_ENTRY' && m.payload.dateIso === dateIso)
					)
					.primaryKeys();
				if (pendingForDay.length > 0) {
					await db.syncOutbox.bulkDelete(pendingForDay);
				}

				await db.syncOutbox.put({
					id: `clear-entry:${dateIso}`,
					kind: 'CLEAR_DAILY_ENTRY',
					queuedAtIso: nowIso,
					payload: {
						dateIso,
						updatedAtIso: nowIso
					}
				});
			});

			for (const listener of mutationStagedListeners) {
				listener();
			}
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
							plannedMinutesPerInterval: item.plannedMinutesPerInterval,
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

	async function upsertBookInternal(
		input: CreateBookInput & { bookId?: string }
	): Promise<BookEntity> {
		const existing = input.bookId ? await db.books.get(input.bookId) : undefined;
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
		const entity: BookEntity = {
			...base,
			author: input.author?.trim() || null,
			status: input.status
		};
		return upsertStandardEntity({
			outboxPrefix: 'book',
			table: db.books,
			record: entity,
			queuedAtIso: nowIso,
			toPayload: (record) => ({ collection: 'books', record })
		});
	}

	const books = {
		create: (input: CreateBookInput) => upsertBookInternal(input),
		async update(input: UpdateBookInput): Promise<void> {
			await upsertBookInternal(input);
		},
		async updateStatus(bookId: string, status: BookStatus): Promise<void> {
			const book = await db.books.get(bookId);
			if (!book) return;
			const nowIso = new Date().toISOString();
			await upsertStandardEntity({
				outboxPrefix: 'book',
				table: db.books,
				record: {
					...book,
					status,
					finishedAtIso: status === 'completed' ? getTodayIso() : null,
					updatedAtIso: nowIso
				},
				queuedAtIso: nowIso,
				toPayload: (record) => ({ collection: 'books', record })
			});
		},
		delete: (bookId: string) =>
			deleteStandardEntity({
				collection: 'books',
				outboxPrefix: 'book',
				table: db.books,
				entityId: bookId
			})
	};

	async function upsertMediaInternal(
		input: CreateMediaInput & { mediaId?: string }
	): Promise<MediaEntity> {
		const existing = input.mediaId ? await db.media.get(input.mediaId) : undefined;
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
		const entity: MediaEntity = {
			...base,
			category: input.category,
			status: input.status
		};
		return upsertStandardEntity({
			outboxPrefix: 'media',
			table: db.media,
			record: entity,
			queuedAtIso: nowIso,
			toPayload: (record) => ({ collection: 'media', record })
		});
	}

	const media = {
		create: (input: CreateMediaInput) => upsertMediaInternal(input),
		async update(input: UpdateMediaInput): Promise<void> {
			await upsertMediaInternal(input);
		},
		async updateStatus(mediaId: string, status: MediaStatus): Promise<void> {
			const m = await db.media.get(mediaId);
			if (!m) return;
			const nowIso = new Date().toISOString();
			await upsertStandardEntity({
				outboxPrefix: 'media',
				table: db.media,
				record: {
					...m,
					status,
					finishedAtIso: status === 'completed' ? getTodayIso() : null,
					updatedAtIso: nowIso
				},
				queuedAtIso: nowIso,
				toPayload: (record) => ({ collection: 'media', record })
			});
		},
		delete: (mediaId: string) =>
			deleteStandardEntity({
				collection: 'media',
				outboxPrefix: 'media',
				table: db.media,
				entityId: mediaId
			})
	};

	const notes = {
		async create(input: UpsertNoteInput): Promise<NoteEntity> {
			const nowIso = new Date().toISOString();
			return upsertStandardEntity({
				outboxPrefix: 'note',
				table: db.notes,
				record: {
					id: generateId(),
					title: input.title.trim(),
					content: input.content.trim(),
					category: input.category.trim() || 'عمومی',
					isPinned: false,
					createdAtIso: nowIso,
					updatedAtIso: nowIso
				},
				queuedAtIso: nowIso,
				toPayload: (record) => ({ collection: 'notes', record })
			});
		},
		async update(noteId: string, input: UpsertNoteInput): Promise<void> {
			const note = await db.notes.get(noteId);
			if (!note) return;
			const nowIso = new Date().toISOString();
			await upsertStandardEntity({
				outboxPrefix: 'note',
				table: db.notes,
				record: {
					...note,
					title: input.title.trim(),
					content: input.content.trim(),
					category: input.category.trim() || 'عمومی',
					updatedAtIso: nowIso
				},
				queuedAtIso: nowIso,
				toPayload: (record) => ({ collection: 'notes', record })
			});
		},
		async togglePin(noteId: string, isPinned: boolean): Promise<void> {
			const note = await db.notes.get(noteId);
			if (!note) return;
			const nowIso = new Date().toISOString();
			await upsertStandardEntity({
				outboxPrefix: 'note',
				table: db.notes,
				record: { ...note, isPinned, updatedAtIso: nowIso },
				queuedAtIso: nowIso,
				toPayload: (record) => ({ collection: 'notes', record })
			});
		},
		delete: (noteId: string) =>
			deleteStandardEntity({
				collection: 'notes',
				outboxPrefix: 'note',
				table: db.notes,
				entityId: noteId
			})
	};

	async function upsertCalendarEventInternal(
		input: CreateCalendarEventInput & { eventId?: string }
	): Promise<CalendarEventEntity> {
		const existing = input.eventId ? await db.calendarEvents.get(input.eventId) : undefined;
		const parts = isoToJalaliParts(input.dateIso);
		const isAnnual = Boolean(input.isAnnual);
		const nowIso = new Date().toISOString();

		const entity: CalendarEventEntity = {
			id: existing?.id ?? input.eventId ?? generateId(),
			title: input.title.normalize('NFKC').trim(),
			isAnnual,
			dateIso: isAnnual ? null : input.dateIso,
			jalaliMonth: parts.jm,
			jalaliDay: parts.jd,
			isCompleted: isAnnual ? false : (existing?.isCompleted ?? false),
			notes: input.notes?.normalize('NFKC').trim() || null,
			createdAtIso: existing?.createdAtIso ?? nowIso,
			updatedAtIso: nowIso
		};

		return upsertStandardEntity({
			outboxPrefix: 'event',
			table: db.calendarEvents,
			record: entity,
			queuedAtIso: nowIso,
			toPayload: (record) => ({ collection: 'calendarEvents', record })
		});
	}

	const calendar = {
		create: (input: CreateCalendarEventInput) => upsertCalendarEventInternal(input),
		async update(input: UpdateCalendarEventInput): Promise<void> {
			await upsertCalendarEventInternal(input);
		},
		async toggleComplete(eventId: string, isCompleted: boolean): Promise<void> {
			const ev = await db.calendarEvents.get(eventId);
			if (!ev) return;
			const nowIso = new Date().toISOString();
			await upsertStandardEntity({
				outboxPrefix: 'event',
				table: db.calendarEvents,
				record: { ...ev, isCompleted, updatedAtIso: nowIso },
				queuedAtIso: nowIso,
				toPayload: (record) => ({ collection: 'calendarEvents', record })
			});
		},
		delete: (eventId: string) =>
			deleteStandardEntity({
				collection: 'calendarEvents',
				outboxPrefix: 'event',
				table: db.calendarEvents,
				entityId: eventId
			})
	};

	const people = {
		async create(input: UpsertPersonInput): Promise<PersonEntity> {
			const nowIso = new Date().toISOString();
			const hasBirthday = Boolean(input.birthdayMonth && input.birthdayDay);
			return upsertStandardEntity({
				outboxPrefix: 'person',
				table: db.people,
				record: {
					id: generateId(),
					name: input.name.normalize('NFKC').trim(),
					relation: input.relation.normalize('NFKC').trim() || 'آشنا',
					contactInfo: input.contactInfo?.normalize('NFKC').trim() || null,
					birthdayYear: hasBirthday ? (input.birthdayYear ?? null) : null,
					birthdayMonth: hasBirthday ? (input.birthdayMonth ?? null) : null,
					birthdayDay: hasBirthday ? (input.birthdayDay ?? null) : null,
					notes: input.notes?.normalize('NFKC').trim() || null,
					isPinned: false,
					createdAtIso: nowIso,
					updatedAtIso: nowIso
				},
				queuedAtIso: nowIso,
				toPayload: (record) => ({ collection: 'people', record })
			});
		},
		async update(personId: string, input: UpsertPersonInput): Promise<void> {
			const existing = await db.people.get(personId);
			if (!existing) return;
			const nowIso = new Date().toISOString();
			const hasBirthday = Boolean(input.birthdayMonth && input.birthdayDay);
			await upsertStandardEntity({
				outboxPrefix: 'person',
				table: db.people,
				record: {
					...existing,
					name: input.name.normalize('NFKC').trim(),
					relation: input.relation.normalize('NFKC').trim() || 'آشنا',
					contactInfo: input.contactInfo?.normalize('NFKC').trim() || null,
					birthdayYear: hasBirthday ? (input.birthdayYear ?? null) : null,
					birthdayMonth: hasBirthday ? (input.birthdayMonth ?? null) : null,
					birthdayDay: hasBirthday ? (input.birthdayDay ?? null) : null,
					notes: input.notes?.normalize('NFKC').trim() || null,
					updatedAtIso: nowIso
				},
				queuedAtIso: nowIso,
				toPayload: (record) => ({ collection: 'people', record })
			});
		},
		async togglePin(personId: string, isPinned: boolean): Promise<void> {
			const existing = await db.people.get(personId);
			if (!existing) return;
			const nowIso = new Date().toISOString();
			await upsertStandardEntity({
				outboxPrefix: 'person',
				table: db.people,
				record: { ...existing, isPinned, updatedAtIso: nowIso },
				queuedAtIso: nowIso,
				toPayload: (record) => ({ collection: 'people', record })
			});
		},
		delete: (personId: string) =>
			deleteStandardEntity({
				collection: 'people',
				outboxPrefix: 'person',
				table: db.people,
				entityId: personId
			})
	};

	async function getSyncMeta(): Promise<SyncMetaRecord> {
		const existing = await db.syncMeta.get('meta:sync');
		if (existing) {
			return existing;
		}

		const initialized: SyncMetaRecord = {
			key: 'meta:sync',
			knownServerVersionIso: null,
			lastSyncedAtIso: null
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
				if (existing && compareTimestampsIso(existing.queuedAtIso, item.queuedAtIso) <= 0) {
					await db.syncOutbox.delete(item.id);
				}
			}
		});
	}

	const workspaceRunners = {
		habits: createTableSyncRunner<HabitEntity, HabitEntity>({
			table: db.habits,
			getLocalKey: (h) => h.id,
			getIncomingKey: (h) => h.id,
			getIncomingUpdatedAt: (h) => h.updatedAtIso,
			getLocalUpdatedAt: (h) => h.updatedAtIso,
			isProtectedLocal: (h, ctx) => ctx.pendingIds.has(`habit:${h.id}`),
			isProtectedIncoming: (h, ctx) => ctx.pendingIds.has(`habit:${h.id}`),
			toLocalRecord: (h) => h
		}),
		lifecycleEvents: createTableSyncRunner<LifecycleEventEntity, LifecycleEventEntity>({
			table: db.lifecycleEvents,
			getLocalKey: (lc) => lc.id,
			getIncomingKey: (lc) => lc.id,
			getIncomingUpdatedAt: (lc) => lc.createdAtIso,
			getLocalUpdatedAt: (lc) => lc.createdAtIso,
			isProtectedLocal: (lc, ctx) => ctx.pendingIds.has(`lifecycle:${lc.id}`),
			isProtectedIncoming: (lc, ctx) => ctx.pendingIds.has(`lifecycle:${lc.id}`),
			toLocalRecord: (lc) => lc
		}),
		books: createTableSyncRunner<BookEntity, BookEntity>({
			table: db.books,
			getLocalKey: (b) => b.id,
			getIncomingKey: (b) => b.id,
			getIncomingUpdatedAt: (b) => b.updatedAtIso,
			getLocalUpdatedAt: (b) => b.updatedAtIso,
			isProtectedLocal: (b, ctx) => ctx.pendingIds.has(`book:${b.id}`),
			isProtectedIncoming: (b, ctx) => ctx.pendingIds.has(`book:${b.id}`),
			toLocalRecord: (b) => b
		}),
		media: createTableSyncRunner<MediaEntity, MediaEntity>({
			table: db.media,
			getLocalKey: (m) => m.id,
			getIncomingKey: (m) => m.id,
			getIncomingUpdatedAt: (m) => m.updatedAtIso,
			getLocalUpdatedAt: (m) => m.updatedAtIso,
			isProtectedLocal: (m, ctx) => ctx.pendingIds.has(`media:${m.id}`),
			isProtectedIncoming: (m, ctx) => ctx.pendingIds.has(`media:${m.id}`),
			toLocalRecord: (m) => m
		}),
		notes: createTableSyncRunner<NoteEntity, NoteEntity>({
			table: db.notes,
			getLocalKey: (n) => n.id,
			getIncomingKey: (n) => n.id,
			getIncomingUpdatedAt: (n) => n.updatedAtIso,
			getLocalUpdatedAt: (n) => n.updatedAtIso,
			isProtectedLocal: (n, ctx) => ctx.pendingIds.has(`note:${n.id}`),
			isProtectedIncoming: (n, ctx) => ctx.pendingIds.has(`note:${n.id}`),
			toLocalRecord: (n) => n
		}),
		calendarEvents: createTableSyncRunner<CalendarEventEntity, CalendarEventEntity>({
			table: db.calendarEvents,
			getLocalKey: (ev) => ev.id,
			getIncomingKey: (ev) => ev.id,
			getIncomingUpdatedAt: (ev) => ev.updatedAtIso,
			getLocalUpdatedAt: (ev) => ev.updatedAtIso,
			isProtectedLocal: (ev, ctx) => ctx.pendingIds.has(`event:${ev.id}`),
			isProtectedIncoming: (ev, ctx) => ctx.pendingIds.has(`event:${ev.id}`),
			toLocalRecord: (ev) => ev
		}),
		people: createTableSyncRunner<PersonEntity, PersonEntity>({
			table: db.people,
			getLocalKey: (p) => p.id,
			getIncomingKey: (p) => p.id,
			getIncomingUpdatedAt: (p) => p.updatedAtIso,
			getLocalUpdatedAt: (p) => p.updatedAtIso,
			isProtectedLocal: (p, ctx) => ctx.pendingIds.has(`person:${p.id}`),
			isProtectedIncoming: (p, ctx) => ctx.pendingIds.has(`person:${p.id}`),
			toLocalRecord: (p) => p
		}),
		cadencePlans: createTableSyncRunner<CadencePlanEntity, CadencePlanEntity>({
			table: db.cadencePlans,
			getLocalKey: (c) => c.id,
			getIncomingKey: (c) => c.id,
			getIncomingUpdatedAt: (c) => c.updatedAtIso,
			getLocalUpdatedAt: (c) => c.updatedAtIso,
			isProtectedLocal: (c, ctx) => ctx.pendingCadenceDates.has(c.dateIso),
			isProtectedIncoming: (c, ctx) => ctx.pendingCadenceDates.has(c.dateIso),
			toLocalRecord: (c) => c
		}),
		entries: createTableSyncRunner<
			LocalDailyEntryRecord,
			LocalWorkspaceSnapshot['entries'][number]
		>({
			table: db.dailyEntries,
			getLocalKey: (e) => e.dateIso,
			getIncomingKey: (e) => e.dateIso,
			getIncomingUpdatedAt: (e) => e.updatedAtIso,
			getLocalUpdatedAt: (e) => e.updatedAtIso,
			isProtectedLocal: (e, ctx) => ctx.pendingEntryDates.has(e.dateIso),
			isProtectedIncoming: (e, ctx) => ctx.pendingEntryDates.has(e.dateIso),
			toLocalRecord: (e) => ({
				dateIso: e.dateIso,
				dayStatus: e.dayStatus,
				journalText: e.journalText ?? null,
				updatedAtIso: e.updatedAtIso
			})
		}),
		logs: createTableSyncRunner<
			LocalHabitLogRecord,
			LocalWorkspaceSnapshot['logs'][number]
		>({
			table: db.habitLogs,
			getLocalKey: (l) => l.id,
			getIncomingKey: (l) => l.id || `log:${l.dateIso}:${l.habitId}`,
			getIncomingUpdatedAt: (l) => l.updatedAtIso,
			getLocalUpdatedAt: (l) => l.updatedAtIso,
			isProtectedLocal: (l, ctx) =>
				ctx.pendingFullDayDates.has(l.dateIso) ||
				ctx.pendingLogIds.has(l.id) ||
				ctx.pendingLogIds.has(`log:${l.dateIso}:${l.habitId}`),
			isProtectedIncoming: (l, ctx) => {
				const logId = l.id || `log:${l.dateIso}:${l.habitId}`;
				return (
					ctx.pendingFullDayDates.has(l.dateIso) ||
					ctx.pendingLogIds.has(logId) ||
					ctx.pendingLogIds.has(`log:${l.dateIso}:${l.habitId}`)
				);
			},
			toLocalRecord: (l, fallbackNowIso) => ({
				id: l.id || `log:${l.dateIso}:${l.habitId}`,
				dateIso: l.dateIso,
				habitId: l.habitId,
				habitTitleSnapshot: l.habitTitleSnapshot ?? null,
				achievedTier: l.achievedTier,
				achievedRuleSnapshot: l.achievedRuleSnapshot ?? null,
				habitSnapshotJson: l.habitSnapshotJson ?? null,
				actualMinutesPerInterval: l.actualMinutesPerInterval ?? null,
				plannedMinutesSnapshot: l.plannedMinutesSnapshot ?? null,
				updatedAtIso: l.updatedAtIso || fallbackNowIso
			})
		})
	};

	async function buildSyncApplyContext(): Promise<SyncApplyContext> {
		const pending = await db.syncOutbox.toArray();
		const pendingEntryDates = new Set<string>();
		const pendingFullDayDates = new Set<string>();
		const pendingLogIds = new Set<string>();
		const pendingCadenceDates = new Set<string>();

		for (const m of pending) {
			if (m.kind === 'SAVE_DAILY_ENTRY' || m.kind === 'CLEAR_DAILY_ENTRY') {
				pendingEntryDates.add(m.payload.dateIso);
				pendingFullDayDates.add(m.payload.dateIso);
			} else if (m.kind === 'UPSERT_DAILY_ENTRY') {
				pendingEntryDates.add(m.payload.dateIso);
			} else if (m.kind === 'UPSERT_HABIT_LOG') {
				pendingLogIds.add(m.payload.id);
				pendingLogIds.add(`log:${m.payload.dateIso}:${m.payload.habitId}`);
			} else if (m.kind === 'DELETE_HABIT_LOG') {
				pendingLogIds.add(m.payload.logId);
				pendingLogIds.add(`log:${m.payload.dateIso}:${m.payload.habitId}`);
			} else if (m.kind === 'SAVE_CADENCE_PLAN') {
				pendingCadenceDates.add(m.payload.targetDateIso);
			}
		}

		return {
			pendingIds: new Set(pending.map((m) => m.id)),
			pendingEntryDates,
			pendingFullDayDates,
			pendingLogIds,
			pendingCadenceDates,
			fallbackNowIso: new Date().toISOString()
		};
	}

	async function applyServerWorkspace(ws: LocalWorkspaceSnapshot): Promise<void> {
		await db.transaction('rw', db.workspaceAndSyncTables, async () => {
			const ctx = await buildSyncApplyContext();
			await workspaceRunners.habits.applyFull(ws.habits, ctx);
			await workspaceRunners.lifecycleEvents.applyFull(ws.lifecycleEvents, ctx);
			await workspaceRunners.books.applyFull(ws.books, ctx);
			await workspaceRunners.media.applyFull(ws.media, ctx);
			await workspaceRunners.notes.applyFull(ws.notes, ctx);
			await workspaceRunners.calendarEvents.applyFull(ws.calendarEvents, ctx);
			await workspaceRunners.people.applyFull(ws.people ?? [], ctx);
			await workspaceRunners.cadencePlans.applyFull(ws.cadencePlans, ctx);
			await workspaceRunners.entries.applyFull(ws.entries, ctx);
			await workspaceRunners.logs.applyFull(ws.logs, ctx);
		});
	}

	async function applyDeltaWorkspace(delta: DeltaWorkspaceSnapshot): Promise<void> {
		await db.transaction('rw', db.workspaceAndSyncTables, async () => {
			const ctx = await buildSyncApplyContext();
			await workspaceRunners.habits.applyDelta(delta.habits, [], ctx);
			await workspaceRunners.lifecycleEvents.applyDelta(delta.lifecycleEvents, [], ctx);
			await workspaceRunners.books.applyDelta(delta.books, delta.deleted.books, ctx);
			await workspaceRunners.media.applyDelta(delta.media, delta.deleted.media, ctx);
			await workspaceRunners.notes.applyDelta(delta.notes, delta.deleted.notes, ctx);
			await workspaceRunners.calendarEvents.applyDelta(
				delta.calendarEvents,
				delta.deleted.calendarEvents,
				ctx
			);
			await workspaceRunners.people.applyDelta(delta.people, delta.deleted.people, ctx);
			await workspaceRunners.cadencePlans.applyDelta(
				delta.cadencePlans,
				delta.deleted.cadencePlans,
				ctx
			);
			await workspaceRunners.entries.applyDelta(
				delta.entries,
				delta.deleted.dailyEntries,
				ctx
			);
			await workspaceRunners.logs.applyDelta(delta.logs, delta.deleted.habitLogs, ctx);
		});
	}

	async function clearLocalData(): Promise<void> {
		await db.transaction('rw', db.clearableTables, async () => {
			await Promise.all(db.clearableTables.map((table) => table.clear()));
		});
	}

	async function clearWorkspace(): Promise<void> {
		const clearedAtIso = new Date().toISOString();
		await db.transaction('rw', db.workspaceAndSyncTables, async () => {
			await Promise.all(db.workspaceAndSyncTables.map((table) => table.clear()));
			await db.syncOutbox.put({
				id: 'workspace:clear',
				kind: 'CLEAR_WORKSPACE',
				queuedAtIso: clearedAtIso,
				payload: { clearedAtIso }
			});
		});
		for (const listener of mutationStagedListeners) {
			listener();
		}
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
		people,
		getSyncMeta,
		saveSyncMeta,
		getPendingMutations,
		removeAppliedMutations,
		applyServerWorkspace,
		applyDeltaWorkspace,
		exportBackupPayload: backupOps.exportBackupPayload,
		restoreBackupPayload: backupOps.restoreBackupPayload,
		clearLocalData,
		clearWorkspace
	};
}
