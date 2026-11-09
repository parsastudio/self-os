<script setup lang="ts">
import { toPersianDigits } from '~/domain/calendar';
import { MEDIA_CATEGORY_OPTIONS } from '~/domain/constants';
import type { MediaCategory, MediaSortBy, MediaStatusFilter } from '~/domain/schemas';
import { Clapperboard, Plus } from 'lucide-vue-next';

interface Props {
	totalCount: number;
	unseenCount: number;
	categoryFilter: MediaCategory | 'ALL';
	statusFilter: MediaStatusFilter;
	sortBy: MediaSortBy;
}

defineProps<Props>();

const emit = defineEmits<{
	(e: 'update:categoryFilter', val: MediaCategory | 'ALL'): void;
	(e: 'update:statusFilter', val: MediaStatusFilter): void;
	(e: 'update:sortBy', val: MediaSortBy): void;
	(e: 'openCreate'): void;
}>();

const sortOptions: ReadonlyArray<{ value: MediaSortBy; label: string }> = [
	{ value: 'rating_desc', label: 'بیشترین امتیاز' },
	{ value: 'newest', label: 'جدیدترین‌ها' },
	{ value: 'oldest', label: 'قدیمی‌ترین‌ها' },
	{ value: 'title_asc', label: 'حروف الفبا' }
];
</script>

<template>
	<div class="space-y-4 rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) sm:px-6">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div class="flex items-center gap-3">
				<div class="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text">
					<Clapperboard class="h-5 w-5" />
				</div>
				<div class="flex items-baseline gap-2.5">
					<h1 class="text-lg font-black tracking-tight text-fg sm:text-xl">فیلم، سریال و انیمه</h1>
					<span class="text-xs font-bold text-fg-muted">({{ toPersianDigits(totalCount) }} اثر)</span>
				</div>
			</div>

			<div class="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
				<button
					type="button"
					class="flex h-10 items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-xs font-extrabold text-accent-fg shadow-xs transition hover:opacity-90 active:scale-98 sm:order-last"
					@click="emit('openCreate')"
				>
					<Plus class="h-4 w-4" />
					<span>ثبت اثر جدید</span>
				</button>

				<div class="flex w-full items-center gap-1 rounded-2xl border border-border bg-elevated p-1 sm:w-auto">
					<button
						type="button"
						class="flex-1 rounded-xl px-2.5 py-1.5 text-xs font-extrabold transition sm:flex-initial sm:px-3"
						:class="statusFilter === 'ALL' ? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs' : 'text-fg-secondary hover:text-fg'"
						@click="emit('update:statusFilter', 'ALL')"
					>
						همه
					</button>
					<button
						type="button"
						class="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-extrabold whitespace-nowrap transition sm:flex-initial sm:px-3"
						:class="statusFilter === 'UNSEEN' ? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs' : 'text-fg-secondary hover:text-fg'"
						@click="emit('update:statusFilter', 'UNSEEN')"
					>
						<span>فقط ندیده‌ها</span>
						<span v-if="unseenCount > 0" class="rounded-full bg-surface px-1.5 py-0.2 text-[10px] font-black text-fg-secondary">
							{{ toPersianDigits(unseenCount) }}
						</span>
					</button>
					<button
						type="button"
						class="flex-1 rounded-xl px-2.5 py-1.5 text-xs font-extrabold whitespace-nowrap transition sm:flex-initial sm:px-3"
						:class="statusFilter === 'SEEN' ? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs' : 'text-fg-secondary hover:text-fg'"
						@click="emit('update:statusFilter', 'SEEN')"
					>
						دیده شده‌ها
					</button>
				</div>

				<div class="w-full sm:w-40">
					<UiCustomSelect
						:model-value="sortBy"
						:options="sortOptions"
						trigger-class="h-10 text-xs font-extrabold text-fg"
						@select="emit('update:sortBy', $event as MediaSortBy)"
					/>
				</div>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-1.5 border-t border-border pt-3.5">
			<button
				type="button"
				class="rounded-xl px-3 py-1.5 text-xs font-extrabold transition"
				:class="categoryFilter === 'ALL' ? 'bg-accent text-accent-fg shadow-xs' : 'bg-elevated text-fg-secondary hover:text-fg'"
				@click="emit('update:categoryFilter', 'ALL')"
			>
				همه دسته‌ها
			</button>
			<button
				v-for="cat in MEDIA_CATEGORY_OPTIONS"
				:key="cat.value"
				type="button"
				class="rounded-xl px-3 py-1.5 text-xs font-extrabold transition"
				:class="categoryFilter === cat.value ? 'bg-accent text-accent-fg shadow-xs' : 'bg-elevated text-fg-secondary hover:text-fg'"
				@click="emit('update:categoryFilter', cat.value)"
			>
				{{ cat.label }}
			</button>
		</div>
	</div>
</template>
