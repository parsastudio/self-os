<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppDatabase } from '~/composables/useAppDatabase';
import { useDexieLiveQuery } from '~/composables/useDexieLiveQuery';
import { formatJalaliHuman, isoToJalaliSlash, toPersianDigits } from '~/domain/calendar';
import { getDayStatusMeta } from '~/domain/constants';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, BookHeart, Calendar, Search } from 'lucide-vue-next';

const db = useAppDatabase();
const entries = useDexieLiveQuery(
	() =>
		db.dailyEntries
			.filter((e) => Boolean(e.journalText && e.journalText.trim().length > 0))
			.toArray(),
	[]
);
const isEntriesLoading = entries.isLoading;

const sortOrder = ref<'desc' | 'asc'>('desc');
const searchQuery = ref('');

const displayedMemories = computed(() => {
	const q = searchQuery.value.trim().toLowerCase();
	const filtered = q
		? entries.value.filter((m) => m.journalText?.toLowerCase().includes(q))
		: entries.value;

	return [...filtered].sort((a, b) => {
		if (a.dateIso === b.dateIso) return 0;
		if (sortOrder.value === 'desc') return b.dateIso > a.dateIso ? 1 : -1;
		return a.dateIso > b.dateIso ? 1 : -1;
	});
});
</script>

<template>
	<div class="space-y-8 pb-16">
		<div class="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) sm:px-7">
			<div class="flex items-center gap-3.5">
				<div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text">
					<BookHeart class="h-6 w-6" />
				</div>
				<div>
					<h1 class="text-xl font-black tracking-tight text-fg sm:text-2xl">دفتر خاطرات</h1>
					<span class="text-xs font-bold text-fg-secondary">
						{{ toPersianDigits(entries.length) }} خاطره ثبت‌شده
					</span>
				</div>
			</div>

			<div class="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
				<div v-if="entries.length > 1" class="relative w-full sm:w-auto">
					<Search class="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-fg-muted" />
					<input
						v-model="searchQuery"
						type="search"
						placeholder="جستجو در خاطرات..."
						class="h-11 w-full rounded-2xl border border-border bg-elevated pr-9 pl-3.5 text-xs font-bold text-fg placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:outline-none sm:w-56"
					/>
				</div>

				<div class="flex w-full items-center gap-1 rounded-2xl border border-border bg-elevated p-1 sm:w-auto">
					<button
						type="button"
						class="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition sm:flex-initial sm:px-3.5"
						:class="
							sortOrder === 'desc'
								? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs'
								: 'text-fg-secondary hover:text-fg'
						"
						@click="sortOrder = 'desc'"
					>
						<ArrowDownWideNarrow class="h-3.5 w-3.5 shrink-0" />
						<span>جدید به قدیم</span>
					</button>
					<button
						type="button"
						class="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition sm:flex-initial sm:px-3.5"
						:class="
							sortOrder === 'asc'
								? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs'
								: 'text-fg-secondary hover:text-fg'
						"
						@click="sortOrder = 'asc'"
					>
						<ArrowUpNarrowWide class="h-3.5 w-3.5 shrink-0" />
						<span>قدیم به جدید</span>
					</button>
				</div>
			</div>
		</div>

		<div v-if="isEntriesLoading" class="mx-auto max-w-3xl space-y-5" aria-busy="true">
			<div v-for="idx in 3" :key="idx" class="h-44 animate-pulse rounded-3xl border border-border bg-surface"></div>
		</div>

		<div
			v-else-if="entries.length === 0"
			class="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-surface p-12 text-center"
		>
			<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-elevated text-fg-muted">
				<BookHeart class="h-8 w-8" />
			</div>
			<h2 class="text-base font-extrabold text-fg">هنوز خاطره‌ای ثبت نشده است</h2>
			<p class="mt-1.5 text-sm text-fg-muted">
				در صفحهٔ «ثبت روزانه» می‌توانید پایین فهرست طرح‌ها خاطره هر روز را بنویسید.
			</p>
			<NuxtLink
				to="/"
				class="mt-5 inline-flex h-11 items-center rounded-2xl bg-accent px-5 text-xs font-extrabold text-accent-fg transition hover:opacity-90 shadow-xs"
			>
				ثبت اولین خاطره
			</NuxtLink>
		</div>

		<div v-else-if="displayedMemories.length === 0" class="rounded-3xl border border-border bg-surface p-10 text-center text-sm text-fg-muted">
			موردی مطابق با عبارت جستجو شده یافت نشد.
		</div>

		<div v-else class="mx-auto max-w-3xl space-y-5">
			<article
				v-for="item in displayedMemories"
				:key="item.dateIso"
				class="group rounded-3xl border border-border bg-surface p-6 shadow-(--shadow-soft) transition hover:border-border-strong sm:p-8"
			>
				<header class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
					<div class="flex items-center gap-3">
						<span
							class="h-2.5 w-2.5 rounded-full"
							:class="getDayStatusMeta(item.dayStatus).dotClass"
							title="وضعیت روز"
						></span>
						<h2 class="text-lg font-black text-fg">{{ formatJalaliHuman(item.dateIso).fullLabel }}</h2>
					</div>

					<NuxtLink
						:to="`/?date=${item.dateIso}`"
						class="flex items-center gap-1.5 rounded-xl border border-border bg-elevated px-3 py-1.5 font-mono text-xs font-bold text-fg-secondary transition hover:border-border-strong hover:text-fg"
						title="مشاهده یا ویرایش این روز"
					>
						<Calendar class="h-3.5 w-3.5 text-fg-muted" />
						<span dir="ltr">{{ toPersianDigits(isoToJalaliSlash(item.dateIso)) }}</span>
					</NuxtLink>
				</header>

				<p class="whitespace-pre-line text-base leading-8 font-normal text-fg select-text">
					{{ item.journalText }}
				</p>

				<footer v-if="item.tags.length > 0" class="mt-5 flex flex-wrap gap-1.5 pt-2">
					<span
						v-for="tag in item.tags"
						:key="tag"
						class="rounded-xl bg-elevated px-2.5 py-1 text-[11px] font-bold text-fg-secondary"
					>
						#{{ tag }}
					</span>
				</footer>
			</article>
		</div>
	</div>
</template>
