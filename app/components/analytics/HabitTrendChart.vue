<script setup lang="ts">
import {
	CHART_DIMENSIONS,
	buildRenderedChartBars,
	buildRollingAreaPath,
	buildRollingPolylinePoints,
	computeMaxCadenceMinutes,
	getChartBarColorVar,
	getChartYFromMinutes,
	getChartYFromScore as getYFromScore
} from '~/core/chart-math';
import { toPersianDigits } from '~/domain/calendar';
import { getOutcomeBadgeMeta } from '~/domain/constants';
import type { HabitDailyPoint, SelectedHabitAnalytics } from '~/domain/schemas';
import { GitCommitHorizontal } from 'lucide-vue-next';

interface Props {
	report: SelectedHabitAnalytics;
}

const props = defineProps<Props>();

const manualPointIndex = ref<number | null>(null);

const isCadence = computed(() => props.report.habit.trackingMode === 'interval_cadence');

const activePointIndex = computed<number | null>(() => {
	const series = props.report.dailySeries;
	if (series.length === 0) return null;

	if (manualPointIndex.value !== null && manualPointIndex.value >= 0 && manualPointIndex.value < series.length) {
		return manualPointIndex.value;
	}

	for (let i = series.length - 1; i >= 0; i--) {
		const item = series[i];
		if (item && item.outcome !== 'unlogged') {
			return i;
		}
	}
	return series.length - 1;
});

const { SVG_WIDTH, SVG_HEIGHT, PAD_TOP, PAD_LEFT, PAD_RIGHT, PLOT_W, PLOT_H } = CHART_DIMENSIONS;

const maxCadenceMinutes = computed(() =>
	isCadence.value
		? computeMaxCadenceMinutes(props.report.dailySeries, props.report.habit.defaultMinutesPerInterval)
		: 100
);

function getYFromMins(minutes: number): number {
	return getChartYFromMinutes(minutes, maxCadenceMinutes.value);
}

const rollingPolylinePoints = computed(() =>
	buildRollingPolylinePoints(props.report.dailySeries, isCadence.value, maxCadenceMinutes.value)
);

const rollingAreaPath = computed(() =>
	buildRollingAreaPath(props.report.dailySeries, isCadence.value, maxCadenceMinutes.value)
);

const inspectedPoint = computed<HabitDailyPoint | null>(() =>
	activePointIndex.value !== null ? props.report.dailySeries[activePointIndex.value] ?? null : null
);

const barWidth = computed(() => {
	const count = Math.max(1, props.report.dailySeries.length);
	return Math.max(4, Math.min(20, (PLOT_W / count) * 0.62));
});

const hitAreaWidth = computed(() => Math.max(barWidth.value, 12));

const renderedBars = computed(() =>
	buildRenderedChartBars(
		props.report.dailySeries,
		isCadence.value,
		maxCadenceMinutes.value,
		barWidth.value
	)
);
</script>

