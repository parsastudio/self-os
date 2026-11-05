import { db } from '../database/index';
import { books } from '../database/schema';
import { desc, eq } from 'drizzle-orm';
import { getTodayIso, resolveCompletedRangeDates } from '~/domain/calendar';
import type { BookEntity, CreateBookInput, UpdateBookInput } from '~/domain/schemas';

export function getAllBooks(): BookEntity[] {
	return db.select().from(books).orderBy(desc(books.createdAtIso)).all();
}

export function createBookRecord(input: CreateBookInput): BookEntity {
	const { startedAtIso, finishedAtIso } = resolveCompletedRangeDates({
		startedJalali: input.startedJalali,
		finishedJalali: input.finishedJalali,
		isCompleted: input.status === 'completed'
	});

	const nowIso = new Date().toISOString();
	const newBook: BookEntity = {
		id: crypto.randomUUID(),
		title: input.title.trim(),
		author: input.author?.trim() || null,
		status: input.status,
		startedAtIso,
		finishedAtIso,
		rating: input.rating,
		notes: input.notes?.trim() || null,
		createdAtIso: nowIso,
		updatedAtIso: nowIso
	};

	db.insert(books).values(newBook).run();
	return newBook;
}

export function updateBookRecord(input: UpdateBookInput): void {
	const { startedAtIso, finishedAtIso } = resolveCompletedRangeDates({
		startedJalali: input.startedJalali,
		finishedJalali: input.finishedJalali,
		isCompleted: input.status === 'completed'
	});

	const nowIso = new Date().toISOString();

	db.update(books)
		.set({
			title: input.title.trim(),
			author: input.author?.trim() || null,
			status: input.status,
			startedAtIso,
			finishedAtIso,
			rating: input.rating,
			notes: input.notes?.trim() || null,
			updatedAtIso: nowIso
		})
		.where(eq(books.id, input.bookId))
		.run();
}

export function updateBookStatus(bookId: string, status: BookEntity['status']): void {
	const finishedAtIso = status === 'completed' ? getTodayIso() : null;
	const nowIso = new Date().toISOString();

	db.update(books)
		.set({ status, finishedAtIso, updatedAtIso: nowIso })
		.where(eq(books.id, bookId))
		.run();
}

export function deleteBookRecord(bookId: string): void {
	db.delete(books).where(eq(books.id, bookId)).run();
}
