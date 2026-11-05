import { db } from '../database/index';
import { habitLifecycleEvents } from '../database/schema';
import { desc } from 'drizzle-orm';
import type { LifecycleEventEntity } from '~/domain/schemas';

export function getLifecycleTimeline(): LifecycleEventEntity[] {
	return db
		.select()
		.from(habitLifecycleEvents)
		.orderBy(desc(habitLifecycleEvents.createdAtIso))
		.all();
}
