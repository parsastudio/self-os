<script setup lang="ts">
import { ref } from 'vue';
import { toPersianDigits } from '~/domain/calendar';
import { getDayStatusMeta, getTierBadgeMeta } from '~/domain/constants';
import type { CalendarDayAggregate, CreateCalendarEventInput } from '~/domain/schemas';
import {
	ArrowLeft,
	BookOpen,
	Check,
	Clapperboard,
	Eye,
	Plus,
	Star,
	Trash2
} from 'lucide-vue-next';

interface Props {
	day: CalendarDayAggregate;
	isSubmittingEvent?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	isSubmittingEvent: false
});

const emit = defineEmits<{
	(e: 'createEvent', payload: CreateCalendarEventInput): void;
	(e: 'toggleEventComplete', eventId: string, isCompleted: boolean): void;
	(e: 'deleteEvent', eventId: string): void;
	(e: 'openTrackerDate', dateIso: string): void;
}>();

const isAnnualChecked = ref(false);
const showAddEventForm = ref(false);
const eventTitleInput = ref('');
const eventNotesInput = ref('');
const isModalOpen = ref(false);
const expandedHabitId = ref<string | null>(null);

function handleAddEvent() {
	if (!eventTitleInput.value.trim() || props.isSubmittingEvent) return;

	emit('createEvent', {
		title: eventTitleInput.value.trim(),
		eventType: 'occasion',
		isAnnual: isAnnualChecked.value,
		dateIso: props.day.iso,
		notes: eventNotesInput.value.trim() || undefined
	});

	eventTitleInput.value = '';
	eventNotesInput.value = '';
	isAnnualChecked.value = false;
	showAddEventForm.value = false;
}

function openModalWithHabit(habitId?: string) {
	expandedHabitId.value = habitId ?? null;
	isModalOpen.value = true;
}

function closeModal() {
	isModalOpen.value = false;
	expandedHabitId.value = null;
}
</script>

