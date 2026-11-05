<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppDatabase } from '~/composables/useAppDatabase';
import { useDexieLiveQuery } from '~/composables/useDexieLiveQuery';
import { buildFullAnalyticsReport } from '~/core/analytics-engine';
import { getYesterdayIso, isoToJalaliSlash, toPersianDigits } from '~/domain/calendar';
import type { AnalyticsTimeRange } from '~/domain/schemas';
import CustomSelect from '~/components/ui/CustomSelect.vue';
import AnalyticsSummaryCards from '~/components/analytics/AnalyticsSummaryCards.vue';
import HabitTrendChart from '~/components/analytics/HabitTrendChart.vue';
import HabitHeatmapMatrix from '~/components/analytics/HabitHeatmapMatrix.vue';
import HabitEvolutionTimeline from '~/components/analytics/HabitEvolutionTimeline.vue';
import HabitsComparisonTable from '~/components/analytics/HabitsComparisonTable.vue';
import { BarChart3 } from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const db = useAppDatabase();

const habits = useDexieLiveQuery(() => db.habits.orderBy('sortOrder').toArray(), []);
const rawEntries = useDexieLiveQuery(() => db.dailyEntries.toArray(), []);
const rawLogs = useDexieLiveQuery(() => db.habitLogs.toArray(), []);
const lifecycleEvents = useDexieLiveQuery(() => db.lifecycleEvents.toArray(), []);

const selectedRange = computed<AnalyticsTimeRange>(() => {
	const r = route.query.range as AnalyticsTimeRange | undefined;
	if (r && ['7d', '30d', '90d', 'all'].includes(r)) return r;
	return '30d';
});

const selectedHabitId = computed(() => {
	const h = route.query.habit as string | undefined;
	if (h && habits.value.some((item) => item.id === h)) return h;
	const firstActive = habits.value.find((item) => item.status !== 'archived') ?? habits.value[0];
	return firstActive?.id ?? '';
});

const rangeOptions: ReadonlyArray<{ value: AnalyticsTimeRange; label: string }> = [
	{ value: '7d', label: '۷ روز اخیر' },
	{ value: '30d', label: '۳۰ روز اخیر' },
	{ value: '90d', label: '۹۰ روز اخیر' },
	{ value: 'all', label: 'کل زمان' }
];

const normalizedLogs = computed(() =>
	rawLogs.value.map((l) => ({
		...l,
		habitTitleSnapshot: l.habitTitleSnapshot ?? null,
		achievedRuleSnapshot: l.achievedRuleSnapshot ?? null,
		habitSnapshotJson: l.habitSnapshotJson ?? null,
		completedIntervals: l.completedIntervals ?? null,
		actualMinutesPerInterval: l.actualMinutesPerInterval ?? null,
		totalActualMinutes: l.totalActualMinutes ?? null,
		plannedIntervalsSnapshot: l.plannedIntervalsSnapshot ?? null,
		plannedMinutesSnapshot: l.plannedMinutesSnapshot ?? null
	}))
);

const report = computed(() =>
	buildFullAnalyticsReport({
		habits: habits.value,
		entries: rawEntries.value,
		logs: normalizedLogs.value,
		lifecycleEvents: lifecycleEvents.value,
		selectedHabitId: selectedHabitId.value,
		range: selectedRange.value,
		fallbackEndDateIso: getYesterdayIso()
	})
);

const habitSelectOptions = computed(() =>
	report.value.selectableHabits.map((item) => ({
		value: item.habit.id,
		label: item.displayLabel
	}))
);

function setRange(rangeVal: AnalyticsTimeRange) {
	router.push({ query: { ...route.query, range: rangeVal } });
}

function selectHabitAndScroll(habitId: string) {
	router.push({ query: { ...route.query, habit: habitId } });
	if (import.meta.client) {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}
}
</script>

<template>
	<div class="space-y-6 pb-16">
		<section class="rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
			<div class="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
				<div class="flex items-center gap-3.5">
					<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text">
						<BarChart3 class="h-6 w-6" />
					</div>
					<div>
						<div class="flex flex-wrap items-center gap-2">
							<h1 class="text-xl font-black tracking-tight text-fg sm:text-2xl">آمار و مهندسی روند طرح‌ها</h1>
							<span dir="ltr" class="rounded-xl border border-border bg-elevated px-2.5 py-0.5 font-mono text-xs font-bold text-fg-secondary">
								{{ toPersianDigits(isoToJalaliSlash(report.startDateIso)) }} → {{ toPersianDigits(isoToJalaliSlash(report.endDateIso)) }}
							</span>
						</div>
						<p class="mt-0.5 text-xs font-bold text-fg-secondary">
							تحلیل عمیق استمرار، کیفیت سطوح و تاثیر تغییرات قوانین هر طرح در طول زمان
						</p>
					</div>
				</div>

				<div class="flex flex-wrap items-center gap-2.5">
					<div class="flex items-center gap-1 rounded-2xl border border-border bg-elevated p-1">
						<button
							v-for="opt in rangeOptions"
							:key="opt.value"
							type="button"
							class="rounded-xl px-3 py-2 text-xs font-extrabold transition"
							:class="selectedRange === opt.value ? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs' : 'text-fg-secondary hover:text-fg'"
							@click="setRange(opt.value)"
						>
							{{ opt.label }}
						</button>
					</div>
				</div>
			</div>

			<div v-if="habitSelectOptions.length > 0" class="mt-5 flex flex-col justify-between gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
				<div class="flex items-center gap-2">
					<span class="text-xs font-black text-fg">انتخاب طرح برای کاوش عمیق:</span>
				</div>
				<div class="w-full sm:w-80">
					<CustomSelect
						:model-value="selectedHabitId"
						:options="habitSelectOptions"
						trigger-class="h-11 text-fg"
						@select="selectHabitAndScroll(String($event))"
					/>
				</div>
			</div>
		</section>

		<div v-if="habits.length === 0" class="rounded-3xl border border-dashed border-border bg-surface p-12 text-center">
			<h2 class="text-base font-extrabold text-fg">هنوز طرحی در سیستم تعریف نشده است</h2>
			<NuxtLink to="/architect" class="mt-4 inline-flex h-11 items-center rounded-2xl bg-accent px-5 text-xs font-extrabold text-accent-fg shadow-xs">
				تعریف اولین طرح
			</NuxtLink>
		</div>

		<template v-else-if="report.selectedHabitReport">
			<AnalyticsSummaryCards :report="report.selectedHabitReport" />

			<HabitTrendChart :report="report.selectedHabitReport" />

			<HabitHeatmapMatrix :report="report.selectedHabitReport" />

			<HabitEvolutionTimeline
				:habit-title="report.selectedHabitReport.habit.title"
				:evolution-timeline="report.selectedHabitReport.evolutionTimeline"
			/>

			<HabitsComparisonTable
				:rows="report.comparisonRows"
				:selected-habit-id="selectedHabitId"
				@select-habit="selectHabitAndScroll"
			/>
		</template>
	</div>
</template>
