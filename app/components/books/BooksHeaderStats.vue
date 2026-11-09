<script setup lang="ts">
import { toPersianDigits } from '~/domain/calendar';
import type { BookSortBy, BookStatusFilter } from '~/domain/schemas';
import { BookOpen, Plus, Search } from 'lucide-vue-next';

interface Props {
	totalCount: number;
	completedCount: number;
	readingCount: number;
	onHoldCount: number;
	searchQuery: string;
	statusFilter: BookStatusFilter;
	sortBy: BookSortBy;
}

defineProps<Props>();

const emit = defineEmits<{
	(e: 'update:searchQuery', val: string): void;
	(e: 'update:statusFilter', val: BookStatusFilter): void;
	(e: 'update:sortBy', val: BookSortBy): void;
	(e: 'openCreate'): void;
}>();

const sortOptions: ReadonlyArray<{ value: BookSortBy; label: string }> = [
	{ value: 'newest', label: 'جدیدترین‌ها' },
	{ value: 'rating_desc', label: 'بیشترین امتیاز' },
	{ value: 'oldest', label: 'قدیمی‌ترین‌ها' },
	{ value: 'title_asc', label: 'حروف الفبا' }
];
</script>

<template>
	<div class="space-y-4 rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) sm:px-6">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text"
				>
					<BookOpen class="h-5 w-5" />
				</div>
				<div class="flex items-baseline gap-2.5">
					<h1 class="text-lg font-black tracking-tight text-fg sm:text-xl">کتابخانه شخصی</h1>
					<span class="text-xs font-bold text-fg-muted">({{ toPersianDigits(totalCount) }} کتاب)</span>
				</div>
			</div>

			<div class="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
				<div v-if="totalCount > 0" class="relative w-full sm:w-52">
					<Search class="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-fg-muted" />
					<input
						:value="searchQuery"
						type="search"
						placeholder="جستجوی کتاب یا نویسنده..."
						class="h-10 w-full rounded-2xl border border-border bg-elevated pr-9 pl-3 text-xs font-bold text-fg placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
						@input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
					/>
				</div>

				<div class="w-full sm:w-40">
					<UiCustomSelect
						:model-value="sortBy"
						:options="sortOptions"
						trigger-class="h-10 text-xs font-extrabold text-fg"
						@select="emit('update:sortBy', $event as BookSortBy)"
					/>
				</div>

				<button
					type="button"
					class="flex h-10 items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-xs font-extrabold text-accent-fg shadow-xs transition hover:opacity-90 active:scale-98"
					@click="emit('openCreate')"
				>
					<Plus class="h-4 w-4" />
					<span>افزودن کتاب جدید</span>
				</button>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-1.5 border-t border-border pt-3.5">
			<button
				type="button"
				class="rounded-xl px-3 py-1.5 text-xs font-extrabold transition"
				:class="statusFilter === 'ALL' ? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs' : 'bg-elevated text-fg-secondary hover:text-fg'"
				@click="emit('update:statusFilter', 'ALL')"
			>
				همه ({{ toPersianDigits(totalCount) }})
			</button>
			<button
				type="button"
				class="rounded-xl px-3 py-1.5 text-xs font-extrabold transition"
				:class="statusFilter === 'READING' ? 'border border-gold-border bg-gold-soft text-gold-text shadow-xs' : 'bg-elevated text-fg-secondary hover:text-fg'"
				@click="emit('update:statusFilter', 'READING')"
			>
				در حال مطالعه ({{ toPersianDigits(readingCount) }})
			</button>
			<button
				type="button"
				class="rounded-xl px-3 py-1.5 text-xs font-extrabold transition"
				:class="statusFilter === 'COMPLETED' ? 'border border-optimal-border bg-optimal-soft text-optimal shadow-xs' : 'bg-elevated text-fg-secondary hover:text-fg'"
				@click="emit('update:statusFilter', 'COMPLETED')"
			>
				خوانده‌شده ({{ toPersianDigits(completedCount) }})
			</button>
			<button
				v-if="onHoldCount > 0 || statusFilter === 'ON_HOLD'"
				type="button"
				class="rounded-xl px-3 py-1.5 text-xs font-extrabold transition"
				:class="statusFilter === 'ON_HOLD' ? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs' : 'bg-elevated text-fg-secondary hover:text-fg'"
				@click="emit('update:statusFilter', 'ON_HOLD')"
			>
				در نوبت / متوقف ({{ toPersianDigits(onHoldCount) }})
			</button>
		</div>
	</div>
</template>
