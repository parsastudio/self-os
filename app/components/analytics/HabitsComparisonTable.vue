<script setup lang="ts">
import { computed } from 'vue';
import { toPersianDigits } from '~/domain/calendar';
import type { HabitComparisonRow } from '~/domain/schemas';
import { BarChart3, Flame, TrendingDown, TrendingUp } from 'lucide-vue-next';

interface Props {
	rows: HabitComparisonRow[];
	selectedHabitId?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	(e: 'selectHabit', habitId: string): void;
}>();

const sortedRows = computed(() => [...props.rows].sort((a, b) => b.avgQualityScore - a.avgQualityScore));
</script>

<template>
	<section class="rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
			<div class="flex items-center gap-2.5">
				<div class="flex h-9 w-9 items-center justify-center rounded-xl border border-accent-border bg-accent-soft text-accent-text">
					<BarChart3 class="h-5 w-5" />
				</div>
				<h3 class="text-base font-black text-fg">مقایسه همه طرح‌ها</h3>
			</div>
		</div>

		<div class="space-y-2.5">
			<button
				v-for="row in sortedRows"
				:key="row.habit.id"
				type="button"
				class="flex w-full flex-col justify-between gap-3 rounded-2xl border p-3.5 text-right transition sm:flex-row sm:items-center sm:px-4"
				:class="
					row.habit.id === selectedHabitId
						? 'border-accent bg-accent-soft/50 ring-1 ring-accent-border'
						: 'border-border bg-elevated hover:border-border-strong'
				"
				@click="emit('selectHabit', row.habit.id)"
			>
				<div class="min-w-0 flex-1 space-y-1">
					<div class="flex flex-wrap items-center gap-2">
						<span class="text-sm font-black text-fg">{{ row.habit.title }}</span>
						<span v-if="row.parentTitle" class="rounded-lg border border-border bg-surface px-2 py-0.5 text-[10px] font-bold text-fg-muted">
							{{ row.parentTitle }}
						</span>
						<span v-if="row.habit.status === 'archived'" class="rounded-lg border border-border bg-surface px-2 py-0.5 text-[10px] font-bold text-fg-muted">
							بایگانی
						</span>
					</div>

					<div class="flex h-2 w-full max-w-md overflow-hidden rounded-full bg-surface">
						<div v-if="row.goldCount > 0" class="h-full bg-gold" :style="{ width: `${Math.round((row.goldCount / Math.max(1, row.loggedDays)) * 100)}%` }"></div>
						<div v-if="row.silverCount > 0" class="h-full bg-silver" :style="{ width: `${Math.round((row.silverCount / Math.max(1, row.loggedDays)) * 100)}%` }"></div>
						<div v-if="row.bronzeCount > 0" class="h-full bg-bronze" :style="{ width: `${Math.round((row.bronzeCount / Math.max(1, row.loggedDays)) * 100)}%` }"></div>
						<div v-if="row.failedCount > 0" class="h-full bg-failed" :style="{ width: `${Math.round((row.failedCount / Math.max(1, row.loggedDays)) * 100)}%` }"></div>
					</div>
				</div>

				<div class="flex flex-wrap items-center gap-3 text-xs sm:justify-end">
					<div class="flex items-center gap-1 font-bold text-fg-secondary" title="رکورد فعلی">
						<Flame class="h-3.5 w-3.5 text-bronze-text" />
						<span>{{ toPersianDigits(row.currentStreak) }} روز</span>
					</div>

					<div class="rounded-xl border border-border bg-surface px-2.5 py-1 font-mono font-black text-fg">
						استمرار: %{{ toPersianDigits(row.consistencyRate) }}
					</div>

					<div
						class="w-16 text-center font-mono font-black"
						:class="row.avgQualityScore >= 80 ? 'text-gold-text' : row.avgQualityScore >= 50 ? 'text-accent-text' : 'text-fg-secondary'"
					>
						امتیاز {{ toPersianDigits(row.avgQualityScore) }}
					</div>

					<span
						v-if="row.trendDelta !== 0"
						class="inline-flex w-14 items-center justify-center gap-0.5 rounded-lg py-0.5 font-mono text-[11px] font-black"
						:class="row.trendDelta > 0 ? 'bg-optimal-soft text-optimal' : 'bg-failed-soft text-failed'"
					>
						<TrendingUp v-if="row.trendDelta > 0" class="h-3 w-3" />
						<TrendingDown v-else class="h-3 w-3" />
						<span>{{ row.trendDelta > 0 ? '+' : '' }}{{ toPersianDigits(row.trendDelta) }}</span>
					</span>
				</div>
			</button>
		</div>
	</section>
</template>