<template>
	<aside class="space-y-4 rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
		<div class="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
			<div>
				<div class="flex items-center gap-2">
					<span
						v-if="day.entry"
						class="h-3 w-3 shrink-0 rounded-full"
						:class="getDayStatusMeta(day.entry.dayStatus).dotClass"
					></span>
					<h2 class="text-lg font-black text-fg sm:text-xl">{{ day.fullHumanLabel }}</h2>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<button
					type="button"
					class="flex h-10 items-center gap-1.5 rounded-2xl bg-accent px-3.5 text-xs font-extrabold text-accent-fg shadow-xs transition hover:opacity-90"
					@click="showAddEventForm = !showAddEventForm"
				>
					<Plus class="h-4 w-4" />
					<span>ثبت رویداد</span>
				</button>

				<button
					type="button"
					class="flex h-10 items-center gap-1 rounded-2xl border border-border bg-elevated px-3 text-xs font-extrabold text-fg transition hover:border-border-strong"
					title="باز کردن در صفحه ثبت روزانه"
					@click="emit('openTrackerDate', day.iso)"
				>
					<span>ثبت روزانه</span>
					<ArrowLeft class="h-3.5 w-3.5" />
				</button>
			</div>
		</div>

		<!-- فرم افزودن رویداد به این تاریخ -->
		<form
			v-if="showAddEventForm"
			class="space-y-3 rounded-2xl border border-accent-border bg-accent-soft p-4"
			@submit.prevent="handleAddEvent"
		>
			<div>
				<input
					v-model="eventTitleInput"
					required
					placeholder="مثلاً: تولد، تحویل پروژه، سالگرد..."
					class="h-10 w-full rounded-xl border border-border bg-surface px-3.5 text-xs font-bold text-fg placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
				/>
			</div>

			<div>
				<input
					v-model="eventNotesInput"
					placeholder="توضیح کوتاه (اختیاری)..."
					class="h-9 w-full rounded-xl border border-border bg-surface px-3.5 text-xs text-fg placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
				/>
			</div>

			<div class="flex flex-wrap items-center justify-between gap-2 pt-1">
				<label class="flex cursor-pointer items-center gap-2 text-xs font-bold text-fg">
					<input v-model="isAnnualChecked" type="checkbox" class="h-4 w-4 rounded accent-accent" />
					<span>تکرار هرساله در همین تاریخ شمسی</span>
				</label>

				<div class="flex items-center gap-1.5">
					<button
						type="button"
						class="h-9 rounded-xl px-3 text-xs font-bold text-fg-secondary hover:bg-surface"
						@click="showAddEventForm = false"
					>
						لغو
					</button>
					<button
						type="submit"
						:disabled="isSubmittingEvent"
						class="h-9 rounded-xl bg-accent px-4 text-xs font-extrabold text-accent-fg disabled:opacity-60"
					>
						{{ isSubmittingEvent ? 'در حال ثبت...' : 'ذخیره رویداد' }}
					</button>
				</div>
			</div>
		</form>

		<!-- فهرست رویدادهای این روز -->
		<div class="space-y-3">
			<h3 class="text-xs font-extrabold text-fg-secondary">رویدادها و مناسبت‌های این روز</h3>
			<div
				v-if="day.events.length === 0"
				class="rounded-2xl border border-dashed border-border bg-elevated p-4 text-center text-xs text-fg-muted"
			>
				رویداد یا مناسبتی برای این تاریخ ثبت نشده است.
			</div>
			<div v-else class="space-y-2">
				<div
					v-for="ev in day.events"
					:key="ev.id"
					class="flex items-center justify-between gap-3 rounded-2xl border border-accent-border bg-accent-soft p-3 text-accent-text"
				>
					<div class="min-w-0 space-y-0.5">
						<div class="flex flex-wrap items-center gap-2">
							<span class="text-sm font-black text-fg" :class="{ 'line-through opacity-75': ev.isCompleted }">
								{{ ev.title }}
							</span>
							<span v-if="ev.isAnnual" class="rounded-lg border border-current px-2 py-0.5 text-[10px] font-extrabold">
								هرساله
							</span>
						</div>
						<p v-if="ev.notes" class="text-xs opacity-90">{{ ev.notes }}</p>
					</div>

					<div class="flex shrink-0 items-center gap-1.5">
						<button
							v-if="!ev.isAnnual"
							type="button"
							class="flex h-8 w-8 items-center justify-center rounded-xl border border-current bg-surface text-fg transition hover:scale-105 active:scale-95"
							:title="ev.isCompleted ? 'انجام شد' : 'علامت انجام شدن'"
							@click="emit('toggleEventComplete', ev.id, !ev.isCompleted)"
						>
							<Check class="h-4 w-4" :class="ev.isCompleted ? 'text-optimal' : 'text-fg-muted'" />
						</button>

						<button
							type="button"
							class="flex h-8 w-8 items-center justify-center rounded-xl bg-surface text-fg-muted transition hover:text-failed active:scale-95"
							title="حذف رویداد"
							@click="emit('deleteEvent', ev.id)"
						>
							<Trash2 class="h-4 w-4" />
						</button>
					</div>
				</div>
			</div>
		</div>

		<!-- فعالیت‌های مطالعه و فیلم این روز -->
		<div v-if="day.booksActivity.length > 0 || day.mediaActivity.length > 0" class="space-y-2.5 border-t border-border pt-4">
			<h3 class="text-xs font-extrabold text-fg-secondary">کتاب‌ها و آثار تماشا شده در این روز</h3>
			<div class="space-y-2">
				<div
					v-for="item in day.booksActivity"
					:key="item.book.id + item.activityKind"
					class="flex items-center justify-between gap-2 rounded-2xl border border-optimal-border bg-optimal-soft px-3.5 py-2.5 text-xs"
				>
					<div class="flex items-center gap-2 font-extrabold text-fg">
						<BookOpen class="h-4 w-4 shrink-0 text-optimal" />
						<span>
							{{ item.activityKind === 'finished' ? 'اتمام کتاب:' : 'شروع کتاب:' }}
							{{ item.book.title }}
						</span>
					</div>
					<span v-if="item.book.rating" class="flex items-center gap-0.5 font-black text-gold-text">
						<Star class="h-3.5 w-3.5 fill-current" />
						{{ toPersianDigits(item.book.rating) }}
					</span>
				</div>

				<div
					v-for="item in day.mediaActivity"
					:key="item.media.id + item.activityKind"
					class="flex items-center justify-between gap-2 rounded-2xl border border-bronze-border bg-bronze-soft px-3.5 py-2.5 text-xs"
				>
					<div class="flex items-center gap-2 font-extrabold text-fg">
						<Clapperboard class="h-4 w-4 shrink-0 text-bronze-text" />
						<span>
							{{ item.activityKind === 'finished' ? 'تماشای کامل:' : 'شروع تماشا:' }}
							{{ item.media.title }}
						</span>
					</div>
					<span v-if="item.media.rating" class="flex items-center gap-0.5 font-black text-gold-text">
						<Star class="h-3.5 w-3.5 fill-current" />
						{{ toPersianDigits(item.media.rating) }}
					</span>
				</div>
			</div>
		</div>

		<!-- عملکرد عادات در این تاریخ -->
		<div class="space-y-2.5 border-t border-border pt-4">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h3 class="text-xs font-extrabold text-fg-secondary">عملکرد طرح‌ها</h3>

				<button
					v-if="day.habitPerformances.length > 0"
					type="button"
					class="flex items-center gap-1 rounded-xl border border-border bg-elevated px-2.5 py-1 text-[11px] font-extrabold text-fg-secondary transition hover:border-accent-border hover:text-accent-text"
					@click="openModalWithHabit()"
				>
					<Eye class="h-3 w-3" />
					<span>دیدن جزئیات</span>
				</button>
			</div>

			<div
				v-if="day.habitPerformances.length === 0"
				class="rounded-2xl border border-dashed border-border bg-elevated p-4 text-center text-xs text-fg-muted"
			>
				عملکردی برای طرح‌ها در این تاریخ ثبت نشده است.
			</div>
			<div v-else class="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<button
					v-for="perf in day.habitPerformances"
					:key="perf.habitId"
					type="button"
					class="flex items-center justify-between gap-2 rounded-2xl border border-border bg-elevated px-3 py-2 text-right text-xs transition hover:border-border-strong hover:bg-muted/60 active:scale-98"
					title="کلیک برای مشاهده جزئیات این طرح"
					@click="openModalWithHabit(perf.habitId)"
				>
					<span class="truncate font-bold text-fg">{{ perf.title }}</span>

					<span
						v-if="perf.trackingMode === 'tiered'"
						class="shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-black"
						:class="getTierBadgeMeta(perf.achievedTier).classes"
					>
						{{ getTierBadgeMeta(perf.achievedTier).label }}
					</span>
					<span
						v-else
						class="shrink-0 rounded-lg border border-accent-border bg-accent-soft px-2 py-0.5 text-[11px] font-black text-accent-text"
					>
						{{ toPersianDigits(perf.actualMinutes ?? 0) }} دقیقه
					</span>
				</button>
			</div>
		</div>
	</aside>

	<!-- مودال نمایش جزئیات قوانین تاریخی و عملکرد طرح‌ها -->
	<LazyCalendarDayPerformanceModal
		v-if="isModalOpen"
		:full-human-label="day.fullHumanLabel"
		:performances="day.habitPerformances"
		:initial-expanded-habit-id="expandedHabitId"
		@close="closeModal"
	/>
</template>
