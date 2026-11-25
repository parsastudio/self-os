<script setup lang="ts">
import {
	isoToJalaliParts,
	isoToJalaliSlash,
	jalaliPartsToIso,
	jalaliSlashToIso,
	toPersianDigits
} from '~/domain/calendar';
import type {
	CalendarEventEntity,
	CreateCalendarEventInput,
	UpdateCalendarEventInput
} from '~/domain/schemas';
import { CalendarDays } from 'lucide-vue-next';

interface Props {
	defaultDateIso: string;
	editingEvent?: CalendarEventEntity | null;
	isSubmitting?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	editingEvent: null,
	isSubmitting: false
});

const emit = defineEmits<{
	(e: 'close'): void;
	(e: 'submit', payload: CreateCalendarEventInput | UpdateCalendarEventInput): void;
}>();

function resolveInitialDateIso(): string {
	if (props.editingEvent?.dateIso) return props.editingEvent.dateIso;
	if (props.editingEvent) {
		const refYear = isoToJalaliParts(props.defaultDateIso).jy;
		return (
			jalaliPartsToIso({
				jy: refYear,
				jm: props.editingEvent.jalaliMonth,
				jd: props.editingEvent.jalaliDay
			}) ?? props.defaultDateIso
		);
	}
	return props.defaultDateIso;
}

const title = ref(props.editingEvent?.title ?? '');
const jalaliDate = ref(toPersianDigits(isoToJalaliSlash(resolveInitialDateIso())));
const isAnnual = ref(props.editingEvent?.isAnnual ?? false);
const notes = ref(props.editingEvent?.notes ?? '');
const validationError = ref<string | null>(null);

const defaultPlaceholderJalali = computed(() =>
	toPersianDigits(isoToJalaliSlash(props.defaultDateIso))
);

function handleSubmit() {
	const normalizedTitle = title.value.normalize('NFKC').trim();
	if (!normalizedTitle || props.isSubmitting) return;

	const resolvedIso = jalaliSlashToIso(jalaliDate.value);
	if (!resolvedIso) {
		validationError.value = 'فرمت تاریخ معتبر نیست (مثال: ۱۴۰۵/۰۱/۱۵)';
		return;
	}
	validationError.value = null;

	const basePayload: CreateCalendarEventInput = {
		title: normalizedTitle,
		isAnnual: isAnnual.value,
		dateIso: resolvedIso,
		notes: notes.value.normalize('NFKC').trim() || undefined
	};

	emit(
		'submit',
		props.editingEvent ? { ...basePayload, eventId: props.editingEvent.id } : basePayload
	);
}
</script>

<template>
	<UiBaseModal
		:title="editingEvent ? 'ویرایش رویداد و جزئیات' : 'ثبت رویداد جدید'"
		@close="emit('close')"
	>
		<template #headerIcon>
			<CalendarDays class="h-4.5 w-4.5" />
		</template>

		<form class="space-y-4 overflow-y-auto p-5 sm:p-6" @submit.prevent="handleSubmit">
			<div
				v-if="validationError"
				class="rounded-2xl border border-failed-border bg-failed-soft px-4 py-2.5 text-xs font-extrabold text-failed"
			>
				{{ validationError }}
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<div class="sm:col-span-2">
					<label for="ev-title" class="mb-1.5 block text-xs font-bold text-fg-secondary">
						عنوان رویداد
					</label>
					<input
						id="ev-title"
						v-model="title"
						required
						maxlength="200"
						placeholder="مثلاً: تولد، تحویل پروژه، جلسه..."
						class="h-11 w-full rounded-2xl border border-border bg-elevated px-4 text-xs font-bold text-fg placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:bg-surface focus:outline-none"
					/>
				</div>

				<div>
					<label for="ev-date" class="mb-1.5 block text-xs font-bold text-fg-secondary">
						تاریخ شمسی
					</label>
					<input
						id="ev-date"
						v-model="jalaliDate"
						v-persian-digits
						dir="ltr"
						required
						:placeholder="defaultPlaceholderJalali"
						class="h-11 w-full rounded-2xl border border-border bg-elevated px-3 text-center font-mono text-xs font-bold text-fg placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:bg-surface focus:outline-none"
					/>
				</div>
			</div>

			<div>
				<label for="ev-notes" class="mb-1.5 block text-xs font-bold text-fg-secondary">
					جزئیات و توضیحات (اختیاری)
				</label>
				<textarea
					id="ev-notes"
					v-model="notes"
					rows="4"
					maxlength="10000"
					placeholder="ساعت دقیق، آدرس، لینک، فهرست کارها یا نکات مهم این رویداد را اینجا بنویسید..."
					class="w-full rounded-2xl border border-border bg-elevated p-3.5 text-xs leading-6 text-fg placeholder:text-fg-muted focus:border-border-strong focus:bg-surface focus:outline-none"
				></textarea>
			</div>

			<label class="flex cursor-pointer items-center gap-2.5 rounded-2xl border border-border bg-elevated px-4 py-3 text-xs font-bold text-fg transition hover:border-border-strong">
				<input
					v-model="isAnnual"
					type="checkbox"
					class="h-4 w-4 shrink-0 rounded accent-accent"
				/>
				<span>تکرار هرساله در همین تاریخ شمسی</span>
			</label>

			<div class="flex items-center justify-end gap-2.5 pt-1">
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
					{{ isSubmitting ? 'در حال ثبت...' : editingEvent ? 'ذخیره تغییرات' : 'ثبت رویداد' }}
				</button>
			</div>
		</form>
	</UiBaseModal>
</template>
