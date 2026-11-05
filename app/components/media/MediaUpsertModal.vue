<script setup lang="ts">
import { ref, computed } from 'vue';
import { getTodayIso, isoToJalaliSlash, toPersianDigits } from '~/domain/calendar';
import { BOOK_RATING_OPTIONS, MEDIA_CATEGORY_OPTIONS, MEDIA_STATUS_OPTIONS } from '~/domain/constants';
import type { MediaCategory, MediaEntity, MediaStatus } from '~/domain/schemas';
import BaseModal from '~/components/ui/BaseModal.vue';
import CustomSelect from '~/components/ui/CustomSelect.vue';
import { useLocalRepository } from '~/composables/useLocalRepository';
import { useSyncEngine } from '~/composables/useSyncEngine';
import { Clapperboard, History } from 'lucide-vue-next';

interface Props {
	editingMedia?: MediaEntity | null;
	existingSuggestions?: Array<{ title: string; category: MediaCategory }>;
}

const props = withDefaults(defineProps<Props>(), {
	editingMedia: null,
	existingSuggestions: () => []
});

const emit = defineEmits<{
	(e: 'close'): void;
}>();

const localRepo = useLocalRepository();
const syncEngine = useSyncEngine();

const defaultJalaliToday = toPersianDigits(isoToJalaliSlash(getTodayIso()));
const initialStatus: MediaStatus = props.editingMedia?.status ?? 'completed';

const title = ref(props.editingMedia?.title ?? '');
const selectedCategory = ref<MediaCategory>(props.editingMedia?.category ?? 'movie');
const selectedStatus = ref<MediaStatus>(initialStatus);
const selectedRating = ref<number>(props.editingMedia?.rating ?? 5);
const startedJalali = ref(
	props.editingMedia?.startedAtIso ? toPersianDigits(isoToJalaliSlash(props.editingMedia.startedAtIso)) : ''
);
const finishedJalali = ref(
	props.editingMedia?.finishedAtIso
		? toPersianDigits(isoToJalaliSlash(props.editingMedia.finishedAtIso))
		: initialStatus === 'completed'
			? defaultJalaliToday
			: ''
);
const notes = ref(props.editingMedia?.notes ?? '');
const isSubmitting = ref(false);

const matchedSuggestion = computed(() =>
	props.existingSuggestions.find(
		(s) => s.title.trim().toLowerCase() === title.value.trim().toLowerCase()
	)
);

function handleTitleChange(e: Event) {
	const val = (e.target as HTMLInputElement).value;
	title.value = val;
	const match = props.existingSuggestions.find(
		(s) => s.title.trim().toLowerCase() === val.trim().toLowerCase()
	);
	if (match && !props.editingMedia) {
		selectedCategory.value = match.category;
	}
}

async function handleSubmit() {
	if (!title.value.trim() || isSubmitting.value) return;
	isSubmitting.value = true;

	try {
		if (props.editingMedia) {
			await localRepo.media.update({
				mediaId: props.editingMedia.id,
				title: title.value.trim(),
				category: selectedCategory.value,
				status: selectedStatus.value,
				startedJalali: startedJalali.value.trim() || undefined,
				finishedJalali: finishedJalali.value.trim() || undefined,
				rating: selectedRating.value,
				notes: notes.value.trim() || undefined
			});
		} else {
			await localRepo.media.create({
				title: title.value.trim(),
				category: selectedCategory.value,
				status: selectedStatus.value,
				startedJalali: startedJalali.value.trim() || undefined,
				finishedJalali: finishedJalali.value.trim() || undefined,
				rating: selectedRating.value,
				notes: notes.value.trim() || undefined
			});
		}
		void syncEngine.notifyLocalMutationStaged();
		emit('close');
	} finally {
		isSubmitting.value = false;
	}
}
</script>

