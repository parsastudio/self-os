<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import {
	buildRecentCalendarDays,
	formatJalaliHuman,
	getTodayIso,
	getYesterdayIso,
	shiftIsoDate,
	toPersianDigits,
	type CalendarScrubberDay
} from '~/domain/calendar';
import { getDayStatusMeta } from '~/domain/constants';
import type { DayStatusColor } from '~/domain/schemas';
import { Check, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-vue-next';

interface Props {
	currentDateIso: string;
	recentEntries?: Array<{
		dateIso: string;
		dayStatus: DayStatusColor;
		reflectionNote: string;
		tags: string[];
	}>;
	liveDayStatus: DayStatusColor;
	isLiveDirty?: boolean;
	hasExistingEntry?: boolean;
	saveState?: 'idle' | 'saving' | 'saved' | 'error';
	completionStats: { completed: number; total: number; percent: number };
}

const props = withDefaults(defineProps<Props>(), {
	recentEntries: () => [],
	isLiveDirty: false,
	hasExistingEntry: false,
	saveState: 'idle'
});

const emit = defineEmits<{
	(e: 'selectDate', iso: string): void;
	(e: 'retrySave'): void;
}>();

const human = computed(() => formatJalaliHuman(props.currentDateIso));
const todayIso = computed(() => getTodayIso());
const yesterdayIso = computed(() => getYesterdayIso());
const prevDayIso = computed(() => shiftIsoDate(props.currentDateIso, -1));
const nextDayIso = computed(() => shiftIsoDate(props.currentDateIso, 1));

const savedStatusByIso = computed(() => new Map(props.recentEntries.map((e) => [e.dateIso, e.dayStatus])));

const calendarDays = computed(() =>
	buildRecentCalendarDays<DayStatusColor>({
		currentDateIso: props.currentDateIso,
		todayIso: todayIso.value,
		savedStatusByIso: savedStatusByIso.value,
		liveStatus: props.liveDayStatus,
		useLiveStatusForSelected: props.isLiveDirty || props.hasExistingEntry,
		defaultStatus: 'failed',
		daysCount: 14
	})
);

function handleKeydown(e: KeyboardEvent) {
	const tag = (e.target as HTMLElement)?.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
	if (e.key === '[') {
		e.preventDefault();
		emit('selectDate', prevDayIso.value);
	} else if (e.key === ']') {
		e.preventDefault();
		emit('selectDate', nextDayIso.value);
	}
}

function getDayCellClasses(day: CalendarScrubberDay<DayStatusColor>): string {
	const selectedGlow = day.isSelected
		? 'border-2 -translate-y-0.5 shadow-(--shadow-card)'
		: 'border hover:border-border-strong';

	if (day.visualState === 'optimal') {
		return `${selectedGlow} ${day.isSelected ? 'border-optimal bg-optimal-soft' : 'border-optimal-border bg-optimal-soft'}`;
	}
	if (day.visualState === 'partial') {
		return `${selectedGlow} ${day.isSelected ? 'border-partial bg-partial-soft' : 'border-partial-border bg-partial-soft'}`;
	}
	return `${selectedGlow} ${day.isSelected ? 'border-failed bg-failed-soft' : 'border-failed-border bg-failed-soft'}`;
}

onMounted(() => {
	window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
	window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
	<section class="rounded-3xl border border-border bg-surface p-4 shadow-(--shadow-soft) sm:p-6">
		<div class="flex flex-col gap-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
			<div class="flex w-full items-center justify-between gap-1.5 sm:w-auto sm:justify-start sm:gap-2">
				<button
					type="button"
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-elevated text-fg transition hover:border-border-strong active:scale-95 sm:h-11 sm:w-11"
					aria-label="روز قبل"
					@click="emit('selectDate', prevDayIso)"
				>
					<ChevronRight class="h-5 w-5" />
				</button>

				<div class="flex min-w-0 flex-1 items-center justify-center sm:min-w-80 sm:flex-initial">
					<div class="flex w-full min-w-0 flex-wrap items-center justify-center gap-1.5 px-2 py-1.5 text-center sm:gap-2.5 sm:px-3">
						<h1 class="truncate text-base font-black tracking-tight text-fg sm:text-2xl">
							{{ human.fullLabel }}
						</h1>
						<span
							v-if="human.relativeBadge"
							class="shrink-0 rounded-xl border border-accent-border bg-accent-soft px-2 py-0.5 text-[11px] font-extrabold text-accent-text sm:px-2.5 sm:text-xs"
						>
							{{ human.relativeBadge }}
						</span>
					</div>
				</div>

				<button
					type="button"
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-elevated text-fg transition hover:border-border-strong active:scale-95 sm:h-11 sm:w-11"
					aria-label="روز بعد"
					@click="emit('selectDate', nextDayIso)"
				>
					<ChevronLeft class="h-5 w-5" />
				</button>
			</div>

			<div class="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-3">
				<div class="flex items-center gap-2 rounded-2xl border border-border bg-elevated px-3 py-2 sm:gap-2.5 sm:px-3.5">
					<div class="text-xs font-black text-fg">
						{{ toPersianDigits(completionStats.completed) }} از {{ toPersianDigits(completionStats.total) }}
					</div>

					<span
						v-if="completionStats.total > 0 && completionStats.completed === completionStats.total"
						class="flex h-5 w-5 items-center justify-center rounded-full bg-optimal-soft text-optimal"
						title="تمام طرح‌های امروز تکمیل شد"
					>
						<Check class="h-3 w-3 stroke-[2.75]" />
					</span>
					<button
						v-else-if="saveState === 'error'"
						type="button"
						class="flex h-5 w-5 items-center justify-center rounded-full bg-failed-soft text-failed transition hover:scale-105"
						title="خطا در ذخیره‌سازی — کلیک برای تلاش مجدد"
						@click="emit('retrySave')"
					>
						<AlertCircle class="h-3.5 w-3.5" />
					</button>
				</div>

				<div class="flex items-center gap-1 rounded-2xl border border-border bg-elevated p-1">
					<button
						type="button"
						class="rounded-xl px-3.5 py-2 text-xs font-extrabold transition"
						:class="
							currentDateIso === yesterdayIso
								? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs'
								: 'text-fg-secondary hover:text-fg'
						"
						@click="emit('selectDate', yesterdayIso)"
					>
						دیروز
					</button>
					<button
						type="button"
						class="rounded-xl px-3.5 py-2 text-xs font-extrabold transition"
						:class="
							currentDateIso === todayIso
								? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs'
								: 'text-fg-secondary hover:text-fg'
						"
						@click="emit('selectDate', todayIso)"
					>
						امروز
					</button>
				</div>
			</div>
		</div>

		<div class="mt-4 grid grid-cols-7 gap-1.5 sm:mt-5 sm:grid-cols-14 sm:gap-2">
			<button
				v-for="day in calendarDays"
				:key="day.iso"
				type="button"
				class="flex flex-col items-center justify-between rounded-2xl px-0.5 py-2 transition-all duration-150 sm:px-1 sm:py-2.5"
				:class="getDayCellClasses(day)"
				:title="`${day.weekdayShort} ${toPersianDigits(day.jd)} ${day.monthName}`"
				@click="emit('selectDate', day.iso)"
			>
				<span class="text-[11px] font-bold" :class="day.isSelected ? 'text-fg' : 'text-fg-secondary'">
					{{ day.weekdayShort }}
				</span>

				<span class="my-1 text-base font-black text-fg">
					{{ toPersianDigits(day.jd) }}
				</span>

				<span class="h-2 w-2 rounded-full" :class="getDayStatusMeta(day.visualState).dotClass"></span>
			</button>
		</div>
	</section>
</template>
