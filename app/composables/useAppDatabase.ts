import Dexie, { type Table } from 'dexie';
import type {
	BookEntity,
	CadencePlanEntity,
	CalendarEventEntity,
	HabitEntity,
	LifecycleEventEntity,
	LocalAuthRecord,
	LocalDailyEntryRecord,
	LocalHabitLogRecord,
	LocalReflectionTagRecord,
	MediaEntity,
	NoteEntity,
	SyncMetaRecord,
	SyncOutboxMutation
} from '~/domain/schemas';

export class PersonalOSDatabase extends Dexie {
	habits!: Table<HabitEntity, string>;
	dailyEntries!: Table<LocalDailyEntryRecord, string>;
	habitLogs!: Table<LocalHabitLogRecord, string>;
	cadencePlans!: Table<CadencePlanEntity, string>;
	books!: Table<BookEntity, string>;
	media!: Table<MediaEntity, string>;
	notes!: Table<NoteEntity, string>;
	calendarEvents!: Table<CalendarEventEntity, string>;
	lifecycleEvents!: Table<LifecycleEventEntity, string>;
	reflectionTags!: Table<LocalReflectionTagRecord, string>;
	syncOutbox!: Table<SyncOutboxMutation, string>;
	syncMeta!: Table<SyncMetaRecord, string>;
	localAuth!: Table<LocalAuthRecord, string>;

	constructor() {
		super('newlife_dexie_db');

		this.version(1).stores({
			habits: 'id, parentId, status, sortOrder, trackingMode, timeSlot, updatedAtIso',
			dailyEntries: 'dateIso, dayStatus, updatedAtIso',
			habitLogs: 'id, dateIso, habitId, [dateIso+habitId], updatedAtIso',
			cadencePlans: 'id, dateIso, habitId, [dateIso+habitId], updatedAtIso',
			books: 'id, status, startedAtIso, finishedAtIso, createdAtIso, updatedAtIso',
			media: 'id, category, status, finishedAtIso, createdAtIso, updatedAtIso',
			notes: 'id, category, isPinned, updatedAtIso',
			calendarEvents: 'id, dateIso, [jalaliMonth+jalaliDay], isCompleted, updatedAtIso',
			lifecycleEvents: 'id, habitId, effectiveDateIso, createdAtIso',
			reflectionTags: 'id, &label, sortOrder',
			syncOutbox: 'id, queuedAtIso, kind',
			syncMeta: 'key',
			localAuth: 'key'
		});
	}

	get workspaceTables(): Table[] {
		return [
			this.habits,
			this.dailyEntries,
			this.habitLogs,
			this.cadencePlans,
			this.books,
			this.media,
			this.notes,
			this.calendarEvents,
			this.lifecycleEvents,
			this.reflectionTags
		];
	}

	get workspaceAndSyncTables(): Table[] {
		return [...this.workspaceTables, this.syncOutbox];
	}

	get clearableTables(): Table[] {
		return [...this.workspaceAndSyncTables, this.syncMeta];
	}
}

let dbInstance: PersonalOSDatabase | null = null;
let ssrNoopDbProxy: PersonalOSDatabase | null = null;

export function getAppDatabase(): PersonalOSDatabase | null {
	if (!import.meta.client) {
		return null;
	}
	if (!dbInstance) {
		dbInstance = new PersonalOSDatabase();
	}
	return dbInstance;
}

export function useAppDatabase(): PersonalOSDatabase {
	const db = getAppDatabase();
	if (db) {
		return db;
	}
	if (!ssrNoopDbProxy) {
		const recursiveNoop: unknown = new Proxy(() => Promise.resolve([]), {
			get: () => recursiveNoop
		});
		ssrNoopDbProxy = recursiveNoop as PersonalOSDatabase;
	}
	return ssrNoopDbProxy;
}
