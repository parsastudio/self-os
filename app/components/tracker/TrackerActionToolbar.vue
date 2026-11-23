<script setup lang="ts">
import { formatJalaliHuman, normalizeDigits } from '~/domain/calendar';
import type { HabitEntity } from '~/domain/schemas';
import { CalendarClock, Copy, Eraser, Sparkles } from 'lucide-vue-next';

interface Props {
	cadenceHabits: HabitEntity[];
	tomorrowIso: string;
	tomorrowPlans: Record<string, { plannedMinutesPerInterval: number | null }>;
	isSavingTomorrow?: boolean;
	isTomorrowSaved?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	isSavingTomorrow: false,
	isTomorrowSaved: false
});

const emit = defineEmits<{
	(e: 'markAllOptimal'): void;
	(e: 'clearDay'): void;
	(e: 'updateTomorrowPlan', habitId: string, minutes: number | null): void;
	(e: 'copyTodayToTomorrow'): void;
	(e: 'saveTomorrowPlans'): void;
}>();

function handleTomorrowPlanInput(habitId: string, e: Event) {
	const inputEl = e.target as HTMLInputElement;
	const digitsOnly = normalizeDigits(inputEl.value).replace(/[^0-9]/g, '');
	if (digitsOnly === '') {
		if (inputEl.value !== '') {
			inputEl.value = '';
		}
		emit('updateTomorrowPlan', habitId, null);
		return;
	}
	const clamped = Math.min(1440, Math.max(0, Number(digitsOnly)));
	const clampedStr = String(clamped);
	if (inputEl.value !== clampedStr) {
		inputEl.value = clampedStr;
	}
	emit('updateTomorrowPlan', habitId, clamped);
}

const showTomorrowDrawer = ref(false);

watch(
	() => props.isTomorrowSaved,
	(saved, prevSaved) => {
		if (prevSaved && !saved && showTomorrowDrawer.value) {
			showTomorrowDrawer.value = false;
		}
	}
);

const tomorrowHuman = computed(() => formatJalaliHuman(props.tomorrowIso));
</script>

<template>
	<div class="rounded-3xl border border-border bg-surface p-4 shadow-(--shadow-soft) sm:px-6">
		<div class="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
			<div class="flex w-full items-center gap-2 sm:w-auto">
				<button
					type="button"
					class="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-xs font-black text-accent-fg shadow-xs transition hover:opacity-90 active:scale-98 sm:flex-initial sm:px-5 sm:text-sm"
					@click="emit('markAllOptimal')"
				>
					<Sparkles class="h-4 w-4 shrink-0" />
					<span>همه عالی انجام شد</span>
				</button>

				<button
					type="button"
					class="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-border bg-elevated px-3 text-xs font-extrabold text-fg-secondary transition hover:border-failed-border hover:bg-failed-soft hover:text-failed sm:px-3.5"
					title="پاک کردن کامل ثبت‌های این روز و بازگشت به حالت ثبت‌نشده"
					@click="emit('clearDay')"
				>
					<Eraser class="h-3.5 w-3.5 shrink-0" />
					<span>پاک کردن روز</span>
				</button>
			</div>

			<div v-if="cadenceHabits.length > 0" class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
				<button
					type="button"
					class="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl border px-3 text-xs font-extrabold transition sm:flex-initial sm:gap-2 sm:px-4"
					:class="
						showTomorrowDrawer
							? 'border-accent-border bg-accent-soft text-accent-text'
							: 'border-border bg-elevated text-fg-secondary hover:text-fg'
					"
					@click="showTomorrowDrawer = !showTomorrowDrawer"
				>
					<CalendarClock class="h-4 w-4 shrink-0" />
					<span class="truncate">تنظیم ریتم فردا</span>
				</button>
			</div>
		</div>

		<!-- کشوی تنظیم ریتم فردا -->
		<div v-if="showTomorrowDrawer && cadenceHabits.length > 0" class="mt-4 space-y-4 border-t border-border pt-4">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h3 class="text-sm font-black text-fg">
					هدف روز بعد ({{ tomorrowHuman.fullLabel }})
				</h3>

				<button
					type="button"
					class="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-elevated px-3 text-xs font-bold text-fg hover:border-border-strong"
					@click="emit('copyTodayToTomorrow')"
				>
					<Copy class="h-3.5 w-3.5 text-accent-text" />
					<span>کپی از این روز</span>
				</button>
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div
					v-for="habit in cadenceHabits"
					:key="habit.id"
					class="flex items-center justify-between gap-3 rounded-2xl border border-border bg-elevated px-4 py-3"
				>
					<span class="text-sm font-extrabold text-fg">{{ habit.title }}</span>
					<label class="flex items-center gap-2">
						<input
							v-if="tomorrowPlans[habit.id]"
							:value="tomorrowPlans[habit.id]?.plannedMinutesPerInterval ?? ''"
							type="text"
							inputmode="numeric"
							class="h-10 w-20 rounded-xl border border-border bg-surface px-3 text-center font-mono text-base font-black text-fg focus:border-border-strong focus:outline-none"
							@input="handleTomorrowPlanInput(habit.id, $event)"
						/>
						<span class="text-xs font-bold text-fg-secondary">دقیقه</span>
					</label>
				</div>
			</div>

			<div class="flex justify-end">
				<button
					type="button"
					:disabled="isSavingTomorrow"
					class="h-10 rounded-xl px-5 text-xs font-black transition active:scale-98 disabled:opacity-60"
					:class="
						isTomorrowSaved
							? 'bg-optimal text-on-solid'
							: 'bg-accent text-accent-fg'
					"
					@click="emit('saveTomorrowPlans')"
				>
					{{ isTomorrowSaved ? 'ذخیره شد ✓' : isSavingTomorrow ? 'در حال ذخیره...' : 'ذخیره برنامه فردا' }}
				</button>
			</div>
		</div>
	</div>
</template>
