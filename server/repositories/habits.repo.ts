import { asc } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '../database/index';
import { habits } from '../database/schema';
import type { HabitEntity } from '~/domain/schemas';

export async function getAllHabits(): Promise<HabitEntity[]> {
	await ensureDatabaseReady();
	return db.select().from(habits).orderBy(asc(habits.sortOrder));
}
