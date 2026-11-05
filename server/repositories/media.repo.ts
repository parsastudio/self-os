import { db } from '../database/index';
import { mediaLogs } from '../database/schema';
import { desc, eq } from 'drizzle-orm';
import { getTodayIso, resolveCompletedRangeDates } from '~/domain/calendar';
import type { CreateMediaInput, MediaEntity, UpdateMediaInput } from '~/domain/schemas';

export function getAllMedia(): MediaEntity[] {
	return db.select().from(mediaLogs).orderBy(desc(mediaLogs.createdAtIso)).all();
}

export function createMediaRecord(input: CreateMediaInput): MediaEntity {
	const { startedAtIso, finishedAtIso } = resolveCompletedRangeDates({
		startedJalali: input.startedJalali,
		finishedJalali: input.finishedJalali,
		isCompleted: input.status === 'completed'
	});

	const nowIso = new Date().toISOString();
	const newRecord: MediaEntity = {
		id: crypto.randomUUID(),
		title: input.title.trim(),
		category: input.category,
		status: input.status,
		startedAtIso,
		finishedAtIso,
		rating: input.rating,
		notes: input.notes?.trim() || null,
		createdAtIso: nowIso,
		updatedAtIso: nowIso
	};

	db.insert(mediaLogs).values(newRecord).run();
	return newRecord;
}

export function updateMediaRecord(input: UpdateMediaInput): void {
	const { startedAtIso, finishedAtIso } = resolveCompletedRangeDates({
		startedJalali: input.startedJalali,
		finishedJalali: input.finishedJalali,
		isCompleted: input.status === 'completed'
	});

	const nowIso = new Date().toISOString();

	db.update(mediaLogs)
		.set({
			title: input.title.trim(),
			category: input.category,
			status: input.status,
			startedAtIso,
			finishedAtIso,
			rating: input.rating,
			notes: input.notes?.trim() || null,
			updatedAtIso: nowIso
		})
		.where(eq(mediaLogs.id, input.mediaId))
		.run();
}

export function updateMediaStatus(mediaId: string, status: MediaEntity['status']): void {
	const finishedAtIso = status === 'completed' ? getTodayIso() : null;
	const nowIso = new Date().toISOString();

	db.update(mediaLogs)
		.set({ status, finishedAtIso, updatedAtIso: nowIso })
		.where(eq(mediaLogs.id, mediaId))
		.run();
}

export function deleteMediaRecord(mediaId: string): void {
	db.delete(mediaLogs).where(eq(mediaLogs.id, mediaId)).run();
}
