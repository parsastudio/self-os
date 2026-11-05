import Dexie, { type Table } from 'dexie';
import type {
	BookEntity,
	CadencePlanEntity,
	CalendarEventEntity,
	DayStatusColor,
	HabitEntity,
	HabitLogItemInput,
	LifecycleEventEntity,
	MediaEntity,
	NoteEntity,
	SyncOutboxMutation
} from '~/domain/schemas';

export interface LocalDailyEntryRecord {
	dateIso: string;
	dayStatus: DayStatusColor;
	reflectionNote: string;
	journalText: string | null;
	tags: string[];
	updatedAtIso: string;
}

export interface LocalHabitLogRecord extends HabitLogItemInput {
	id: string;
	dateIso: string;
	updatedAtIso: string;
}

export interface LocalReflectionTagRecord {
	id: string;
	label: string;
	sortOrder: number;
}

export interface SyncMetaRecord {
	key: 'meta:sync';
	clientId: string;
	knownServerVersionIso: string | null;
	lastSyncedAtIso: string | null;
}

export interface LocalAuthRecord {
	key: 'auth:session';
	isAuthenticated: boolean;
	isPasswordConfigured: boolean;
	expiresAtIso: string;
	verifierSaltHex: string;
	passwordVerifierHex: string;
	updatedAtIso: string;
}

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
	if (!db) {
		throw new Error('Database is only accessible on client-side environments.');
	}
	return db;
}
