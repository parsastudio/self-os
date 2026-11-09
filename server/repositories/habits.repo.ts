import { asc } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '~~/server/database/index';
import { habits } from '~~/server/database/schema';
import type { HabitEntity } from '~/domain/schemas';

export async function getAllHabits(): Promise<HabitEntity[]> {
	await ensureDatabaseReady();
	return db.select().from(habits).orderBy(asc(habits.sortOrder));
}
