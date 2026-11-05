import { db } from '../database/index';
import { habits } from '../database/schema';
import type { HabitEntity } from '~/domain/schemas';

export function getAllHabits(): HabitEntity[] {
	return db.select().from(habits).orderBy(habits.sortOrder).all();
}
