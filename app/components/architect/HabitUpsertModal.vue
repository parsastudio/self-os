<script setup lang="ts">
import { ref, computed } from 'vue';
import type { CreateHabitInput, HabitEntity, HabitStatus, HabitTimeSlot, MutateHabitStructureInput } from '~/domain/schemas';
import BaseModal from '~/components/ui/BaseModal.vue';
import CustomSelect from '~/components/ui/CustomSelect.vue';

type FormStructureKind = 'tiered' | 'composite' | 'interval_cadence';

interface Props {
	mode: 'create' | 'edit';
	editingHabit?: HabitEntity | null;
	hasSubHabits?: boolean;
	initialParentId?: string;
	rootHabits: HabitEntity[];
	isSubmitting?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	editingHabit: null,
	hasSubHabits: false,
	initialParentId: '',
	isSubmitting: false
});

const emit = defineEmits<{
	(e: 'close'): void;
	(e: 'create', payload: CreateHabitInput): void;
	(e: 'update', payload: MutateHabitStructureInput): void;
}>();

const structureKind = ref<FormStructureKind>(
	props.mode === 'edit' && props.editingHabit
		? props.editingHabit.trackingMode === 'interval_cadence'
			? 'interval_cadence'
			: props.hasSubHabits || (!props.editingHabit.bronzeDesc && !props.editingHabit.parentId)
				? 'composite'
				: 'tiered'
		: 'tiered'
);

const selectedParentId = ref(
	props.mode === 'edit' && props.editingHabit ? (props.editingHabit.parentId ?? '') : props.initialParentId
);
const selectedStatus = ref<HabitStatus>(
	props.mode === 'edit' && props.editingHabit ? props.editingHabit.status : 'active'
);
const selectedTimeSlot = ref<HabitTimeSlot>(
	props.mode === 'edit' && props.editingHabit ? (props.editingHabit.timeSlot ?? 'day') : 'day'
);
const isSituational = ref(
	props.mode === 'edit' && props.editingHabit ? Boolean(props.editingHabit.isSituational) : false
);

const title = ref(props.editingHabit?.title ?? '');
const scheduleLabel = ref(props.editingHabit?.scheduleLabel ?? '');
const bronzeDesc = ref(props.editingHabit?.bronzeDesc ?? '');
const silverDesc = ref(props.editingHabit?.silverDesc ?? '');
const goldDesc = ref(props.editingHabit?.goldDesc ?? '');
const emergencyMinDesc = ref(props.editingHabit?.emergencyMinDesc ?? '');
const notes = ref(props.editingHabit?.notes ?? '');
const reason = ref('');

const modalTitle = computed(() =>
	props.mode === 'edit' && props.editingHabit
		? `ویرایش «${props.editingHabit.title}»`
		: selectedParentId.value
			? 'افزودن زیرطرح جدید'
			: 'افزودن طرح جدید'
);

const eligibleParents = computed(() =>
	props.rootHabits.filter(
		(h) => h.trackingMode === 'tiered' && (props.mode === 'create' || h.id !== props.editingHabit?.id)
	)
);

const structureKindOptions = computed(() => {
	const base = [
		{ value: 'tiered', label: 'طرح سطح‌بندی شده (برنز / نقره / طلا)' },
		{ value: 'composite', label: 'مجموعه‌طرح (شامل چند زیرطرح)' }
	];
	if (props.mode === 'create' || props.editingHabit?.trackingMode === 'interval_cadence') {
		base.push({
			value: 'interval_cadence',
			label: 'طرح تکرارشونده (هدف‌گذاری از شب قبل)'
		});
	}
	return base;
});

const parentOptions = computed(() => [
	{ value: '', label: 'طرح اصلی و مستقل' },
	...eligibleParents.value.map((p) => ({ value: p.id, label: `زیرمجموعهٔ «${p.title}»` }))
]);

const statusOptions = [
	{ value: 'active', label: 'فعال' },
	{ value: 'paused', label: 'متوقف موقت' },
	{ value: 'archived', label: 'حذف / بایگانی' }
] as const;

const timeSlotOptions = [
	{ value: 'morning', label: 'صبحگاهی' },
	{ value: 'day', label: 'در طول روز' },
	{ value: 'night', label: 'شبانه' }
] as const;

