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
import type { DatabaseBackupPayload } from '~/domain/schemas';

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

		for (const h of data.habits) {
			tx.insert(habits)
				.values(h)
				.onConflictDoUpdate({
					target: habits.id,
					set: h
				})
				.run();
			totalImported++;
		}

		for (const e of data.dailyEntries) {
			tx.insert(dailyEntries)
				.values(e)
				.onConflictDoUpdate({
					target: dailyEntries.id,
					set: e
				})
				.run();
			totalImported++;
		}

		for (const l of data.habitLogs) {
			tx.insert(habitLogs)
				.values(l)
				.onConflictDoUpdate({
					target: habitLogs.id,
					set: l
				})
				.run();
			totalImported++;
		}

		for (const c of data.cadencePlans) {
			tx.insert(cadencePlans)
				.values(c)
				.onConflictDoUpdate({
					target: cadencePlans.id,
					set: c
				})
				.run();
			totalImported++;
		}

		for (const b of data.books) {
			tx.insert(books)
				.values(b)
				.onConflictDoUpdate({
					target: books.id,
					set: b
				})
				.run();
			totalImported++;
		}

		for (const m of data.media) {
			tx.insert(mediaLogs)
				.values(m)
				.onConflictDoUpdate({
					target: mediaLogs.id,
					set: m
				})
				.run();
			totalImported++;
		}

		for (const n of data.notes) {
			tx.insert(notes)
				.values(n)
				.onConflictDoUpdate({
					target: notes.id,
					set: n
				})
				.run();
			totalImported++;
		}

		for (const ev of data.calendarEvents) {
			tx.insert(calendarEvents)
				.values(ev)
				.onConflictDoUpdate({
					target: calendarEvents.id,
					set: ev
				})
				.run();
			totalImported++;
		}

		for (const lc of data.lifecycleEvents) {
			tx.insert(habitLifecycleEvents)
				.values(lc)
				.onConflictDoUpdate({
					target: habitLifecycleEvents.id,
					set: lc
				})
				.run();
			totalImported++;
		}

		for (const tag of data.reflectionTags) {
			tx.insert(reflectionTags)
				.values(tag)
				.onConflictDoUpdate({
					target: reflectionTags.id,
					set: tag
				})
				.run();
			totalImported++;
		}
	});

	return { importedRecordsCount: totalImported };
}
