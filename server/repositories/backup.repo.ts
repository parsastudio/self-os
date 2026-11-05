import { like } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { db, ensureDatabaseReady } from '../database/index';
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
import { bumpServerStructuralVersion } from './sync.repo';
import { computeSmartBackupMerge } from '~/core/backup-merger';
import { DEMO_ENTRY_TAG, DEMO_ID_PREFIX } from '~/domain/demo-seed';
import type { DatabaseBackupPayload } from '~/domain/schemas';

export async function clearAllDatabaseRecords(): Promise<void> {
	await ensureDatabaseReady();
	await db.transaction(async (tx) => {
		await tx.delete(habitLogs);
		await tx.delete(dailyEntries);
		await tx.delete(cadencePlans);
		await tx.delete(habitLifecycleEvents);
		await tx.delete(reflectionTags);
		await tx.delete(habits);
		await tx.delete(books);
		await tx.delete(mediaLogs);
		await tx.delete(calendarEvents);
		await tx.delete(notes);
	});

	bumpServerStructuralVersion();
}

export async function removeDemoSeedFromServer(): Promise<{ removedRecordsCount: number }> {
	await ensureDatabaseReady();
	let removed = 0;
	const prefixPattern = `${DEMO_ID_PREFIX}%`;
	const tagPattern = `%${DEMO_ENTRY_TAG}%`;

	await db.transaction(async (tx) => {
		removed += (
			await tx
				.delete(habitLogs)
				.where(like(habitLogs.id, prefixPattern))
				.returning({ id: habitLogs.id })
		).length;
		removed += (
			await tx
				.delete(habitLogs)
				.where(like(habitLogs.habitId, prefixPattern))
				.returning({ id: habitLogs.id })
		).length;
		removed += (
			await tx
				.delete(dailyEntries)
				.where(like(dailyEntries.id, prefixPattern))
				.returning({ id: dailyEntries.id })
		).length;
		removed += (
			await tx
				.delete(dailyEntries)
				.where(like(dailyEntries.tagsJson, tagPattern))
				.returning({ id: dailyEntries.id })
		).length;
		removed += (
			await tx
				.delete(cadencePlans)
				.where(like(cadencePlans.id, prefixPattern))
				.returning({ id: cadencePlans.id })
		).length;
		removed += (
			await tx
				.delete(habitLifecycleEvents)
				.where(like(habitLifecycleEvents.id, prefixPattern))
				.returning({ id: habitLifecycleEvents.id })
		).length;
		removed += (
			await tx
				.delete(habits)
				.where(like(habits.id, prefixPattern))
				.returning({ id: habits.id })
		).length;
		removed += (
			await tx
				.delete(books)
				.where(like(books.id, prefixPattern))
				.returning({ id: books.id })
		).length;
		removed += (
			await tx
				.delete(mediaLogs)
				.where(like(mediaLogs.id, prefixPattern))
				.returning({ id: mediaLogs.id })
		).length;
		removed += (
			await tx
				.delete(notes)
				.where(like(notes.id, prefixPattern))
				.returning({ id: notes.id })
		).length;
		removed += (
			await tx
				.delete(calendarEvents)
				.where(like(calendarEvents.id, prefixPattern))
				.returning({ id: calendarEvents.id })
		).length;
	});

	bumpServerStructuralVersion();
	return { removedRecordsCount: removed };
}

export async function importDatabaseFromJson(
	payload: DatabaseBackupPayload,
	mode: 'replace' | 'merge' = 'merge'
): Promise<{ importedRecordsCount: number; skippedDuplicatesCount: number }> {
	await ensureDatabaseReady();
	const { data } = payload;
	let totalImported = 0;
	let skippedDuplicatesCount = 0;

	await db.transaction(async (tx) => {
		if (mode === 'replace') {
			await tx.delete(habitLogs);
			await tx.delete(dailyEntries);
			await tx.delete(cadencePlans);
			await tx.delete(habitLifecycleEvents);
			await tx.delete(reflectionTags);
			await tx.delete(habits);
			await tx.delete(books);
			await tx.delete(mediaLogs);
			await tx.delete(calendarEvents);
			await tx.delete(notes);
		}

		const [
			extHabits,
			extEntries,
			extLogs,
			extPlans,
			extBooks,
			extMedia,
			extNotes,
			extEvents,
			extLifecycle,
			extTags
		] = await Promise.all([
			tx.select().from(habits),
			tx.select().from(dailyEntries),
			tx.select().from(habitLogs),
			tx.select().from(cadencePlans),
			tx.select().from(books),
			tx.select().from(mediaLogs),
			tx.select().from(notes),
			tx.select().from(calendarEvents),
			tx.select().from(habitLifecycleEvents),
			tx.select().from(reflectionTags)
		]);

		const existingData = {
			habits: extHabits,
			dailyEntries: extEntries,
			habitLogs: extLogs,
			cadencePlans: extPlans,
			books: extBooks,
			media: extMedia,
			notes: extNotes,
			calendarEvents: extEvents,
			lifecycleEvents: extLifecycle,
			reflectionTags: extTags
		};

		const merged = computeSmartBackupMerge(existingData, data);
		skippedDuplicatesCount = merged.skippedDuplicatesCount;

		const upsertRows = async <T extends Record<string, unknown>>(
			table: PgTable,
			targetCol: PgColumn,
			rows: ReadonlyArray<T>
		) => {
			for (const row of rows) {
				await tx
					.insert(table)
					.values(row as Record<string, unknown>)
					.onConflictDoUpdate({
						target: targetCol,
						set: row as Record<string, unknown>
					});
				totalImported++;
			}
		};

		await upsertRows(habits, habits.id, merged.habitsToUpsert);

		for (const e of merged.dailyEntriesToUpsert) {
			const { id: _id, ...entryFields } = e;
			await tx
				.insert(dailyEntries)
				.values(e)
				.onConflictDoUpdate({
					target: dailyEntries.dateIso,
					set: entryFields
				});
			totalImported++;
		}

		for (const l of merged.habitLogsToUpsert) {
			const { id: _id, ...logFields } = l;
			await tx
				.insert(habitLogs)
				.values(l)
				.onConflictDoUpdate({
					target: [habitLogs.dateIso, habitLogs.habitId],
					set: logFields
				});
			totalImported++;
		}

		for (const c of merged.cadencePlansToUpsert) {
			const { id: _id, ...planFields } = c;
			await tx
				.insert(cadencePlans)
				.values(c)
				.onConflictDoUpdate({
					target: [cadencePlans.dateIso, cadencePlans.habitId],
					set: planFields
				});
			totalImported++;
		}

		await upsertRows(books, books.id, merged.booksToUpsert);
		await upsertRows(mediaLogs, mediaLogs.id, merged.mediaToUpsert);
		await upsertRows(notes, notes.id, merged.notesToUpsert);
		await upsertRows(calendarEvents, calendarEvents.id, merged.calendarEventsToUpsert);
		await upsertRows(
			habitLifecycleEvents,
			habitLifecycleEvents.id,
			merged.lifecycleEventsToUpsert
		);

		for (const tag of merged.reflectionTagsToUpsert) {
			const { id: _id, ...tagFields } = tag;
			await tx
				.insert(reflectionTags)
				.values(tag)
				.onConflictDoUpdate({
					target: reflectionTags.label,
					set: tagFields
				});
			totalImported++;
		}
	});

	bumpServerStructuralVersion();
	return { importedRecordsCount: totalImported, skippedDuplicatesCount };
}
