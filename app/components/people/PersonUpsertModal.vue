<script setup lang="ts">
import {
	formatJalaliBirthdayInput,
	parseFlexibleJalaliBirthday,
	toPersianDigits
} from '~/domain/calendar';
import type { PersonEntity, UpsertPersonInput } from '~/domain/schemas';
import { Cake, Phone, Tag, UserRound } from 'lucide-vue-next';

interface Props {
	editingPerson?: PersonEntity | null;
	existingRelations: string[];
	isSubmitting?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	editingPerson: null,
	existingRelations: () => [],
	isSubmitting: false
});

const emit = defineEmits<{
	(e: 'close'): void;
	(e: 'submit', payload: UpsertPersonInput): void;
}>();

const name = ref(props.editingPerson?.name ?? '');
const relation = ref(props.editingPerson?.relation || 'آشنا');
const contactInfo = ref(props.editingPerson?.contactInfo ?? '');
const birthdayInput = ref(
	props.editingPerson
		? toPersianDigits(
				formatJalaliBirthdayInput({
					year: props.editingPerson.birthdayYear,
					month: props.editingPerson.birthdayMonth,
					day: props.editingPerson.birthdayDay
				})
			)
		: ''
);
const notes = ref(props.editingPerson?.notes ?? '');
const validationError = ref<string | null>(null);

function handleSubmit() {
	const normalizedName = name.value.normalize('NFKC').trim();
	if (!normalizedName || props.isSubmitting) return;

	const rawBirthday = birthdayInput.value.trim();
	let parsedBirthday: { year: number | null; month: number; day: number } | null = null;
	if (rawBirthday) {
		parsedBirthday = parseFlexibleJalaliBirthday(rawBirthday);
		if (!parsedBirthday) {
			validationError.value =
				'فرمت تاریخ تولد معتبر نیست (مثال: ۱۳۷۸/۰۵/۱۴ یا بدون سال: ۰۵/۱۴)';
			return;
		}
	}
	validationError.value = null;

	emit('submit', {
		personId: props.editingPerson?.id,
		name: normalizedName,
		relation: relation.value.normalize('NFKC').trim() || 'آشنا',
		contactInfo: contactInfo.value.normalize('NFKC').trim() || undefined,
		birthdayYear: parsedBirthday?.year ?? null,
		birthdayMonth: parsedBirthday?.month ?? null,
		birthdayDay: parsedBirthday?.day ?? null,
		notes: notes.value.normalize('NFKC').trim() || undefined
	});
}
</script>

<template>
	<UiBaseModal
		:title="editingPerson ? `ویرایش «${editingPerson.name}»` : 'افزودن فرد جدید'"
		@close="emit('close')"
	>
		<template #headerIcon>
			<UserRound class="h-4.5 w-4.5" />
		</template>

		<form class="space-y-4 overflow-y-auto p-5 sm:p-6" @submit.prevent="handleSubmit">
			<div
				v-if="validationError"
				class="rounded-2xl border border-failed-border bg-failed-soft px-4 py-2.5 text-xs font-extrabold text-failed"
			>
				{{ validationError }}
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-5">
				<div class="sm:col-span-3">
					<label for="person-name" class="mb-1.5 block text-xs font-bold text-fg-secondary">
						نام و نام خانوادگی
					</label>
					<input
						id="person-name"
						v-model="name"
						required
						maxlength="120"
						placeholder="مثلاً: علی رضایی"
						class="h-11 w-full rounded-2xl border border-border bg-elevated px-4 text-xs font-extrabold text-fg placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:bg-surface focus:outline-none"
					/>
				</div>

				<div class="sm:col-span-2">
					<label
						for="person-relation"
						class="mb-1.5 flex items-center gap-1 text-xs font-bold text-fg-secondary"
					>
						<Tag class="h-3 w-3 text-fg-muted" />
						<span>نسبت / دسته‌بندی</span>
					</label>
					<input
						id="person-relation"
						v-model="relation"
						list="person-relations-list"
						maxlength="60"
						placeholder="دوست / همکار..."
						class="h-11 w-full rounded-2xl border border-border bg-elevated px-3.5 text-xs font-extrabold text-fg placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:bg-surface focus:outline-none"
					/>
					<datalist id="person-relations-list">
						<option v-for="rel in existingRelations" :key="rel" :value="rel" />
					</datalist>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div>
					<label
						for="person-birthday"
						class="mb-1.5 flex items-center gap-1 text-xs font-bold text-fg-secondary"
					>
						<Cake class="h-3.5 w-3.5 text-gold-text" />
						<span>تاریخ تولد شمسی (اختیاری)</span>
					</label>
					<input
						id="person-birthday"
						v-model="birthdayInput"
						v-persian-digits
						dir="ltr"
						placeholder="۱۳۷۸/۰۵/۱۴ یا ۰۵/۱۴"
						class="h-11 w-full rounded-2xl border border-border bg-elevated px-3 text-center font-mono text-xs font-bold text-fg placeholder:font-sans placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:bg-surface focus:outline-none"
					/>
				</div>

				<div>
					<label
						for="person-contact"
						class="mb-1.5 flex items-center gap-1 text-xs font-bold text-fg-secondary"
					>
						<Phone class="h-3.5 w-3.5 text-accent-text" />
						<span>شماره / آیدی ارتباطی (اختیاری)</span>
					</label>
					<input
						id="person-contact"
						v-model="contactInfo"
						dir="ltr"
						maxlength="250"
						placeholder="0912... یا @username"
						class="h-11 w-full rounded-2xl border border-border bg-elevated px-3.5 text-center font-mono text-xs font-bold text-fg placeholder:font-sans placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:bg-surface focus:outline-none"
					/>
				</div>
			</div>

			<div>
				<label for="person-notes" class="mb-1.5 block text-xs font-bold text-fg-secondary">
					جزئیات، نکات مهم، علایق و نحوه آشنایی
				</label>
				<textarea
					id="person-notes"
					v-model="notes"
					rows="5"
					maxlength="10000"
					placeholder="کجا آشنا شدیم، شغل و مهارت‌ها، علایق یا ایده هدیه، نکات مهمی که نباید فراموش شود..."
					class="w-full rounded-2xl border border-border bg-elevated p-3.5 text-xs leading-6 text-fg placeholder:text-fg-muted focus:border-border-strong focus:bg-surface focus:outline-none"
				></textarea>
			</div>

			<div class="flex items-center justify-end gap-2.5 pt-1">
				<button
					type="button"
					class="h-10 rounded-xl px-4 text-xs font-bold text-fg-secondary hover:bg-elevated"
					@click="emit('close')"
				>
					انصراف
				</button>
				<button
					type="submit"
					:disabled="isSubmitting"
					class="h-10 rounded-xl bg-accent px-6 text-xs font-extrabold text-accent-fg shadow-xs transition hover:opacity-90 disabled:opacity-60"
				>
					{{ isSubmitting ? 'در حال ثبت...' : editingPerson ? 'ذخیره تغییرات' : 'ثبت فرد' }}
				</button>
			</div>
		</form>
	</UiBaseModal>
</template>
