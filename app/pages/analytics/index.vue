<script setup lang="ts">
import { useAppDatabase } from '~/composables/useAppDatabase';
import { useDexieLiveQuery } from '~/composables/useDexieLiveQuery';
import { buildFullAnalyticsReport } from '~/core/analytics-engine';
import { getTodayIso, getYesterdayIso, shiftIsoDate } from '~/domain/calendar';
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

const selectedRange = computed<AnalyticsTimeRange>(() => {
	const r = route.query.range as AnalyticsTimeRange | undefined;
	if (r && ['7d', '30d', '90d', 'all'].includes(r)) return r;
	return '30d';
});

const queryLowerBoundIso = computed<string | null>(() => {
	if (selectedRange.value === 'all') return null;
	const lookbackDays =
		selectedRange.value === '7d' ? 35 : selectedRange.value === '30d' ? 60 : 120;
	return shiftIsoDate(getTodayIso(), -lookbackDays);
});

const habits = useDexieLiveQuery(() => db.habits.orderBy('sortOrder').toArray(), []);
const isHabitsLoading = habits.isLoading;
const rawEntries = useDexieLiveQuery(
	() =>
		queryLowerBoundIso.value
			? db.dailyEntries.where('dateIso').aboveOrEqual(queryLowerBoundIso.value).toArray()
			: db.dailyEntries.toArray(),
	[],
	queryLowerBoundIso
);
const rawLogs = useDexieLiveQuery(
	() =>
		queryLowerBoundIso.value
			? db.habitLogs.where('dateIso').aboveOrEqual(queryLowerBoundIso.value).toArray()
			: db.habitLogs.toArray(),
	[],
	queryLowerBoundIso
);
const lifecycleEvents = useDexieLiveQuery(() => db.lifecycleEvents.toArray(), []);

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

const report = computed(() =>
	buildFullAnalyticsReport({
		habits: habits.value,
		entries: rawEntries.value,
		logs: rawLogs.value,
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
					<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text">
						<BarChart3 class="h-5 w-5" />
					</div>
					<h1 class="text-xl font-black tracking-tight text-fg sm:text-2xl">آمار و روند طرح‌ها</h1>
				</div>

				<div class="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
					<div v-if="habitSelectOptions.length > 0" class="w-full sm:w-64">
						<CustomSelect
							:model-value="selectedHabitId"
							:options="habitSelectOptions"
							trigger-class="h-11 text-fg"
							@select="selectHabitAndScroll(String($event))"
						/>
					</div>

					<div class="flex items-center gap-1 rounded-2xl border border-border bg-elevated p-1">
						<button
							v-for="opt in rangeOptions"
							:key="opt.value"
							type="button"
							class="flex-1 rounded-xl px-3 py-2 text-xs font-extrabold whitespace-nowrap transition sm:flex-initial"
							:class="selectedRange === opt.value ? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs' : 'text-fg-secondary hover:text-fg'"
							@click="setRange(opt.value)"
						>
							{{ opt.label }}
						</button>
					</div>
				</div>
			</div>
		</section>

		<div v-if="isHabitsLoading" class="space-y-6" aria-busy="true">
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<div v-for="idx in 3" :key="idx" class="h-28 animate-pulse rounded-3xl border border-border bg-surface"></div>
			</div>
			<div class="h-80 animate-pulse rounded-3xl border border-border bg-surface"></div>
		</div>

		<div v-else-if="habits.length === 0" class="rounded-3xl border border-dashed border-border bg-surface p-12 text-center">
			<h2 class="text-base font-extrabold text-fg">هنوز طرحی در سیستم تعریف نشده است</h2>
			<NuxtLink to="/architect" class="mt-4 inline-flex h-11 items-center rounded-2xl bg-accent px-5 text-xs font-extrabold text-accent-fg shadow-xs">
				تعریف اولین طرح
			</NuxtLink>
		</div>

		<NuxtErrorBoundary v-else-if="report.selectedHabitReport">
			<div class="space-y-6">
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
			</div>

			<template #error="{ error, clearError }">
				<div class="rounded-3xl border border-failed-border bg-surface p-6 text-center shadow-(--shadow-soft)">
					<p class="text-sm font-extrabold text-failed">
						{{ error?.message || 'خطا در محاسبه و ترسیم نمودارهای آماری' }}
					</p>
					<button
						type="button"
						class="mt-3 h-10 rounded-xl bg-accent px-5 text-xs font-extrabold text-accent-fg"
						@click="clearError()"
					>
						تلاش مجدد
					</button>
				</div>
			</template>
		</NuxtErrorBoundary>
	</div>
</template>
