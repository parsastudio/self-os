<script setup lang="ts">
import { computed } from 'vue';
import { toPersianDigits } from '~/domain/calendar';
import type { HabitDailyPoint, SelectedHabitAnalytics } from '~/domain/schemas';
import { Calendar, Hash, Layers, TrendingDown, TrendingUp } from 'lucide-vue-next';

interface Props {
	report: SelectedHabitAnalytics;
}

const props = defineProps<Props>();

const totalLogged = computed(() => Math.max(1, props.report.loggedDaysCount));
const goldPct = computed(() => Math.round((props.report.goldCount / totalLogged.value) * 100));
const silverPct = computed(() => Math.round((props.report.silverCount / totalLogged.value) * 100));
const bronzePct = computed(() => Math.round((props.report.bronzeCount / totalLogged.value) * 100));
const failedPct = computed(() => Math.round((props.report.failedCount / totalLogged.value) * 100));

function getCellClasses(outcome: HabitDailyPoint['outcome']): string {
	if (outcome === 'gold') return 'border-gold-border bg-gold text-on-solid';
	if (outcome === 'silver') return 'border-silver-border bg-silver text-on-solid';
	if (outcome === 'bronze') return 'border-bronze-border bg-bronze text-on-solid';
	if (outcome === 'failed') return 'border-failed-border bg-failed-soft text-failed';
	if (outcome === 'skipped') return 'border-border bg-muted text-fg-secondary';
	return 'border-border/50 bg-elevated/40 text-fg-muted';
}
</script>

