import { getTableColumns, like, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { db, ensureDatabaseReady } from '../database/index';
import type { DbExecutor } from './daily-tracker.repo';
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

async function truncateAllWorkspaceTables(tx: DbExecutor): Promise<void> {
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

function buildConflictUpdateSet(table: PgTable, excludeKeys: string[] = ['id']) {
	const cols = getTableColumns(table);
	const excludeSet = new Set(excludeKeys);
	const updateSet: Record<string, unknown> = {};

	for (const [propKey, col] of Object.entries(cols)) {
		if (!excludeSet.has(propKey)) {
			updateSet[propKey] = sql.raw(`excluded."${col.name}"`);
		}
	}
	return updateSet;
}

export async function clearAllDatabaseRecords(): Promise<void> {
	await ensureDatabaseReady();
	await db.transaction(async (tx) => {
		await truncateAllWorkspaceTables(tx);
		await bumpServerStructuralVersion(new Date().toISOString(), tx);
	});
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

	await bumpServerStructuralVersion();
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
			await truncateAllWorkspaceTables(tx);
		}

		const existingData = {
			habits: await tx.select().from(habits),
			dailyEntries: await tx.select().from(dailyEntries),
			habitLogs: await tx.select().from(habitLogs),
			cadencePlans: await tx.select().from(cadencePlans),
			books: await tx.select().from(books),
			media: await tx.select().from(mediaLogs),
			notes: await tx.select().from(notes),
			calendarEvents: await tx.select().from(calendarEvents),
			lifecycleEvents: await tx.select().from(habitLifecycleEvents),
			reflectionTags: await tx.select().from(reflectionTags)
		};

		const merged = computeSmartBackupMerge(existingData, data);
		skippedDuplicatesCount = merged.skippedDuplicatesCount;

		const UPSERT_CHUNK_SIZE = 400;
		const batchUpsertRows = async <T extends Record<string, unknown>>(
			table: PgTable,
			targetCols: PgColumn | PgColumn[],
			rows: ReadonlyArray<T>,
			excludeKeys: string[] = ['id']
		) => {
			if (rows.length === 0) return;
			const conflictSet = buildConflictUpdateSet(table, excludeKeys);
			for (let offset = 0; offset < rows.length; offset += UPSERT_CHUNK_SIZE) {
				const chunk = rows.slice(offset, offset + UPSERT_CHUNK_SIZE);
				await tx
					.insert(table)
					.values(chunk as Record<string, unknown>[])
					.onConflictDoUpdate({
						target: targetCols,
						set: conflictSet
					});
			}
			totalImported += rows.length;
		};

		await batchUpsertRows(habits, habits.id, merged.habitsToUpsert);
		await batchUpsertRows(
			dailyEntries,
			dailyEntries.dateIso,
			merged.dailyEntriesToUpsert,
			['dateIso']
		);
		await batchUpsertRows(
			habitLogs,
			[habitLogs.dateIso, habitLogs.habitId],
			merged.habitLogsToUpsert,
			[]
		);
		await batchUpsertRows(
			cadencePlans,
			[cadencePlans.dateIso, cadencePlans.habitId],
			merged.cadencePlansToUpsert,
			[]
		);
		await batchUpsertRows(books, books.id, merged.booksToUpsert);
		await batchUpsertRows(mediaLogs, mediaLogs.id, merged.mediaToUpsert);
		await batchUpsertRows(notes, notes.id, merged.notesToUpsert);
		await batchUpsertRows(calendarEvents, calendarEvents.id, merged.calendarEventsToUpsert);
		await batchUpsertRows(
			habitLifecycleEvents,
			habitLifecycleEvents.id,
			merged.lifecycleEventsToUpsert
		);
		await batchUpsertRows(
			reflectionTags,
			reflectionTags.label,
			merged.reflectionTagsToUpsert,
			['label']
		);
		await bumpServerStructuralVersion(new Date().toISOString(), tx);
	});

	return { importedRecordsCount: totalImported, skippedDuplicatesCount };
}
