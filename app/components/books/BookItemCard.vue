<script setup lang="ts">
import { computed } from 'vue';
import { isoToJalaliSlash, toPersianDigits } from '~/domain/calendar';
import { BOOK_STATUS_OPTIONS } from '~/domain/constants';
import type { BookEntity } from '~/domain/schemas';
import { CheckCircle2, Pencil, Star, Trash2 } from 'lucide-vue-next';

interface Props {
	book: BookEntity;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	(e: 'edit', book: BookEntity): void;
	(e: 'updateStatus', bookId: string, status: 'completed'): void;
	(e: 'delete', bookId: string): void;
}>();

const statusMeta = computed(
	() => BOOK_STATUS_OPTIONS.find((s) => s.value === props.book.status) ?? BOOK_STATUS_OPTIONS[0]!
);
</script>

<template>
	<div
		class="group flex flex-col justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-(--shadow-card) transition hover:border-border-strong sm:flex-row sm:items-center sm:px-5 sm:py-3.5"
	>
		<div class="min-w-0 flex-1 space-y-1">
			<div class="flex flex-wrap items-center gap-2.5">
				<h3 class="truncate text-sm font-black text-fg sm:text-base">{{ book.title }}</h3>

				<span class="rounded-lg px-2.5 py-0.5 text-[11px] font-extrabold" :class="statusMeta.badgeClasses">
					{{ statusMeta.badgeLabel }}
				</span>

				<div v-if="book.rating" class="flex items-center gap-0.5 text-gold" :title="`${book.rating} ستاره`">
					<Star v-for="idx in book.rating" :key="idx" class="h-3 w-3 fill-current" />
				</div>
			</div>

			<div class="flex flex-wrap items-center gap-3 text-xs text-fg-secondary">
				<span v-if="book.author" class="font-medium text-fg-muted">
					نویسنده: <strong class="font-semibold text-fg-secondary">{{ book.author }}</strong>
				</span>
				<span v-if="book.finishedAtIso" class="text-fg-muted">
					اتمام:
					<strong class="font-mono font-bold text-fg-secondary">
						{{ toPersianDigits(isoToJalaliSlash(book.finishedAtIso)) }}
					</strong>
				</span>
				<span v-if="book.notes" class="truncate text-[11px] text-fg-muted" :title="book.notes">
					«{{ book.notes }}»
				</span>
			</div>
		</div>

		<div class="flex shrink-0 items-center justify-end gap-2 border-t border-border pt-2 sm:border-t-0 sm:pt-0">
			<button
				v-if="book.status !== 'completed'"
				type="button"
				class="flex h-8 items-center gap-1.5 rounded-xl bg-optimal-soft px-3 text-xs font-extrabold text-optimal transition hover:opacity-90 active:scale-95"
				@click="emit('updateStatus', book.id, 'completed')"
			>
				<CheckCircle2 class="h-3.5 w-3.5" />
				<span>تکمیل شد</span>
			</button>

			<button
				type="button"
				class="flex h-8 w-8 items-center justify-center rounded-xl text-fg-muted transition hover:bg-elevated hover:text-fg active:scale-95"
				title="ویرایش اطلاعات کتاب"
				@click="emit('edit', book)"
			>
				<Pencil class="h-3.5 w-3.5" />
			</button>

			<button
				type="button"
				class="flex h-8 w-8 items-center justify-center rounded-xl text-fg-muted transition hover:bg-failed-soft hover:text-failed active:scale-95"
				title="حذف کتاب"
				@click="emit('delete', book.id)"
			>
				<Trash2 class="h-3.5 w-3.5" />
			</button>
		</div>
	</div>
</template>
