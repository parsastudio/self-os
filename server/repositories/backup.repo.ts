import { db } from '../database/index';
import {
	books,
	cadencePlans,
	calendarEvents,
	dailyEntries,
	habitLifecycleEvents,
	habitLogs,
	habits,
	mediaLogs,
	notes,
	reflectionTags
} from '../database/schema';
import { like } from 'drizzle-orm';
import { DEMO_ENTRY_TAG, DEMO_ID_PREFIX } from '~/domain/demo-seed';
import type { DatabaseBackupPayload } from '~/domain/schemas';

export function removeDemoSeedFromServer(): { removedRecordsCount: number } {
	let removed = 0;
	const prefixPattern = `${DEMO_ID_PREFIX}%`;
	const tagPattern = `%${DEMO_ENTRY_TAG}%`;

	db.transaction((tx) => {
		removed += tx.delete(habitLogs).where(like(habitLogs.id, prefixPattern)).run().changes;
		removed += tx.delete(habitLogs).where(like(habitLogs.habitId, prefixPattern)).run().changes;
		removed += tx.delete(dailyEntries).where(like(dailyEntries.id, prefixPattern)).run().changes;
		removed += tx.delete(dailyEntries).where(like(dailyEntries.tagsJson, tagPattern)).run().changes;
		removed += tx.delete(cadencePlans).where(like(cadencePlans.id, prefixPattern)).run().changes;
		removed += tx.delete(habitLifecycleEvents).where(like(habitLifecycleEvents.id, prefixPattern)).run().changes;
		removed += tx.delete(habits).where(like(habits.id, prefixPattern)).run().changes;
		removed += tx.delete(books).where(like(books.id, prefixPattern)).run().changes;
		removed += tx.delete(mediaLogs).where(like(mediaLogs.id, prefixPattern)).run().changes;
		removed += tx.delete(notes).where(like(notes.id, prefixPattern)).run().changes;
		removed += tx.delete(calendarEvents).where(like(calendarEvents.id, prefixPattern)).run().changes;
	});

	return { removedRecordsCount: removed };
}

export function importDatabaseFromJson(
	payload: DatabaseBackupPayload,
	mode: 'replace' | 'merge' = 'replace'
): { importedRecordsCount: number } {
	const { data } = payload;
	let totalImported = 0;

	db.transaction((tx) => {
		if (mode === 'replace') {
			tx.delete(habitLogs).run();
			tx.delete(dailyEntries).run();
			tx.delete(cadencePlans).run();
			tx.delete(habitLifecycleEvents).run();
			tx.delete(reflectionTags).run();
			tx.delete(habits).run();
			tx.delete(books).run();
			tx.delete(mediaLogs).run();
			tx.delete(calendarEvents).run();
			tx.delete(notes).run();
		}

		const upsertRows = <T extends Record<string, unknown>>(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			table: any,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			targetCol: any,
			rows: ReadonlyArray<T>
		) => {
			for (const row of rows) {
				tx.insert(table)
					.values(row)
					.onConflictDoUpdate({
						target: targetCol,
						set: row
					})
					.run();
				totalImported++;
			}
		};

		upsertRows(habits, habits.id, data.habits);
		upsertRows(dailyEntries, dailyEntries.id, data.dailyEntries);
		upsertRows(habitLogs, habitLogs.id, data.habitLogs);
		upsertRows(cadencePlans, cadencePlans.id, data.cadencePlans);
		upsertRows(books, books.id, data.books);
		upsertRows(mediaLogs, mediaLogs.id, data.media);
		upsertRows(notes, notes.id, data.notes);
		upsertRows(calendarEvents, calendarEvents.id, data.calendarEvents);
		upsertRows(habitLifecycleEvents, habitLifecycleEvents.id, data.lifecycleEvents);
		upsertRows(reflectionTags, reflectionTags.id, data.reflectionTags);
	});

	return { importedRecordsCount: totalImported };
}