function handleSubmit() {
	if (!title.value.trim() || props.isSubmitting) return;

	if (props.mode === 'edit' && props.editingHabit) {
		emit('update', {
			habitId: props.editingHabit.id,
			title: title.value.trim(),
			parentId: selectedParentId.value || null,
			category: props.editingHabit.category,
			timeSlot: selectedTimeSlot.value,
			isSituational: isSituational.value,
			status: selectedStatus.value,
			scheduleLabel: scheduleLabel.value.trim() || null,
			notes: notes.value.trim() || null,
			bronzeDesc: bronzeDesc.value.trim() || null,
			silverDesc: silverDesc.value.trim() || null,
			goldDesc: goldDesc.value.trim() || null,
			emergencyMinDesc: emergencyMinDesc.value.trim() || null,
			defaultMinutesPerInterval: 0,
			reason: reason.value.trim() || 'ویرایش قوانین طرح'
		});
	} else {
		emit('create', {
			title: title.value.trim(),
			parentId: selectedParentId.value || null,
			category: 'عمومی',
			trackingMode: structureKind.value === 'interval_cadence' ? 'interval_cadence' : 'tiered',
			timeSlot: selectedTimeSlot.value,
			isSituational: isSituational.value,
			scheduleLabel: scheduleLabel.value.trim() || undefined,
			notes: notes.value.trim() || undefined,
			bronzeDesc: bronzeDesc.value.trim() || undefined,
			silverDesc: silverDesc.value.trim() || undefined,
			goldDesc: goldDesc.value.trim() || undefined,
			emergencyMinDesc: emergencyMinDesc.value.trim() || undefined,
			defaultIntervals: 1,
			defaultMinutesPerInterval: 0,
			cadenceWindowMinutes: 60,
			reason: reason.value.trim() || undefined
		});
	}
}
</script>

