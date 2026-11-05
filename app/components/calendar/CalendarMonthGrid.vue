<script setup lang="ts">
import {
	JALALI_GRID_WEEKDAYS,
	JALALI_GRID_WEEKDAYS_SHORT,
	toPersianDigits
} from '~/domain/calendar';
import { getDayStatusMeta } from '~/domain/constants';
import type { CalendarDayAggregate } from '~/domain/schemas';
import { BookHeart, BookOpen, CalendarClock, Clapperboard } from 'lucide-vue-next';

interface Props {
	leadingEmptyCells: number;
	days: CalendarDayAggregate[];
	selectedIso: string;
}

defineProps<Props>();

const emit = defineEmits<{
	(e: 'selectDay', iso: string): void;
}>();

function getDayCellClasses(day: CalendarDayAggregate, isSelected: boolean): string {
	const ring = isSelected
		? 'border-2 border-accent ring-2 ring-accent-border/60 shadow-(--shadow-card) scale-[1.02] z-10'
		: day.isToday
			? 'border-2 border-accent-border'
			: 'border border-border hover:border-border-strong';

	if (day.entry?.dayStatus === 'optimal') {
		return `${ring} bg-optimal-soft`;
	}
	if (day.entry?.dayStatus === 'partial') {
		return `${ring} bg-partial-soft`;
	}
	if (day.entry?.dayStatus === 'failed') {
		return `${ring} bg-failed-soft`;
	}
	return `${ring} bg-elevated/85 hover:bg-elevated`;
}
</script>

<template>
	<div class="rounded-3xl border border-border bg-surface p-4 shadow-(--shadow-soft) sm:p-5">
		<div class="mb-2.5 grid grid-cols-7 gap-1.5 text-center sm:gap-2">
			<div
				v-for="(weekday, idx) in JALALI_GRID_WEEKDAYS"
				:key="weekday"
				class="py-1 text-[11px] font-extrabold text-fg-secondary sm:text-xs"
			>
				<span class="hidden sm:inline">{{ weekday }}</span>
				<span class="sm:hidden">{{ JALALI_GRID_WEEKDAYS_SHORT[idx] }}</span>
			</div>
		</div>

		<div class="grid grid-cols-7 gap-1.5 sm:gap-2">
			<div
				v-for="idx in leadingEmptyCells"
				:key="`empty-${idx}`"
				class="aspect-square rounded-2xl border border-dashed border-border/40 bg-elevated/20"
			></div>

			<button
				v-for="day in days"
				:key="day.iso"
				type="button"
				class="group relative flex aspect-square flex-col justify-between overflow-hidden rounded-2xl p-1.5 text-right transition-all duration-150 sm:p-2"
				:class="getDayCellClasses(day, day.iso === selectedIso)"
				@click="emit('selectDay', day.iso)"
			>
				<div class="flex w-full items-center justify-between gap-1">
					<span
						class="leading-none font-black tracking-tight"
						:class="
							day.isToday
								? 'rounded-lg bg-accent px-1.5 py-0.5 text-xs text-accent-fg sm:text-sm'
								: 'text-sm text-fg sm:text-base'
						"
					>
						{{ toPersianDigits(day.jd) }}
					</span>

					<span
						v-if="day.entry"
						class="h-2 w-2 shrink-0 rounded-full"
						:class="getDayStatusMeta(day.entry.dayStatus).dotClass"
					></span>
				</div>

				<div class="mt-auto flex w-full items-center justify-start gap-1">
					<span
						v-if="day.events.length > 0"
						class="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg shadow-2xs"
						:title="day.events.map((e) => e.title).join('، ')"
					>
						<CalendarClock class="h-2.5 w-2.5" />
					</span>
					<span
						v-if="day.booksActivity.length > 0"
						class="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-optimal text-on-solid shadow-2xs"
						title="کتاب"
					>
						<BookOpen class="h-2.5 w-2.5" />
					</span>
					<span
						v-if="day.mediaActivity.length > 0"
						class="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-bronze text-on-solid shadow-2xs"
						title="فیلم / انیمه"
					>
						<Clapperboard class="h-2.5 w-2.5" />
					</span>
					<span
						v-if="day.entry?.journalText"
						class="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-silver text-on-solid shadow-2xs"
						title="خاطره ثبت‌شده"
					>
						<BookHeart class="h-2.5 w-2.5" />
					</span>
				</div>
			</button>
		</div>
	</div>
</template>
