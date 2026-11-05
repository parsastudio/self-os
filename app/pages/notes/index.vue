<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppDatabase } from '~/composables/useAppDatabase';
import { useDexieLiveQuery } from '~/composables/useDexieLiveQuery';
import { useLocalRepository } from '~/composables/useLocalRepository';
import { detectNoteSmartSignals } from '~/core/note-signals';
import { toPersianDigits } from '~/domain/calendar';
import type { NoteEntity, NoteSmartFilter, UpsertNoteInput } from '~/domain/schemas';
import NoteItemCard from '~/components/notes/NoteItemCard.vue';
import NoteUpsertModal from '~/components/notes/NoteUpsertModal.vue';
import { Hash, Link2, NotebookPen, Plus, Search } from 'lucide-vue-next';

const db = useAppDatabase();
const localRepo = useLocalRepository();

const rawNotes = useDexieLiveQuery(() => db.notes.orderBy('updatedAtIso').reverse().toArray(), []);

const notes = computed(() =>
	[...rawNotes.value].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0))
);

const searchQuery = ref('');
const smartFilter = ref<NoteSmartFilter>('ALL');
const selectedCategory = ref<string>('ALL');
const isModalOpen = ref(false);
const isSubmittingNote = ref(false);
const editingNote = ref<NoteEntity | null>(null);

const categories = computed(() => {
	const set = new Set<string>(['عمومی']);
	for (const n of notes.value) {
		if (n.category.trim()) set.add(n.category.trim());
	}
	return Array.from(set);
});

const filteredNotes = computed(() => {
	const q = searchQuery.value.trim().toLowerCase();

	return notes.value.filter((note) => {
		if (selectedCategory.value !== 'ALL' && note.category !== selectedCategory.value) {
			return false;
		}

		const combinedText = `${note.title} ${note.content}`;
		const signals = detectNoteSmartSignals(combinedText);

		if (smartFilter.value === 'HAS_LINK' && !signals.hasLink) return false;
		if (smartFilter.value === 'HAS_NUMBER' && !signals.hasNumber) return false;

		if (q) {
			const haystack = `${note.title} ${note.content} ${note.category}`.toLowerCase();
			if (!haystack.includes(q)) return false;
		}

		return true;
	});
});

function openCreateModal() {
	editingNote.value = null;
	isModalOpen.value = true;
}

function openEditModal(note: NoteEntity) {
	editingNote.value = note;
	isModalOpen.value = true;
}

function closeModal() {
	isModalOpen.value = false;
	editingNote.value = null;
}

async function handleSaveNote(payload: UpsertNoteInput) {
	if (isSubmittingNote.value) return;
	isSubmittingNote.value = true;
	try {
		if (payload.noteId) {
			await localRepo.notes.update(payload.noteId, payload);
		} else {
			await localRepo.notes.create(payload);
		}
		closeModal();
	} finally {
		isSubmittingNote.value = false;
	}
}

async function handleTogglePin(noteId: string, isPinned: boolean) {
	await localRepo.notes.togglePin(noteId, isPinned);
}

async function handleDeleteNote(noteId: string) {
	await localRepo.notes.delete(noteId);
}
</script>

