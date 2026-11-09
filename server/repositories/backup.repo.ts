import { getTableColumns, like, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { db, ensureDatabaseReady } from '~~/server/database/index';
import type { DbExecutor } from '~~/server/repositories/daily-tracker.repo';
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
	reflectionTags,
	syncState
} from '~~/server/database/schema';
import { bumpServerStructuralVersion } from '~~/server/repositories/sync.repo';
import { computeSmartBackupMerge } from '~/core/backup-merger';
import { DEMO_ENTRY_TAG, DEMO_ID_PREFIX } from '~/domain/constants';
import type { DatabaseBackupPayload } from '~/domain/schemas';

const WORKSPACE_TABLES = [
	habitLogs,
	dailyEntries,
	cadencePlans,
	habitLifecycleEvents,
	reflectionTags,
	habits,
	books,
	mediaLogs,
	calendarEvents,
	notes
] as const;

async function truncateAllWorkspaceTables(tx: DbExecutor): Promise<void> {
	for (const table of WORKSPACE_TABLES) {
		await tx.delete(table);
	}
}

function buildConflictUpdateSet(table: PgTable, excludeKeys: string[] = ['id']) {
	const cols = getTableColumns(table);
	const excludeSet = new Set(excludeKeys);
	const updateSet: Record<string, ReturnType<typeof sql.raw>> = {};

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
		await tx.delete(syncState).where(like(syncState.id, 'del:%'));
		await bumpServerStructuralVersion(new Date().toISOString(), tx);
	});
}

export async function removeDemoSeedFromServer(): Promise<{ removedRecordsCount: number }> {
	await ensureDatabaseReady();
	let removed = 0;
	const prefixPattern = `${DEMO_ID_PREFIX}%`;
	const tagPattern = `%${DEMO_ENTRY_TAG}%`;

	const demoCleanupTargets: ReadonlyArray<{
		table: PgTable;
		idCol: PgColumn;
		matchCol: PgColumn;
		pattern: string;
	}> = [
		{ table: habitLogs, idCol: habitLogs.id, matchCol: habitLogs.id, pattern: prefixPattern },
		{ table: habitLogs, idCol: habitLogs.id, matchCol: habitLogs.habitId, pattern: prefixPattern },
		{ table: dailyEntries, idCol: dailyEntries.id, matchCol: dailyEntries.id, pattern: prefixPattern },
		{ table: dailyEntries, idCol: dailyEntries.id, matchCol: dailyEntries.tagsJson, pattern: tagPattern },
		{ table: cadencePlans, idCol: cadencePlans.id, matchCol: cadencePlans.id, pattern: prefixPattern },
		{ table: cadencePlans, idCol: cadencePlans.id, matchCol: cadencePlans.habitId, pattern: prefixPattern },
		{
			table: habitLifecycleEvents,
			idCol: habitLifecycleEvents.id,
			matchCol: habitLifecycleEvents.id,
			pattern: prefixPattern
		},
		{
			table: habitLifecycleEvents,
			idCol: habitLifecycleEvents.id,
			matchCol: habitLifecycleEvents.habitId,
			pattern: prefixPattern
		},
		{ table: habits, idCol: habits.id, matchCol: habits.id, pattern: prefixPattern },
		{ table: books, idCol: books.id, matchCol: books.id, pattern: prefixPattern },
		{ table: mediaLogs, idCol: mediaLogs.id, matchCol: mediaLogs.id, pattern: prefixPattern },
		{ table: notes, idCol: notes.id, matchCol: notes.id, pattern: prefixPattern },
		{
			table: calendarEvents,
			idCol: calendarEvents.id,
			matchCol: calendarEvents.id,
			pattern: prefixPattern
		}
	];

	await db.transaction(async (tx) => {
		for (const target of demoCleanupTargets) {
			const deletedRows = await tx
				.delete(target.table)
				.where(like(target.matchCol, target.pattern))
				.returning({ id: target.idCol });
			removed += deletedRows.length;
		}
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
			await tx.delete(syncState).where(like(syncState.id, 'del:%'));
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
		const batchUpsertRows = async <TTable extends PgTable>(
			table: TTable,
			targetCols: PgColumn | PgColumn[],
			rows: ReadonlyArray<TTable['$inferInsert']>,
			excludeKeys: string[] = ['id']
		) => {
			if (rows.length === 0) return;
			const conflictSet = buildConflictUpdateSet(table, excludeKeys);
			for (let offset = 0; offset < rows.length; offset += UPSERT_CHUNK_SIZE) {
				const chunk = rows.slice(offset, offset + UPSERT_CHUNK_SIZE);
				await tx
					.insert(table)
					.values(chunk)
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
