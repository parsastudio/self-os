<script setup lang="ts">
import { toPersianDigits } from '~/domain/calendar';
import type { SelectedHabitAnalytics } from '~/domain/schemas';
import { Award, Flame, TrendingDown, TrendingUp, Zap } from 'lucide-vue-next';

interface Props {
	report: SelectedHabitAnalytics;
}

const props = defineProps<Props>();

const isCadence = computed(() => props.report.habit.trackingMode === 'interval_cadence');
</script>

<template>
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
		<div class="rounded-3xl border border-border bg-surface p-4 shadow-(--shadow-card) sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<span class="text-xs font-extrabold text-fg-secondary">نرخ استمرار طرح</span>
				<div class="flex h-8 w-8 items-center justify-center rounded-xl border border-optimal-border bg-optimal-soft text-optimal">
					<Zap class="h-4 w-4" />
				</div>
			</div>

			<div class="mt-3 flex items-baseline gap-2">
				<span class="font-mono text-2xl font-black text-fg sm:text-3xl">
					%{{ toPersianDigits(report.consistencyRate) }}
				</span>
				<span
					v-if="report.trendDelta !== 0"
					class="inline-flex items-center gap-0.5 rounded-lg px-2 py-0.5 text-[11px] font-black"
					:class="report.trendDelta > 0 ? 'bg-optimal-soft text-optimal' : 'bg-failed-soft text-failed'"
					title="تغییر کیفیت نسبت به نیمه اول بازه"
				>
					<TrendingUp v-if="report.trendDelta > 0" class="h-3 w-3" />
					<TrendingDown v-else class="h-3 w-3" />
					<span>{{ report.trendDelta > 0 ? '+' : '' }}{{ toPersianDigits(report.trendDelta) }}%</span>
				</span>
			</div>

			<p class="mt-1.5 text-[11px] font-bold text-fg-muted">
				{{ toPersianDigits(report.successDaysCount) }} روز انجام از {{ toPersianDigits(report.loggedDaysCount) }} روز ثبت‌شده
			</p>
		</div>

		<div class="rounded-3xl border border-border bg-surface p-4 shadow-(--shadow-card) sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<span class="text-xs font-extrabold text-fg-secondary">
					{{ isCadence ? 'میانگین دقایق روزانه' : 'نرخ دست‌یابی به اوج (طلا)' }}
				</span>
				<div class="flex h-8 w-8 items-center justify-center rounded-xl border border-gold-border bg-gold-soft text-gold-text">
					<Award class="h-4 w-4" />
				</div>
			</div>

			<div class="mt-3 flex items-baseline gap-2">
				<template v-if="isCadence">
					<span class="font-mono text-2xl font-black text-gold-text sm:text-3xl">
						{{ toPersianDigits(report.avgActualMinutes) }}
					</span>
					<span class="text-xs font-bold text-fg-secondary">
						از هدف {{ toPersianDigits(report.avgPlannedMinutes) }} دقیقه
					</span>
				</template>
				<template v-else>
					<span class="font-mono text-2xl font-black text-gold-text sm:text-3xl">
						%{{ toPersianDigits(report.goldRate) }}
					</span>
					<span class="text-xs font-bold text-fg-secondary">
						({{ toPersianDigits(report.goldCount) }} بار سطح کامل)
					</span>
				</template>
			</div>

			<p class="mt-1.5 text-[11px] font-bold text-fg-muted">
				<template v-if="isCadence">
					مجموع کل: {{ toPersianDigits(report.totalActualMinutes) }} دقیقه در این بازه
				</template>
				<template v-else>
					میانگین شاخص کیفیت: %{{ toPersianDigits(report.avgQualityScore) }}
				</template>
			</p>
		</div>

		<div class="rounded-3xl border border-border bg-surface p-4 shadow-(--shadow-card) sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<span class="text-xs font-extrabold text-fg-secondary">زنجیره پیوستگی (Streak)</span>
				<div class="flex h-8 w-8 items-center justify-center rounded-xl border border-bronze-border bg-bronze-soft text-bronze-text">
					<Flame class="h-4 w-4" />
				</div>
			</div>

			<div class="mt-3 flex items-baseline gap-2">
				<span class="font-mono text-2xl font-black text-fg sm:text-3xl">
					{{ toPersianDigits(report.currentStreak) }}
				</span>
				<span class="text-xs font-bold text-fg-secondary">روز پیاپی فعلی</span>
			</div>

			<p class="mt-1.5 text-[11px] font-bold text-fg-muted">
				بهترین رکورد ثبت‌شده: {{ toPersianDigits(report.bestStreak) }} روز بدون شکست
			</p>
		</div>
	</div>
</template>
