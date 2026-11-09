<script setup lang="ts">
import { useAppDatabase } from '~/composables/useAppDatabase';
import { useDexieLiveQuery } from '~/composables/useDexieLiveQuery';
import { useLocalRepository } from '~/composables/useLocalRepository';
import type {
	BookEntity,
	BookSortBy,
	BookStatusFilter,
	CreateBookInput,
	UpdateBookInput
} from '~/domain/schemas';
import { BookOpen, Plus } from 'lucide-vue-next';

const db = useAppDatabase();
const localRepo = useLocalRepository();

const books = useDexieLiveQuery(() => db.books.orderBy('createdAtIso').reverse().toArray(), []);
const isBooksLoading = books.isLoading;
const booksError = books.error;

const searchQuery = ref('');
const statusFilter = ref<BookStatusFilter>('ALL');
const sortBy = ref<BookSortBy>('newest');
const isModalOpen = ref(false);
const isSubmittingBook = ref(false);
const editingBook = ref<BookEntity | null>(null);

const completedCount = computed(() => books.value.filter((b) => b.status === 'completed').length);
const readingCount = computed(() => books.value.filter((b) => b.status === 'reading').length);
const onHoldCount = computed(() => books.value.filter((b) => b.status === 'on_hold').length);

const filteredBooks = computed(() => {
	const q = searchQuery.value.trim().toLowerCase();
	const filtered = books.value.filter((b) => {
		if (statusFilter.value === 'READING' && b.status !== 'reading') return false;
		if (statusFilter.value === 'COMPLETED' && b.status !== 'completed') return false;
		if (statusFilter.value === 'ON_HOLD' && b.status !== 'on_hold') return false;
		if (q) {
			const haystack = `${b.title} ${b.author ?? ''} ${b.notes ?? ''}`.toLowerCase();
			if (!haystack.includes(q)) return false;
		}
		return true;
	});

	return [...filtered].sort((a, b) => {
		if (sortBy.value === 'rating_desc') {
			const rDiff = (b.rating ?? 0) - (a.rating ?? 0);
			if (rDiff !== 0) return rDiff;
			return b.createdAtIso > a.createdAtIso ? 1 : b.createdAtIso < a.createdAtIso ? -1 : 0;
		}
		if (sortBy.value === 'newest') {
			const dateA = a.finishedAtIso || a.startedAtIso || a.createdAtIso;
			const dateB = b.finishedAtIso || b.startedAtIso || b.createdAtIso;
			return dateB > dateA ? 1 : dateB < dateA ? -1 : 0;
		}
		if (sortBy.value === 'oldest') {
			const dateA = a.finishedAtIso || a.startedAtIso || a.createdAtIso;
			const dateB = b.finishedAtIso || b.startedAtIso || b.createdAtIso;
			return dateA > dateB ? 1 : dateA < dateB ? -1 : 0;
		}
		return a.title.localeCompare(b.title, 'fa');
	});
});

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
		closeModal();
	} finally {
		isSubmittingBook.value = false;
	}
}

async function handleUpdateStatus(bookId: string, status: 'completed') {
	await localRepo.books.updateStatus(bookId, status);
}

async function handleDeleteBook(bookId: string) {
	await localRepo.books.delete(bookId);
}
</script>

<template>
	<div class="space-y-6 pb-16">
		<BooksHeaderStats
			:total-count="books.length"
			:completed-count="completedCount"
			:reading-count="readingCount"
			:on-hold-count="onHoldCount"
			:search-query="searchQuery"
			:status-filter="statusFilter"
			:sort-by="sortBy"
			@update:search-query="searchQuery = $event"
			@update:status-filter="statusFilter = $event"
			@update:sort-by="sortBy = $event"
			@open-create="openCreateModal"
		/>

		<div v-if="isBooksLoading" class="space-y-2.5" aria-busy="true">
			<div v-for="idx in 4" :key="idx" class="h-20 animate-pulse rounded-2xl border border-border bg-surface"></div>
		</div>

		<div
			v-else-if="booksError"
			class="rounded-3xl border border-failed-border bg-surface p-8 text-center shadow-(--shadow-soft)"
		>
			<p class="text-sm font-extrabold text-failed">{{ booksError }}</p>
		</div>

		<div
			v-else-if="books.length === 0"
			class="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-surface p-12 text-center"
		>
			<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-elevated text-fg-muted">
				<BookOpen class="h-8 w-8" />
			</div>
			<h3 class="text-base font-extrabold text-fg">هنوز کتابی ثبت نشده است</h3>
			<p class="mt-1.5 text-sm text-fg-muted">اولین کتاب خود را در کتابخانه شخصی ثبت کنید.</p>
			<button
				type="button"
				class="mt-5 inline-flex h-11 items-center gap-2 rounded-2xl bg-accent px-5 text-xs font-extrabold text-accent-fg shadow-xs transition hover:opacity-90"
				@click="openCreateModal"
			>
				<Plus class="h-4 w-4" />
				<span>ثبت اولین کتاب</span>
			</button>
		</div>

		<div v-else-if="filteredBooks.length === 0" class="rounded-3xl border border-border bg-surface p-10 text-center text-sm font-semibold text-fg-muted">
			کتابی با این فیلتر یا عبارت جستجو یافت نشد.
		</div>

		<NuxtErrorBoundary v-else>
			<div class="space-y-2.5">
				<BooksBookItemCard
					v-for="book in filteredBooks"
					:key="book.id"
					:book="book"
					@edit="openEditModal"
					@update-status="handleUpdateStatus"
					@delete="handleDeleteBook"
				/>
			</div>

			<template #error="{ error, clearError }">
				<div class="rounded-3xl border border-failed-border bg-surface p-6 text-center shadow-(--shadow-soft)">
					<p class="text-sm font-extrabold text-failed">
						{{ error?.message || 'خطا در نمایش فهرست کتاب‌ها' }}
					</p>
					<button
						type="button"
						class="mt-3 h-10 rounded-xl bg-accent px-5 text-xs font-extrabold text-accent-fg"
						@click="clearError()"
					>
						تلاش مجدد
					</button>
				</div>
			</template>
		</NuxtErrorBoundary>

		<LazyBooksBookUpsertModal
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
