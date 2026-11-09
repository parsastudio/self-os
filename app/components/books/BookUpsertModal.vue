<script setup lang="ts">
import { isoToJalaliSlash, toPersianDigits, validateJalaliDateRange } from '~/domain/calendar';
import { BOOK_RATING_OPTIONS, BOOK_STATUS_OPTIONS } from '~/domain/constants';
import type { BookEntity, BookStatus, CreateBookInput, UpdateBookInput } from '~/domain/schemas';
import { BookOpen, History } from 'lucide-vue-next';

interface Props {
	todayIso: string;
	editingBook?: BookEntity | null;
	existingSuggestions?: Array<{ title: string; author: string | null }>;
	isSubmitting?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	editingBook: null,
	existingSuggestions: () => [],
	isSubmitting: false
});

const emit = defineEmits<{
	(e: 'close'): void;
	(e: 'submit', payload: CreateBookInput | UpdateBookInput): void;
}>();

const defaultJalaliToday = computed(() => toPersianDigits(isoToJalaliSlash(props.todayIso)));
const initialStatus: BookStatus = props.editingBook?.status ?? 'completed';

const title = ref(props.editingBook?.title ?? '');
const author = ref(props.editingBook?.author ?? '');
const selectedStatus = ref<BookStatus>(initialStatus);
const selectedRating = ref<number>(props.editingBook?.rating ?? 5);
const startedJalali = ref(
	props.editingBook?.startedAtIso ? toPersianDigits(isoToJalaliSlash(props.editingBook.startedAtIso)) : ''
);
const finishedJalali = ref(
	props.editingBook?.finishedAtIso
		? toPersianDigits(isoToJalaliSlash(props.editingBook.finishedAtIso))
		: initialStatus === 'completed'
			? defaultJalaliToday.value
			: ''
);

watch(selectedStatus, (nextStatus) => {
	if (nextStatus === 'completed' && !finishedJalali.value.trim()) {
		finishedJalali.value = defaultJalaliToday.value;
	} else if (nextStatus !== 'completed' && !props.editingBook?.finishedAtIso) {
		finishedJalali.value = '';
	}
});
const notes = ref(props.editingBook?.notes ?? '');
const validationError = ref<string | null>(null);

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
	if (match && match.author && !props.editingBook) {
		author.value = match.author;
	}
}

function handleSubmit() {
	if (!title.value.trim() || props.isSubmitting) return;

	const effectiveFinishedJalali =
		selectedStatus.value === 'completed' ? finishedJalali.value.trim() : '';

	const rangeCheck = validateJalaliDateRange({
		startedJalali: startedJalali.value,
		finishedJalali: effectiveFinishedJalali
	});
	if (!rangeCheck.valid) {
		validationError.value = rangeCheck.error ?? 'تاریخ وارد شده نامعتبر است';
		return;
	}
	validationError.value = null;

	if (props.editingBook) {
		emit('submit', {
			bookId: props.editingBook.id,
			title: title.value.trim(),
			author: author.value.trim() || undefined,
			status: selectedStatus.value,
			startedJalali: startedJalali.value.trim() || undefined,
			finishedJalali: effectiveFinishedJalali || undefined,
			rating: selectedRating.value,
			notes: notes.value.trim() || undefined
		});
	} else {
		emit('submit', {
			title: title.value.trim(),
			author: author.value.trim() || undefined,
			status: selectedStatus.value,
			startedJalali: startedJalali.value.trim() || undefined,
			finishedJalali: effectiveFinishedJalali || undefined,
			rating: selectedRating.value,
			notes: notes.value.trim() || undefined
		});
	}
}
</script>

<template>
	<UiBaseModal :title="editingBook ? 'ویرایش اطلاعات کتاب' : 'افزودن کتاب جدید'" @close="emit('close')">
		<template #headerIcon>
			<BookOpen class="h-4.5 w-4.5" />
		</template>

		<form class="space-y-4 overflow-y-auto p-5 sm:p-6" @submit.prevent="handleSubmit">
			<div
				v-if="validationError"
				class="rounded-2xl border border-failed-border bg-failed-soft px-4 py-2.5 text-xs font-extrabold text-failed"
			>
				{{ validationError }}
			</div>

			<div>
				<div class="mb-1.5 flex items-center justify-between">
					<label for="bk-title" class="block text-xs font-bold text-fg-secondary">نام کتاب</label>
					<span
						v-if="matchedSuggestion && !editingBook"
						class="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-[10px] font-black text-accent-text"
					>
						<History class="h-3 w-3" />
						<span>قبلاً در کتابخانه ثبت شده (خواندن مجدد)</span>
					</span>
				</div>

				<input
					id="bk-title"
					v-model="title"
					list="existing-books-datalist"
					required
					placeholder="مثلاً: عادت‌های اتمی یا صحیفه سجادیه..."
					class="h-11 w-full rounded-2xl border border-border bg-elevated px-4 text-xs font-bold text-fg placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
					@input="handleTitleChange"
				/>

				<datalist id="existing-books-datalist">
					<option v-for="s in existingSuggestions" :key="s.title" :value="s.title">
						{{ s.author ? `اثر: ${s.author}` : '' }}
					</option>
				</datalist>
			</div>

			<div>
				<label for="bk-author" class="mb-1.5 block text-xs font-bold text-fg-secondary">نویسنده / مترجم</label>
				<input
					id="bk-author"
					v-model="author"
					placeholder="مثلاً: جیمز کلیر"
					class="h-11 w-full rounded-2xl border border-border bg-elevated px-4 text-xs text-fg placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
				/>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="bk-status" class="mb-1.5 block text-xs font-bold text-fg-secondary">وضعیت</label>
					<UiCustomSelect
						id="bk-status"
						v-model="selectedStatus"
						:options="BOOK_STATUS_OPTIONS"
						trigger-class="text-fg"
					/>
				</div>
				<div>
					<label for="bk-rating" class="mb-1.5 block text-xs font-bold text-fg-secondary">امتیاز</label>
					<UiCustomSelect
						id="bk-rating"
						v-model="selectedRating"
						:options="BOOK_RATING_OPTIONS"
						trigger-class="text-gold"
					/>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="bk-start" class="mb-1.5 block text-xs font-bold text-fg-secondary">تاریخ شروع</label>
					<input
						id="bk-start"
						v-model="startedJalali"
						v-persian-digits
						dir="ltr"
						:placeholder="defaultJalaliToday"
						class="h-11 w-full rounded-2xl border border-border bg-elevated px-3 text-center font-mono text-xs font-bold text-fg placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
					/>
				</div>
				<div>
					<label for="bk-end" class="mb-1.5 block text-xs font-bold text-fg-secondary">تاریخ اتمام</label>
					<input
						id="bk-end"
						v-model="finishedJalali"
						v-persian-digits
						dir="ltr"
						class="h-11 w-full rounded-2xl border border-border bg-elevated px-3 text-center font-mono text-xs font-bold text-fg focus:border-border-strong focus:outline-none"
					/>
				</div>
			</div>

			<div>
				<label for="bk-notes" class="mb-1.5 block text-xs font-bold text-fg-secondary">
					یادداشت (اختیاری)
				</label>
				<textarea
					id="bk-notes"
					v-model="notes"
					rows="3"
					placeholder="مثلاً: نوبت دوم مطالعه در سال ۱۴۰۵ / نکات مهم فصل سوم..."
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
					{{ isSubmitting ? 'در حال ثبت...' : editingBook ? 'ذخیره تغییرات' : 'ثبت در کتابخانه' }}
				</button>
			</div>
		</form>
	</UiBaseModal>
</template>
