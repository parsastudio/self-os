import { getTableColumns, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
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
	people,
	syncState
} from '~~/server/database/schema';
import { normalizeTimestampIso } from '~/domain/calendar';

const SYNC_STATE_SINGLETON_ID = 'singleton';

const WORKSPACE_TABLES = [
	habitLogs,
	dailyEntries,
	cadencePlans,
	habitLifecycleEvents,
	habits,
	books,
	mediaLogs,
	calendarEvents,
	notes,
	people
] as const;

export function buildConflictUpdateSet(table: PgTable, excludeKeys: string[] = ['id']) {
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

export async function bumpServerStructuralVersion(
	iso?: string,
	txExecutor?: DbExecutor
): Promise<void> {
	const effectiveIso = normalizeTimestampIso(iso, new Date().toISOString());
	await ensureDatabaseReady();
	const executor = txExecutor ?? db;
	await executor
		.insert(syncState)
		.values({
			id: SYNC_STATE_SINGLETON_ID,
			structuralVersionIso: effectiveIso
		})
		.onConflictDoUpdate({
			target: syncState.id,
			set: {
				structuralVersionIso: sql`GREATEST(${syncState.structuralVersionIso}, excluded.structural_version_iso)`
			}
		});
}

export async function clearAllDatabaseRecords(
	clearedAtIso = new Date().toISOString(),
	txExecutor?: DbExecutor
): Promise<void> {
	await ensureDatabaseReady();
	const applyClear = async (tx: DbExecutor) => {
		for (const table of WORKSPACE_TABLES) {
			await tx.delete(table);
		}
		await tx.delete(syncState);
		await bumpServerStructuralVersion(clearedAtIso, tx);
	};

	if (txExecutor) {
		await applyClear(txExecutor);
	} else {
		await db.transaction(applyClear);
	}
}
