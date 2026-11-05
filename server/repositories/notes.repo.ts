import { db } from '../database/index';
import { notes } from '../database/schema';
import { desc, eq } from 'drizzle-orm';
import type { NoteEntity, UpsertNoteInput } from '~/domain/schemas';

export function getAllNotes(): NoteEntity[] {
	return db
		.select()
		.from(notes)
		.orderBy(desc(notes.isPinned), desc(notes.updatedAtIso))
		.all();
}

export function createNoteRecord(input: UpsertNoteInput): NoteEntity {
	const nowIso = new Date().toISOString();
	const newNote: NoteEntity = {
		id: crypto.randomUUID(),
		title: input.title.trim(),
		content: input.content.trim(),
		category: input.category.trim() || 'عمومی',
		isPinned: false,
		createdAtIso: nowIso,
		updatedAtIso: nowIso
	};

	db.insert(notes).values(newNote).run();
	return newNote;
}

export function updateNoteRecord(noteId: string, input: UpsertNoteInput): void {
	const nowIso = new Date().toISOString();
	db.update(notes)
		.set({
			title: input.title.trim(),
			content: input.content.trim(),
			category: input.category.trim() || 'عمومی',
			updatedAtIso: nowIso
		})
		.where(eq(notes.id, noteId))
		.run();
}

export function toggleNotePinRecord(noteId: string, isPinned: boolean): void {
	const nowIso = new Date().toISOString();
	db.update(notes)
		.set({ isPinned, updatedAtIso: nowIso })
		.where(eq(notes.id, noteId))
		.run();
}

export function deleteNoteRecord(noteId: string): void {
	db.delete(notes).where(eq(notes.id, noteId)).run();
}
