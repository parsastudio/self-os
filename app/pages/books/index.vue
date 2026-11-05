<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppDatabase } from '~/composables/useAppDatabase';
import { useDexieLiveQuery } from '~/composables/useDexieLiveQuery';
import { useLocalRepository } from '~/composables/useLocalRepository';
import { useSyncEngine } from '~/composables/useSyncEngine';
import type { BookEntity, CreateBookInput, UpdateBookInput } from '~/domain/schemas';
import BooksHeaderStats from '~/components/books/BooksHeaderStats.vue';
import BookItemCard from '~/components/books/BookItemCard.vue';
import BookUpsertModal from '~/components/books/BookUpsertModal.vue';
import { BookOpen, Plus } from 'lucide-vue-next';

const db = useAppDatabase();
const localRepo = useLocalRepository();
const syncEngine = useSyncEngine();

const books = useDexieLiveQuery(() => db.books.orderBy('createdAtIso').reverse().toArray(), []);

const isModalOpen = ref(false);
const isSubmittingBook = ref(false);
const editingBook = ref<BookEntity | null>(null);

const completedCount = computed(() => books.value.filter((b) => b.status === 'completed').length);
const readingCount = computed(() => books.value.filter((b) => b.status === 'reading').length);

const existingSuggestions = computed(() => {
	const map = new Map<string, string | null>();
	for (const b of books.value) {
		if (!map.has(b.title)) {
			map.set(b.title, b.author);
		}
	}
	return Array.from(map.entries()).map(([title, author]) => ({ title, author }));
});

function openCreateModal() {
	editingBook.value = null;
	isModalOpen.value = true;
}

function openEditModal(book: BookEntity) {
	editingBook.value = book;
	isModalOpen.value = true;
}

function closeModal() {
	isModalOpen.value = false;
	editingBook.value = null;
}

async function handleSaveBook(payload: CreateBookInput | UpdateBookInput) {
	if (isSubmittingBook.value) return;
	isSubmittingBook.value = true;
	try {
		if ('bookId' in payload) {
			await localRepo.books.update(payload);
		} else {
			await localRepo.books.create(payload);
		}
		void syncEngine.notifyLocalMutationStaged();
		closeModal();
	} finally {
		isSubmittingBook.value = false;
	}
}

async function handleUpdateStatus(bookId: string, status: 'completed') {
	await localRepo.books.updateStatus(bookId, status);
	void syncEngine.notifyLocalMutationStaged();
}

async function handleDeleteBook(bookId: string) {
	await localRepo.books.delete(bookId);
	void syncEngine.notifyLocalMutationStaged();
}
</script>

<template>
	<div class="space-y-8 pb-16">
		<BooksHeaderStats
			:completed-count="completedCount"
			:reading-count="readingCount"
			@open-create="openCreateModal"
		/>

		<div
			v-if="books.length === 0"
			class="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-surface p-12 text-center"
		>
			<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-elevated text-fg-muted">
				<BookOpen class="h-8 w-8" />
			</div>
			<h3 class="text-base font-extrabold text-fg">هنوز کتابی ثبت نشده است</h3>
			<p class="mt-1.5 text-sm text-fg-muted">اولین کتاب خود را در کتابخانه شخصی ثبت کنید.</p>
			<button
				type="button"
				class="mt-5 inline-flex h-11 items-center gap-2 rounded-2xl bg-accent px-5 text-xs font-extrabold text-accent-fg transition hover:opacity-90 shadow-xs"
				@click="openCreateModal"
			>
				<Plus class="h-4 w-4" />
				<span>ثبت اولین کتاب</span>
			</button>
		</div>

		<div v-else class="space-y-2.5">
			<BookItemCard
				v-for="book in books"
				:key="book.id"
				:book="book"
				@edit="openEditModal"
				@update-status="handleUpdateStatus"
				@delete="handleDeleteBook"
			/>
		</div>

		<BookUpsertModal
			v-if="isModalOpen"
			:key="editingBook?.id ?? 'new'"
			:editing-book="editingBook"
			:existing-suggestions="existingSuggestions"
			:is-submitting="isSubmittingBook"
			@submit="handleSaveBook"
			@close="closeModal"
		/>
	</div>
</template>