<template>
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
		<div class="space-y-5 rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6 lg:col-span-7">
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<Layers class="h-4.5 w-4.5 text-accent-text" />
					<h3 class="text-base font-black text-fg">کالبدشکافی سطوح و ماتریس روزها</h3>
				</div>
				<span class="text-xs font-bold text-fg-muted">
					{{ toPersianDigits(report.loggedDaysCount) }} روز ثبت‌شده
				</span>
			</div>

			<div v-if="report.loggedDaysCount > 0" class="space-y-2">
				<div class="flex h-4 w-full overflow-hidden rounded-full bg-elevated p-0.5">
					<div
						v-if="report.goldCount > 0"
						class="h-full bg-gold transition-all duration-300 first:rounded-r-full last:rounded-l-full"
						:style="{ width: `${goldPct}%` }"
						:title="`طلا: ${toPersianDigits(report.goldCount)} روز (%${toPersianDigits(goldPct)})`"
					></div>
					<div
						v-if="report.silverCount > 0"
						class="h-full bg-silver transition-all duration-300 first:rounded-r-full last:rounded-l-full"
						:style="{ width: `${silverPct}%` }"
						:title="`نقره: ${toPersianDigits(report.silverCount)} روز (%${toPersianDigits(silverPct)})`"
					></div>
					<div
						v-if="report.bronzeCount > 0"
						class="h-full bg-bronze transition-all duration-300 first:rounded-r-full last:rounded-l-full"
						:style="{ width: `${bronzePct}%` }"
						:title="`برنز: ${toPersianDigits(report.bronzeCount)} روز (%${toPersianDigits(bronzePct)})`"
					></div>
					<div
						v-if="report.failedCount > 0"
						class="h-full bg-failed transition-all duration-300 first:rounded-r-full last:rounded-l-full"
						:style="{ width: `${failedPct}%` }"
						:title="`عدم انجام: ${toPersianDigits(report.failedCount)} روز (%${toPersianDigits(failedPct)})`"
					></div>
				</div>

				<div class="flex flex-wrap items-center justify-between text-[11px] font-bold text-fg-secondary px-1">
					<span class="text-gold-text">طلا: %{{ toPersianDigits(goldPct) }}</span>
					<span v-if="report.silverCount > 0" class="text-silver-text">نقره: %{{ toPersianDigits(silverPct) }}</span>
					<span class="text-bronze-text">برنز: %{{ toPersianDigits(bronzePct) }}</span>
					<span class="text-failed">نشد: %{{ toPersianDigits(failedPct) }}</span>
				</div>
			</div>

			<div class="space-y-2 border-t border-border pt-4">
				<div class="text-xs font-extrabold text-fg-secondary">
					ماتریس روزهای بازه
				</div>
				<div class="flex flex-wrap gap-1.5">
					<div
						v-for="pt in report.dailySeries"
						:key="pt.dateIso"
						class="flex h-8 w-8 items-center justify-center rounded-xl border text-[11px] font-black transition hover:scale-110"
						:class="getCellClasses(pt.outcome)"
						:title="`${pt.humanLabel} — ${pt.ruleSnapshot || 'ثبت‌نشده'}`"
					>
						{{ toPersianDigits(pt.jalaliSlash.slice(8)) }}
					</div>
				</div>
			</div>
		</div>

		<div class="space-y-5 rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6 lg:col-span-5">
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<Calendar class="h-4.5 w-4.5 text-accent-text" />
					<h3 class="text-base font-black text-fg">الگوی روزهای هفته و عوامل موثر</h3>
				</div>
			</div>

			<div class="space-y-2.5">
				<div v-for="w in report.weekdayStats" :key="w.weekdayIndex" class="flex items-center gap-3 text-xs">
					<span class="w-16 shrink-0 font-bold text-fg-secondary">{{ w.weekdayLabel }}</span>
					<div class="h-2.5 flex-1 overflow-hidden rounded-full bg-elevated">
						<div
							class="h-full rounded-full transition-all duration-300"
							:class="w.avgScore >= 80 ? 'bg-optimal' : w.avgScore >= 50 ? 'bg-accent' : w.avgScore > 0 ? 'bg-bronze' : 'bg-transparent'"
							:style="{ width: `${w.avgScore}%` }"
						></div>
					</div>
					<span class="w-12 shrink-0 text-left font-mono font-extrabold text-fg">
						{{ w.loggedDays > 0 ? `%${toPersianDigits(w.avgScore)}` : '—' }}
					</span>
				</div>
			</div>

			<div v-if="report.bestWeekday || report.weakestWeekday" class="grid grid-cols-2 gap-2.5 border-t border-border pt-3.5 text-xs">
				<div v-if="report.bestWeekday" class="flex items-center justify-between rounded-2xl border border-optimal-border bg-optimal-soft p-3">
					<div>
						<div class="text-[11px] font-bold text-optimal">بهترین روز</div>
						<div class="mt-0.5 font-black text-fg">{{ report.bestWeekday.weekdayLabel }}</div>
					</div>
					<span class="font-mono text-sm font-black text-optimal">%{{ toPersianDigits(report.bestWeekday.avgScore) }}</span>
				</div>
				<div v-if="report.weakestWeekday && report.weakestWeekday.weekdayIndex !== report.bestWeekday?.weekdayIndex" class="flex items-center justify-between rounded-2xl border border-failed-border bg-failed-soft p-3">
					<div>
						<div class="text-[11px] font-bold text-failed">ضعیف‌ترین روز</div>
						<div class="mt-0.5 font-black text-fg">{{ report.weakestWeekday.weekdayLabel }}</div>
					</div>
					<span class="font-mono text-sm font-black text-failed">%{{ toPersianDigits(report.weakestWeekday.avgScore) }}</span>
				</div>
			</div>

			<div v-if="report.tagCorrelations.length > 0" class="space-y-2 border-t border-border pt-3.5">
				<div class="flex items-center gap-1.5 text-xs font-extrabold text-fg-secondary">
					<Hash class="h-3.5 w-3.5 text-accent-text" />
					<span>تاثیر تگ‌ها</span>
				</div>
				<div class="flex flex-wrap gap-1.5">
					<span
						v-for="item in report.tagCorrelations.slice(0, 6)"
						:key="item.tag"
						class="inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-extrabold"
						:class="item.impactDelta >= 0 ? 'border-optimal-border bg-optimal-soft text-optimal' : 'border-failed-border bg-failed-soft text-failed'"
					>
						<TrendingUp v-if="item.impactDelta >= 0" class="h-3 w-3" />
						<TrendingDown v-else class="h-3 w-3" />
						<span>#{{ item.tag }}</span>
						<span dir="ltr" class="font-mono">({{ item.impactDelta > 0 ? '+' : '' }}{{ toPersianDigits(item.impactDelta) }}%)</span>
					</span>
				</div>
			</div>
		</div>
	</div>
</template>