<template>
	<div class="space-y-6 pb-16">
		<section class="rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
			<div class="flex flex-wrap items-center justify-between gap-4">
				<div class="flex items-center gap-3.5">
					<div
						class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text"
					>
						<NotebookPen class="h-6 w-6" />
					</div>
					<div>
						<h1 class="text-xl font-black tracking-tight text-fg sm:text-2xl">یادداشت‌ها</h1>
						<span class="text-xs font-bold text-fg-secondary">
							{{ toPersianDigits(notes.length) }} یادداشت، لینک و شماره ذخیره‌شده
						</span>
					</div>
				</div>

				<div class="flex w-full flex-wrap items-center justify-end gap-2.5 sm:w-auto">
					<div v-if="notes.length > 0" class="relative flex-1 sm:w-60 sm:flex-initial">
						<Search class="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-fg-muted" />
						<input
							v-model="searchQuery"
							type="search"
							placeholder="جستجو در یادداشت‌ها..."
							class="h-11 w-full rounded-2xl border border-border bg-elevated pr-9 pl-3.5 text-xs font-bold text-fg placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
						/>
					</div>

					<button
						type="button"
						class="flex h-11 items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-xs font-extrabold text-accent-fg shadow-xs transition hover:opacity-90 active:scale-98 sm:text-sm"
						@click="openCreateModal"
					>
						<Plus class="h-4 w-4" />
						<span>یادداشت جدید</span>
					</button>
				</div>
			</div>

			<div v-if="notes.length > 0" class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
				<div class="flex flex-wrap items-center gap-1.5">
					<button
						type="button"
						class="rounded-xl px-3 py-1.5 text-xs font-extrabold transition"
						:class="
							smartFilter === 'ALL'
								? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs'
								: 'bg-elevated text-fg-secondary hover:text-fg'
						"
						@click="smartFilter = 'ALL'"
					>
						همه
					</button>
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition"
						:class="
							smartFilter === 'HAS_LINK'
								? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs'
								: 'bg-elevated text-fg-secondary hover:text-fg'
						"
						@click="smartFilter = smartFilter === 'HAS_LINK' ? 'ALL' : 'HAS_LINK'"
					>
						<Link2 class="h-3.5 w-3.5" />
						<span>حاوی لینک</span>
					</button>
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition"
						:class="
							smartFilter === 'HAS_NUMBER'
								? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs'
								: 'bg-elevated text-fg-secondary hover:text-fg'
						"
						@click="smartFilter = smartFilter === 'HAS_NUMBER' ? 'ALL' : 'HAS_NUMBER'"
					>
						<Hash class="h-3.5 w-3.5" />
						<span>حاوی شماره</span>
					</button>
				</div>

				<div v-if="categories.length > 1" class="flex flex-wrap items-center gap-1.5">
					<button
						type="button"
						class="rounded-xl px-2.5 py-1 text-[11px] font-bold transition"
						:class="
							selectedCategory === 'ALL'
								? 'bg-accent text-accent-fg shadow-xs'
								: 'bg-elevated text-fg-secondary hover:text-fg'
						"
						@click="selectedCategory = 'ALL'"
					>
						همه دسته‌ها
					</button>
					<button
						v-for="cat in categories"
						:key="cat"
						type="button"
						class="rounded-xl px-2.5 py-1 text-[11px] font-bold transition"
						:class="
							selectedCategory === cat
								? 'bg-accent text-accent-fg shadow-xs'
								: 'bg-elevated text-fg-secondary hover:text-fg'
						"
						@click="selectedCategory = cat"
					>
						{{ cat }}
					</button>
				</div>
			</div>
		</section>

		<div
			v-if="notes.length === 0"
			class="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-surface p-12 text-center"
		>
			<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-elevated text-fg-muted">
				<NotebookPen class="h-8 w-8" />
			</div>
			<h2 class="text-base font-extrabold text-fg">هنوز یادداشتی ثبت نشده است</h2>
			<p class="mt-1.5 max-w-md text-xs leading-6 text-fg-muted">
				سایت‌های کاربردی، شماره‌های مهم یا یادداشت‌های روزمره را اینجا ذخیره کنید؛ سیستم به صورت خودکار لینک‌ها و شماره‌های ۱۰ رقمی را شناسایی می‌کند.
			</p>
			<button
				type="button"
				class="mt-5 inline-flex h-11 items-center gap-2 rounded-2xl bg-accent px-5 text-xs font-extrabold text-accent-fg transition hover:opacity-90 shadow-xs"
				@click="openCreateModal"
			>
				<Plus class="h-4 w-4" />
				<span>ثبت اولین یادداشت</span>
			</button>
		</div>

		<div
			v-else-if="filteredNotes.length === 0"
			class="rounded-3xl border border-border bg-surface p-10 text-center text-sm font-semibold text-fg-muted"
		>
			موردی با این فیلتر یا عبارت جستجو یافت نشد.
		</div>

		<div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<NoteItemCard
				v-for="note in filteredNotes"
				:key="note.id"
				:note="note"
				@edit="openEditModal"
				@toggle-pin="handleTogglePin"
				@delete="handleDeleteNote"
			/>
		</div>

		<NoteUpsertModal
			v-if="isModalOpen"
			:key="editingNote?.id ?? 'new'"
			:editing-note="editingNote"
			:existing-categories="categories"
			:is-submitting="isSubmittingNote"
			@submit="handleSaveNote"
			@close="closeModal"
		/>
	</div>
</template>
