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

export type {
	LocalAuthRecord,
	LocalDailyEntryRecord,
	LocalHabitLogRecord,
	LocalReflectionTagRecord,
	SyncMetaRecord
};

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
}

let dbInstance: PersonalOSDatabase | null = null;
let ssrNoopDbProxy: PersonalOSDatabase | null = null;

function createSsrNoopTableProxy(): unknown {
	const noopAsync = async () => undefined;
	const noopArrayAsync = async () => [];
	const chainable: Record<string, unknown> = {
		toArray: noopArrayAsync,
		primaryKeys: noopArrayAsync,
		first: noopAsync,
		count: async () => 0,
		delete: async () => 0
	};
	chainable.reverse = () => chainable;
	chainable.limit = () => chainable;
	chainable.equals = () => chainable;
	chainable.between = () => chainable;
	chainable.filter = () => chainable;

	return new Proxy(
		{},
		{
			get(_target, prop) {
				if (prop === 'get' || prop === 'put' || prop === 'delete' || prop === 'clear') {
					return noopAsync;
				}
				if (prop === 'bulkPut' || prop === 'bulkDelete') {
					return noopAsync;
				}
				if (prop === 'toArray') {
					return noopArrayAsync;
				}
				if (
					prop === 'orderBy' ||
					prop === 'where' ||
					prop === 'filter' ||
					prop === 'toCollection'
				) {
					return () => chainable;
				}
				return noopAsync;
			}
		}
	);
}

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
		const tableProxy = createSsrNoopTableProxy();
		ssrNoopDbProxy = new Proxy({} as PersonalOSDatabase, {
			get(_target, prop) {
				if (prop === 'transaction') {
					return async (_mode: string, _tables: unknown, scope: () => Promise<unknown>) =>
						scope();
				}
				return tableProxy;
			}
		});
	}
	return ssrNoopDbProxy;
}
