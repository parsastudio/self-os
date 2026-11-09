<script setup lang="ts">
import { useAppDatabase } from '~/composables/useAppDatabase';
import { useDexieLiveQuery } from '~/composables/useDexieLiveQuery';
import { useLocalRepository } from '~/composables/useLocalRepository';
import type { CreateMediaInput, MediaCategory, MediaEntity, MediaSortBy, MediaStatusFilter, UpdateMediaInput } from '~/domain/schemas';
import MediaHeaderStats from '~/components/media/MediaHeaderStats.vue';
		<LazyMediaUpsertModal
			v-if="isModalOpen"
import { Clapperboard, Plus } from 'lucide-vue-next';
=======
import MediaItemCard from '~/components/media/MediaItemCard.vue';
import { Clapperboard, Plus } from 'lucide-vue-next';
=======
		<LazyMediaUpsertModal
			v-if="isModalOpen"
import { Clapperboard, Plus } from 'lucide-vue-next';

const db = useAppDatabase();
const localRepo = useLocalRepository();

const mediaItems = useDexieLiveQuery(() => db.media.orderBy('createdAtIso').reverse().toArray(), []);
const isMediaLoading = mediaItems.isLoading;
const mediaError = mediaItems.error;

const categoryFilter = ref<MediaCategory | 'ALL'>('ALL');
const statusFilter = ref<MediaStatusFilter>('ALL');
const sortBy = ref<MediaSortBy>('rating_desc');
const isModalOpen = ref(false);
const isSubmittingMedia = ref(false);
const editingMedia = ref<MediaEntity | null>(null);

const unseenCount = computed(() => mediaItems.value.filter((i) => i.status !== 'completed').length);

const existingSuggestions = computed(() => {
	const map = new Map<string, MediaCategory>();
	for (const m of mediaItems.value) {
		if (!map.has(m.title)) {
			map.set(m.title, m.category);
		}
	}
	return Array.from(map.entries()).map(([title, category]) => ({ title, category }));
});

const filteredItems = computed(() => {
	const list = mediaItems.value.filter((item) => {
		if (categoryFilter.value !== 'ALL' && item.category !== categoryFilter.value) return false;
		if (statusFilter.value === 'UNSEEN' && item.status === 'completed') return false;
		if (statusFilter.value === 'SEEN' && item.status !== 'completed') return false;
		return true;
	});

	return [...list].sort((a, b) => {
		if (sortBy.value === 'rating_desc') {
			const rDiff = (b.rating ?? 0) - (a.rating ?? 0);
			if (rDiff !== 0) return rDiff;
			return b.createdAtIso > a.createdAtIso ? 1 : b.createdAtIso < a.createdAtIso ? -1 : 0;
		}
		if (sortBy.value === 'newest') {
			const dateA = a.finishedAtIso || a.createdAtIso;
			const dateB = b.finishedAtIso || b.createdAtIso;
			return dateB > dateA ? 1 : dateB < dateA ? -1 : 0;
		}
		if (sortBy.value === 'oldest') {
			const dateA = a.finishedAtIso || a.createdAtIso;
			const dateB = b.finishedAtIso || b.createdAtIso;
			return dateA > dateB ? 1 : dateA < dateB ? -1 : 0;
		}
		return a.title.localeCompare(b.title, 'fa');
	});
});

function openCreateModal() {
	editingMedia.value = null;
	isModalOpen.value = true;
}

function openEditModal(item: MediaEntity) {
	editingMedia.value = item;
	isModalOpen.value = true;
}

function closeModal() {
	isModalOpen.value = false;
	editingMedia.value = null;
}

async function handleSaveMedia(payload: CreateMediaInput | UpdateMediaInput) {
	if (isSubmittingMedia.value) return;
	isSubmittingMedia.value = true;
	try {
		if ('mediaId' in payload) {
			await localRepo.media.update(payload);
		} else {
			await localRepo.media.create(payload);
		}
		closeModal();
	} finally {
		isSubmittingMedia.value = false;
	}
}

async function handleUpdateStatus(mediaId: string, status: 'completed') {
	await localRepo.media.updateStatus(mediaId, status);
}

async function handleDeleteMedia(mediaId: string) {
	await localRepo.media.delete(mediaId);
}
</script>

<template>
	<div class="space-y-6 pb-16">
		<MediaHeaderStats
			:total-count="mediaItems.length"
			:unseen-count="unseenCount"
			:category-filter="categoryFilter"
			:status-filter="statusFilter"
			:sort-by="sortBy"
			@update:category-filter="categoryFilter = $event"
			@update:status-filter="statusFilter = $event"
			@update:sort-by="sortBy = $event"
			@open-create="openCreateModal"
		/>

		<div v-if="isMediaLoading" class="space-y-2.5" aria-busy="true">
			<div v-for="idx in 4" :key="idx" class="h-20 animate-pulse rounded-2xl border border-border bg-surface"></div>
		</div>

		<div
			v-else-if="mediaError"
			class="rounded-3xl border border-failed-border bg-surface p-8 text-center shadow-(--shadow-soft)"
		>
			<p class="text-sm font-extrabold text-failed">{{ mediaError }}</p>
		</div>

		<div
			v-else-if="mediaItems.length === 0"
			class="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-surface p-12 text-center"
		>
			<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-elevated text-fg-muted">
				<Clapperboard class="h-8 w-8" />
			</div>
			<h3 class="text-base font-extrabold text-fg">هنوز فیلم، سریال یا انیمه‌ای ثبت نشده است</h3>
			<p class="mt-1.5 text-sm text-fg-muted">برای شروع، اولین اثر را وارد آرشیو خود کنید.</p>
			<button
				type="button"
				class="mt-5 inline-flex h-11 items-center gap-2 rounded-2xl bg-accent px-5 text-xs font-extrabold text-accent-fg shadow-xs transition hover:opacity-90"
				@click="openCreateModal"
			>
				<Plus class="h-4 w-4" />
				<span>ثبت اولین اثر</span>
			</button>
		</div>

		<div v-else-if="filteredItems.length === 0" class="rounded-3xl border border-border bg-surface p-10 text-center text-sm font-semibold text-fg-muted">
			موردی با این فیلتر یافت نشد.
		</div>

		<NuxtErrorBoundary v-else>
			<div class="space-y-2.5">
				<MediaItemCard
					v-for="item in filteredItems"
					:key="item.id"
					:item="item"
					@edit="openEditModal"
					@update-status="handleUpdateStatus"
					@delete="handleDeleteMedia"
				/>
			</div>

			<template #error="{ error, clearError }">
				<div class="rounded-3xl border border-failed-border bg-surface p-6 text-center shadow-(--shadow-soft)">
					<p class="text-sm font-extrabold text-failed">
						{{ error?.message || 'خطا در نمایش آرشیو فیلم و انیمه' }}
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

		<LazyMediaUpsertModal
			v-if="isModalOpen"
			:key="editingMedia?.id ?? 'new'"
			:editing-media="editingMedia"
			:existing-suggestions="existingSuggestions"
			:is-submitting="isSubmittingMedia"
			@submit="handleSaveMedia"
			@close="closeModal"
		/>
	</div>
</template>