<template>
	<section class="rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
		<div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
			<div class="flex flex-wrap items-center gap-2">
				<h2 class="text-base font-black text-fg sm:text-lg">
					روند زمانی «{{ report.habit.title }}»
				</h2>
				<span
					v-if="report.parentTitle"
					class="rounded-xl border border-border bg-elevated px-2.5 py-0.5 text-[11px] font-bold text-fg-secondary"
				>
					{{ report.parentTitle }}
				</span>
			</div>

			<div class="flex flex-wrap items-center gap-3 text-[11px] font-extrabold">
				<span class="flex items-center gap-1.5 text-gold-text">
					<span class="h-2.5 w-2.5 rounded-full bg-gold"></span>
					<span>{{ isCadence ? 'تکمیل هدف' : 'طلا' }}</span>
				</span>
				<span v-if="!isCadence && report.maxSupportedTier >= 2" class="flex items-center gap-1.5 text-silver-text">
					<span class="h-2.5 w-2.5 rounded-full bg-silver"></span>
					<span>نقره</span>
				</span>
				<span v-if="isCadence || report.maxSupportedTier > 1" class="flex items-center gap-1.5 text-bronze-text">
					<span class="h-2.5 w-2.5 rounded-full bg-bronze"></span>
					<span>{{ isCadence ? 'کمتر از هدف' : 'برنز' }}</span>
				</span>
				<span class="flex items-center gap-1.5 text-failed">
					<span class="h-2.5 w-2.5 rounded-full bg-failed"></span>
					<span>نشد</span>
				</span>
				<span class="flex items-center gap-1.5 text-accent-text">
					<span class="h-0.5 w-4 rounded-full bg-accent"></span>
					<span>{{ isCadence ? 'خط هدف' : 'میانگین روند' }}</span>
				</span>
			</div>
		</div>

		<div class="mt-5 overflow-x-auto pb-2" dir="ltr">
			<svg
				:viewBox="`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`"
				class="h-60 min-w-[600px] w-full select-none overflow-visible"
				role="img"
				aria-label="نمودار روند طرح در طول زمان"
			>
				<defs>
					<linearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color="var(--surface-accent)" stop-opacity="0.24" />
						<stop offset="100%" stop-color="var(--surface-accent)" stop-opacity="0.0" />
					</linearGradient>
				</defs>

				<template v-if="isCadence">
					<g v-for="ratio in [0, 0.5, 1]" :key="ratio">
						<line
							:x1="PAD_LEFT"
							:y1="getYFromMins(Math.round(maxCadenceMinutes * ratio))"
							:x2="SVG_WIDTH - PAD_RIGHT"
							:y2="getYFromMins(Math.round(maxCadenceMinutes * ratio))"
							stroke="var(--border-hairline)"
							:stroke-dasharray="ratio === 0 ? 'none' : '4 4'"
							stroke-width="1"
						/>
						<text
							:x="SVG_WIDTH - PAD_RIGHT + 8"
							:y="getYFromMins(Math.round(maxCadenceMinutes * ratio)) + 4"
							fill="var(--text-muted)"
							font-size="10"
							font-weight="700"
						>
							{{ toPersianDigits(Math.round(maxCadenceMinutes * ratio)) }}′
						</text>
					</g>
				</template>

				<template v-else>
					<g
						v-for="grid in [
							{ score: 100, label: 'طلا' },
							{ score: 68, label: 'نقره' },
							{ score: 38, label: 'برنز' },
							{ score: 0, label: 'صفر' }
						]"
						:key="grid.score"
					>
						<line
							:x1="PAD_LEFT"
							:y1="getYFromScore(grid.score)"
							:x2="SVG_WIDTH - PAD_RIGHT"
							:y2="getYFromScore(grid.score)"
							stroke="var(--border-hairline)"
							:stroke-dasharray="grid.score === 0 ? 'none' : '4 4'"
							stroke-width="1"
						/>
						<text
							:x="SVG_WIDTH - PAD_RIGHT + 8"
							:y="getYFromScore(grid.score) + 4"
							fill="var(--text-muted)"
							font-size="10"
							font-weight="700"
						>
							{{ grid.label }}
						</text>
					</g>
				</template>

				<path v-if="rollingAreaPath" :d="rollingAreaPath" fill="url(#trendAreaGrad)" />

				<g
					v-for="item in renderedBars"
					:key="item.pt.dateIso"
					class="cursor-pointer transition-opacity"
					role="button"
					tabindex="0"
					:aria-label="item.pt.humanLabel"
					@click="manualPointIndex = item.idx"
					@mouseenter="manualPointIndex = item.idx"
				>
					<rect
						:x="item.cx - hitAreaWidth / 2"
						:y="PAD_TOP"
						:width="hitAreaWidth"
						:height="PLOT_H"
						fill="transparent"
					/>

					<line
						v-if="activePointIndex === item.idx"
						:x1="item.cx"
						:y1="PAD_TOP"
						:x2="item.cx"
						:y2="PAD_TOP + PLOT_H"
						stroke="var(--surface-accent)"
						stroke-width="1.5"
						stroke-dasharray="2 2"
					/>

					<rect
						v-if="item.hasVisibleBar"
						:x="item.barX"
						:y="item.barY"
						:width="barWidth"
						:height="item.barHeight"
						:rx="item.barRx"
						:fill="getChartBarColorVar(item.pt.outcome)"
						:opacity="activePointIndex === item.idx ? '1' : '0.82'"
					/>

					<circle
						v-else-if="item.pt.outcome === 'unlogged'"
						:cx="item.cx"
						:cy="PAD_TOP + PLOT_H - 2"
						r="2"
						fill="var(--border-hairline)"
					/>

					<circle
						v-if="item.pt.lifecycleEventsOnDay.length > 0"
						:cx="item.cx"
						:cy="PAD_TOP - 10"
						r="6"
						fill="var(--surface-accent)"
						stroke="var(--bg-surface)"
						stroke-width="2"
					/>

					<text
						v-if="item.showAxisLabel"
						:x="item.cx"
						:y="SVG_HEIGHT - 8"
						text-anchor="middle"
						:fill="activePointIndex === item.idx ? 'var(--text-primary)' : 'var(--text-muted)'"
						font-size="10"
						:font-weight="activePointIndex === item.idx ? '800' : '600'"
					>
						{{ toPersianDigits(item.pt.jalaliSlash.slice(5)) }}
					</text>
				</g>

				<polyline
					v-if="rollingPolylinePoints"
					fill="none"
					stroke="var(--surface-accent)"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					:stroke-dasharray="isCadence ? '5 4' : 'none'"
					:points="rollingPolylinePoints"
				/>
			</svg>
		</div>

		<div
			v-if="inspectedPoint"
			class="mt-3 flex flex-col justify-between gap-3 rounded-2xl border border-border bg-elevated p-4 sm:flex-row sm:items-center"
		>
			<div class="space-y-1">
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-sm font-black text-fg">{{ inspectedPoint.humanLabel }}</span>
					<span
						class="rounded-xl border px-2.5 py-0.5 text-[11px] font-extrabold"
						:class="getOutcomeBadgeMeta(inspectedPoint.outcome, report.maxSupportedTier).badgeClass"
					>
						{{ getOutcomeBadgeMeta(inspectedPoint.outcome, report.maxSupportedTier).label }}
					</span>
					<span v-if="!isCadence && inspectedPoint.rollingAvgScore !== null" class="text-xs font-bold text-accent-text">
						(میانگین روند ۷ روزه: %{{ toPersianDigits(inspectedPoint.rollingAvgScore) }})
					</span>
				</div>

				<p v-if="inspectedPoint.ruleSnapshot" class="text-xs font-extrabold text-fg">
					{{ inspectedPoint.ruleSnapshot }}
				</p>
				<p v-else class="text-xs text-fg-muted">عملکردی ثبت نشده است.</p>

				<div v-if="inspectedPoint.lifecycleEventsOnDay.length > 0" class="mt-2 flex flex-wrap items-center gap-2 pt-1">
					<span
						v-for="ev in inspectedPoint.lifecycleEventsOnDay"
						:key="ev.id"
						class="inline-flex items-center gap-1.5 rounded-xl border border-accent-border bg-accent-soft px-3 py-1 text-xs font-extrabold text-accent-text"
					>
						<GitCommitHorizontal class="h-3.5 w-3.5" />
						<span>{{ ev.summary }}</span>
					</span>
				</div>
			</div>

			<div v-if="inspectedPoint.dayTags.length > 0" class="flex flex-wrap items-center gap-1.5">
				<span
					v-for="tag in inspectedPoint.dayTags"
					:key="tag"
					class="rounded-xl border border-border bg-surface px-2.5 py-0.5 text-[11px] font-bold text-fg-secondary"
				>
					#{{ tag }}
				</span>
			</div>
		</div>
	</section>
</template>
