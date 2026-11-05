<script setup lang="ts">
import { ref, computed } from 'vue';
import {
	CHART_DIMENSIONS,
	buildRollingAreaPath,
	buildRollingPolylinePoints,
	computeMaxCadenceMinutes,
	getChartX as getX,
	getChartYFromMinutes,
	getChartYFromScore as getYFromScore
} from '~/core/chart-math';
import { toPersianDigits } from '~/domain/calendar';
import { getOutcomeBadgeMeta } from '~/domain/constants';
import type { HabitDailyPoint, SelectedHabitAnalytics } from '~/domain/schemas';
import { GitCommitHorizontal, Info, Sparkles } from 'lucide-vue-next';

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

function getBarColorVar(outcome: HabitDailyPoint['outcome']): string {
	if (outcome === 'gold') return 'var(--tier-gold)';
	if (outcome === 'silver') return 'var(--tier-silver)';
	if (outcome === 'bronze') return 'var(--tier-bronze)';
	if (outcome === 'failed') return 'var(--state-failed)';
	if (outcome === 'skipped') return 'var(--text-muted)';
	return 'var(--border-hairline)';
}
</script>

<template>
	<section class="rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
		<div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
			<div>
				<div class="flex flex-wrap items-center gap-2">
					<h2 class="text-base font-black text-fg sm:text-lg">
						نمودار روند زمانی و تکامل «{{ report.habit.title }}»
					</h2>
					<span
						v-if="report.parentTitle"
						class="rounded-xl border border-border bg-elevated px-2.5 py-0.5 text-[11px] font-bold text-fg-secondary"
					>
						زیرمجموعه {{ report.parentTitle }}
					</span>
				</div>
				<p class="mt-0.5 text-xs font-bold text-fg-secondary">
					{{
						isCadence
							? 'ستون‌ها نشان‌دهنده دقایق انجام‌شده در هر روز و خط نقطه‌چین نشان‌دهنده هدف تعیین‌شده است'
							: 'ستون‌ها سطح کسب‌شده در هر روز و خط ممتد منحنی میانگین متحرک ۷ روزه (روند کلی) را نشان می‌دهد'
					}}
				</p>
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
					v-for="(pt, idx) in report.dailySeries"
					:key="pt.dateIso"
					class="cursor-pointer transition-opacity"
					role="button"
					tabindex="0"
					:aria-label="pt.humanLabel"
					@click="manualPointIndex = idx"
					@mouseenter="manualPointIndex = idx"
				>
					<rect
						:x="getX(idx, report.dailySeries.length) - Math.max(4, Math.min(20, (PLOT_W / Math.max(1, report.dailySeries.length)) * 0.62), 12) / 2"
						:y="PAD_TOP"
						:width="Math.max(4, Math.min(20, (PLOT_W / Math.max(1, report.dailySeries.length)) * 0.62), 12)"
						:height="PLOT_H"
						fill="transparent"
					/>

					<line
						v-if="activePointIndex === idx"
						:x1="getX(idx, report.dailySeries.length)"
						:y1="PAD_TOP"
						:x2="getX(idx, report.dailySeries.length)"
						:y2="PAD_TOP + PLOT_H"
						stroke="var(--surface-accent)"
						stroke-width="1.5"
						stroke-dasharray="2 2"
					/>

					<rect
						v-if="
							(isCadence && pt.actualMinutes !== null && pt.actualMinutes > 0) ||
							(!isCadence && pt.score !== null && pt.score > 0) ||
							pt.outcome === 'failed' ||
							pt.outcome === 'skipped'
						"
						:x="getX(idx, report.dailySeries.length) - Math.max(4, Math.min(20, (PLOT_W / Math.max(1, report.dailySeries.length)) * 0.62)) / 2"
						:y="
							isCadence
								? pt.actualMinutes !== null && pt.actualMinutes > 0
									? getYFromMins(pt.actualMinutes)
									: PAD_TOP + PLOT_H - 6
								: pt.score !== null && pt.score > 0
									? getYFromScore(pt.score)
									: pt.outcome === 'failed'
										? PAD_TOP + PLOT_H - 7
										: PAD_TOP + PLOT_H - 12
						"
						:width="Math.max(4, Math.min(20, (PLOT_W / Math.max(1, report.dailySeries.length)) * 0.62))"
						:height="
							Math.max(
								0,
								PAD_TOP + PLOT_H -
									(isCadence
										? pt.actualMinutes !== null && pt.actualMinutes > 0
											? getYFromMins(pt.actualMinutes)
											: PAD_TOP + PLOT_H - 6
										: pt.score !== null && pt.score > 0
											? getYFromScore(pt.score)
											: pt.outcome === 'failed'
												? PAD_TOP + PLOT_H - 7
												: PAD_TOP + PLOT_H - 12)
							)
						"
						:rx="Math.min(5, Math.max(4, Math.min(20, (PLOT_W / Math.max(1, report.dailySeries.length)) * 0.62)) / 2)"
						:fill="getBarColorVar(pt.outcome)"
						:opacity="activePointIndex === idx ? '1' : '0.82'"
					/>

					<circle
						v-else-if="pt.outcome === 'unlogged'"
						:cx="getX(idx, report.dailySeries.length)"
						:cy="PAD_TOP + PLOT_H - 2"
						r="2"
						fill="var(--border-hairline)"
					/>

					<circle
						v-if="pt.lifecycleEventsOnDay.length > 0"
						:cx="getX(idx, report.dailySeries.length)"
						:cy="PAD_TOP - 10"
						r="6"
						fill="var(--surface-accent)"
						stroke="var(--bg-surface)"
						stroke-width="2"
					/>

					<text
						v-if="
							idx === 0 ||
							idx === report.dailySeries.length - 1 ||
							idx === Math.floor(report.dailySeries.length / 2) ||
							(report.dailySeries.length <= 14 && idx % 2 === 0)
						"
						:x="getX(idx, report.dailySeries.length)"
						:y="SVG_HEIGHT - 8"
						text-anchor="middle"
						:fill="activePointIndex === idx ? 'var(--text-primary)' : 'var(--text-muted)'"
						font-size="10"
						:font-weight="activePointIndex === idx ? '800' : '600'"
					>
						{{ toPersianDigits(pt.jalaliSlash.slice(5)) }}
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

				<p v-if="inspectedPoint.ruleSnapshot" class="text-xs font-semibold text-fg-secondary">
					<Info class="ml-1 inline h-3.5 w-3.5 text-fg-muted" />
					<span>قانون و وضعیت ثبت‌شده در این روز: </span>
					<strong class="font-extrabold text-fg">{{ inspectedPoint.ruleSnapshot }}</strong>
				</p>
				<p v-else class="text-xs text-fg-muted">در این تاریخ عملکردی برای این طرح ثبت نشده است.</p>

				<div v-if="inspectedPoint.lifecycleEventsOnDay.length > 0" class="mt-2 flex flex-wrap items-center gap-2 pt-1">
					<span
						v-for="ev in inspectedPoint.lifecycleEventsOnDay"
						:key="ev.id"
						class="inline-flex items-center gap-1.5 rounded-xl border border-accent-border bg-accent-soft px-3 py-1 text-xs font-extrabold text-accent-text"
					>
						<GitCommitHorizontal class="h-3.5 w-3.5" />
						<span>رویداد تغییر در این روز: {{ ev.summary }}</span>
					</span>
				</div>
			</div>

			<div v-if="inspectedPoint.dayTags.length > 0" class="flex flex-wrap items-center gap-1.5">
				<span class="text-[11px] font-bold text-fg-muted">تگ‌های روز:</span>
				<span
					v-for="tag in inspectedPoint.dayTags"
					:key="tag"
					class="rounded-xl border border-border bg-surface px-2.5 py-0.5 text-[11px] font-bold text-fg-secondary"
				>
					#{{ tag }}
				</span>
			</div>
			<div v-else-if="inspectedPoint.outcome === 'gold'" class="flex items-center gap-1.5 text-xs font-extrabold text-gold-text">
				<Sparkles class="h-4 w-4" />
				<span>عملکرد ایده‌آل</span>
			</div>
		</div>
	</section>
</template>