<template>
	<BaseModal :title="modalTitle" max-width-class="max-w-xl" @close="emit('close')">
		<form class="space-y-4 overflow-y-auto p-4 sm:space-y-5 sm:p-8" @submit.prevent="handleSubmit">
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div>
					<label for="h-title" class="mb-1.5 block text-sm font-bold text-fg">عنوان طرح</label>
					<input
						id="h-title"
						v-model="title"
						required
						placeholder="مثلاً: مطالعه شبانه"
						class="h-12 w-full rounded-2xl border border-border bg-elevated px-4 text-base font-bold text-fg focus:border-border-strong focus:outline-none"
					/>
				</div>

				<div>
					<label for="h-sched" class="mb-1.5 block text-sm font-bold text-fg">زمان انجام (اختیاری)</label>
					<input
						id="h-sched"
						v-model="scheduleLabel"
						placeholder="مثلاً: بعد از نماز صبح"
						class="h-12 w-full rounded-2xl border border-border bg-elevated px-4 text-base text-fg focus:border-border-strong focus:outline-none"
					/>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div v-if="!selectedParentId">
					<label for="h-kind" class="mb-1.5 block text-sm font-bold text-fg">نوع طرح</label>
					<CustomSelect
						id="h-kind"
						v-model="structureKind"
						:disabled="hasSubHabits"
						:options="structureKindOptions"
						trigger-class="h-12 text-fg"
					/>
				</div>

				<div v-if="structureKind === 'tiered'">
					<label for="h-parent" class="mb-1.5 block text-sm font-bold text-fg">جایگاه در ساختار</label>
					<CustomSelect
						id="h-parent"
						v-model="selectedParentId"
						:options="parentOptions"
						trigger-class="h-12 text-fg"
					/>
				</div>

				<div v-if="structureKind !== 'interval_cadence' && !selectedParentId">
					<label for="h-timeslot" class="mb-1.5 block text-sm font-bold text-fg">بازهٔ زمانی در روز</label>
					<CustomSelect
						id="h-timeslot"
						v-model="selectedTimeSlot"
						:options="timeSlotOptions"
						trigger-class="h-12 text-fg"
					/>
				</div>

				<div v-if="mode === 'edit' && editingHabit">
					<label for="h-status" class="mb-1.5 block text-sm font-bold text-fg">وضعیت طرح</label>
					<CustomSelect
						id="h-status"
						v-model="selectedStatus"
						:options="statusOptions"
						trigger-class="h-12 text-fg"
					/>
				</div>
			</div>

			<!-- شرایط سطوح طرح رتبه‌ای -->
			<div v-if="structureKind === 'tiered'" class="space-y-3 rounded-2xl border border-border bg-elevated p-4">
				<div>
					<label for="h-bronze" class="mb-1 block text-xs font-bold text-bronze-text">برنز (حداقل)</label>
					<input
						id="h-bronze"
						v-model="bronzeDesc"
						required
						placeholder="مثلاً: ۵ دقیقه مطالعه"
						class="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold text-fg"
					/>
				</div>

				<div>
					<label for="h-silver" class="mb-1 block text-xs font-bold text-silver-text">نقره (اختیاری)</label>
					<input
						id="h-silver"
						v-model="silverDesc"
						placeholder="مثلاً: ۱۰ دقیقه مطالعه"
						class="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold text-fg"
					/>
				</div>

				<div>
					<label for="h-gold" class="mb-1 block text-xs font-bold text-gold-text">طلا (اختیاری)</label>
					<input
						id="h-gold"
						v-model="goldDesc"
						placeholder="مثلاً: ۲۰ دقیقه مطالعه"
						class="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold text-fg"
					/>
				</div>

				<label class="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 transition hover:border-border-strong">
					<input
						v-model="isSituational"
						type="checkbox"
						class="h-4.5 w-4.5 shrink-0 rounded-lg accent-accent"
					/>
					<span class="text-xs font-extrabold text-fg">
						طرح موقعیتی (دارای گزینهٔ «پیش نیامد»)
					</span>
				</label>
			</div>

			<!-- تنظیمات حداقل اضطراری طرح ریتمی -->
			<div v-else-if="structureKind === 'interval_cadence'" class="space-y-2 rounded-2xl border border-border bg-elevated p-4">
				<p class="text-xs font-bold text-fg-secondary">
					این طرح فقط در روزهایی که از شب قبل در بخش «تنظیم ریتم فردا» برایش زمان تعیین کنید در صفحه ثبت روزانه و آمار ظاهر می‌شود.
				</p>
				<div>
					<label for="h-emerg" class="mb-1.5 block text-xs font-bold text-fg">حداقل اضطراری (اختیاری)</label>
					<input
						id="h-emerg"
						v-model="emergencyMinDesc"
						placeholder="مثلاً: ۲ دقیقه برای روزهای شلوغ"
						class="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold text-fg"
					/>
				</div>
			</div>

			<div>
				<label for="h-notes" class="mb-1.5 block text-sm font-bold text-fg">تبصره یا توضیح کوتاه (اختیاری)</label>
				<input
					id="h-notes"
					v-model="notes"
					placeholder="مثلاً: اگر مهمان داشتیم استثناست..."
					class="h-12 w-full rounded-2xl border border-border bg-elevated px-4 text-sm text-fg"
				/>
			</div>

			<div v-if="mode === 'edit'" class="rounded-2xl border border-accent-border bg-accent-soft p-4">
				<label for="h-reason-edit" class="mb-1.5 block text-sm font-extrabold text-accent-text">
					دلیل این تغییر چیست؟ (برای ثبت در تاریخچه وقایع)
				</label>
				<input
					id="h-reason-edit"
					v-model="reason"
					required
					placeholder="مثلاً: تغییر شرایط مطالعه یا افزایش ظرفیت روزانه..."
					class="h-12 w-full rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-fg focus:border-border-strong focus:outline-none"
				/>
			</div>

			<div class="flex items-center justify-end gap-3 border-t border-border pt-5">
				<button
					type="button"
					class="h-12 rounded-2xl px-5 text-sm font-bold text-fg-secondary hover:bg-elevated"
					@click="emit('close')"
				>
					انصراف
				</button>
				<button
					type="submit"
					:disabled="isSubmitting"
					class="h-12 rounded-2xl bg-accent px-8 text-sm font-extrabold text-accent-fg disabled:opacity-60 shadow-xs transition hover:opacity-90 active:scale-98"
				>
					{{ isSubmitting ? 'در حال ذخیره...' : mode === 'create' ? 'ایجاد طرح' : 'ذخیره تغییرات' }}
				</button>
			</div>
		</form>
	</BaseModal>
</template>