<template>
	<BaseModal :title="editingMedia ? 'ویرایش اطلاعات اثر' : 'ثبت اثر جدید'" @close="emit('close')">
		<template #headerIcon>
			<Clapperboard class="h-4.5 w-4.5" />
		</template>

		<form class="space-y-4 overflow-y-auto p-5 sm:p-6" @submit.prevent="handleSubmit">
			<div>
				<span class="mb-1.5 block text-xs font-bold text-fg-secondary">نوع اثر</span>
				<div class="grid grid-cols-4 gap-1.5 rounded-2xl border border-border bg-elevated p-1">
					<button
						v-for="catOpt in MEDIA_CATEGORY_OPTIONS"
						:key="catOpt.value"
						type="button"
						class="h-9 rounded-xl text-xs font-extrabold transition"
						:class="
							selectedCategory === catOpt.value
								? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs'
								: 'text-fg-secondary hover:text-fg'
						"
						@click="selectedCategory = catOpt.value"
					>
						{{ catOpt.label }}
					</button>
				</div>
			</div>

			<div>
				<div class="mb-1.5 flex items-center justify-between">
					<label for="md-title" class="block text-xs font-bold text-fg-secondary">نام اثر</label>
					<span
						v-if="matchedSuggestion && !editingMedia"
						class="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-[10px] font-black text-accent-text"
					>
						<History class="h-3 w-3" />
						<span>قبلاً در آرشیو ثبت شده (تماشای مجدد)</span>
					</span>
				</div>

				<input
					id="md-title"
					v-model="title"
					list="existing-media-datalist"
					required
					placeholder="مثلاً: Interstellar یا Attack on Titan..."
					class="h-11 w-full rounded-2xl border border-border bg-elevated px-4 text-xs font-bold text-fg placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
					@input="handleTitleChange"
				/>

				<datalist id="existing-media-datalist">
					<option v-for="item in existingSuggestions" :key="item.title" :value="item.title" />
				</datalist>
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div>
					<span class="mb-1.5 block text-xs font-bold text-fg-secondary">وضعیت</span>
					<div class="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-elevated p-1">
						<button
							v-for="statusOpt in MEDIA_STATUS_OPTIONS"
							:key="statusOpt.value"
							type="button"
							class="h-9 rounded-xl text-xs font-extrabold transition"
							:class="
								selectedStatus === statusOpt.value
									? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs'
									: 'text-fg-secondary hover:text-fg'
							"
							@click="selectedStatus = statusOpt.value"
						>
							{{ statusOpt.label }}
						</button>
					</div>
				</div>
				<div>
					<label for="md-rating" class="mb-1.5 block text-xs font-bold text-fg-secondary">امتیاز</label>
					<CustomSelect
						id="md-rating"
						v-model="selectedRating"
						:options="BOOK_RATING_OPTIONS"
						trigger-class="text-gold"
					/>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="md-start" class="mb-1.5 block text-xs font-bold text-fg-secondary">تاریخ شروع</label>
					<input
						id="md-start"
						v-model="startedJalali"
						v-persian-digits
						dir="ltr"
						:placeholder="defaultJalaliToday"
						class="h-11 w-full rounded-2xl border border-border bg-elevated px-3 text-center font-mono text-xs font-bold text-fg placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
					/>
				</div>
				<div>
					<label for="md-end" class="mb-1.5 block text-xs font-bold text-fg-secondary">تاریخ تماشا</label>
					<input
						id="md-end"
						v-model="finishedJalali"
						v-persian-digits
						dir="ltr"
						:placeholder="defaultJalaliToday"
						class="h-11 w-full rounded-2xl border border-border bg-elevated px-3 text-center font-mono text-xs font-bold text-fg placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
					/>
				</div>
			</div>

			<div>
				<label for="md-notes" class="mb-1.5 block text-xs font-bold text-fg-secondary">
					یادداشت کوتاه (برداشت، نوبت تماشا، اپیزود یا نکته داستان...)
				</label>
				<textarea
					id="md-notes"
					v-model="notes"
					rows="3"
					placeholder="نظر یا نکته کوتاه درباره این اثر..."
					class="w-full rounded-2xl border border-border bg-elevated p-3.5 text-xs text-fg placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
				></textarea>
			</div>

			<div class="flex items-center justify-end gap-2.5 pt-2">
				<button
					type="button"
					class="h-11 rounded-2xl px-5 text-xs font-bold text-fg-secondary hover:bg-elevated"
					@click="emit('close')"
				>
					انصراف
				</button>
				<button
					type="submit"
					:disabled="isSubmitting"
					class="h-11 rounded-2xl bg-accent px-7 text-xs font-extrabold text-accent-fg shadow-xs transition hover:opacity-90 active:scale-98 disabled:opacity-60"
				>
					{{ isSubmitting ? 'در حال ثبت...' : editingMedia ? 'ذخیره تغییرات' : 'ثبت در آرشیو' }}
				</button>
			</div>
		</form>
	</BaseModal>
</template>
