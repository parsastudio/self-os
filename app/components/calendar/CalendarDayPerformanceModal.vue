<script setup lang="ts">
import { toPersianDigits } from '~/domain/calendar';
import { getTierBadgeMeta, TIER_SCORES } from '~/domain/constants';
import type { DayHabitPerformanceItem } from '~/domain/schemas';
import { ChevronDown, ChevronUp, Clock } from 'lucide-vue-next';

interface Props {
	fullHumanLabel: string;
	performances: DayHabitPerformanceItem[];
	initialExpandedHabitId?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
	initialExpandedHabitId: null
});

const emit = defineEmits<{
	(e: 'close'): void;
}>();

const expandedHabitId = ref<string | null>(props.initialExpandedHabitId);

function toggleHabitExpanded(habitId: string) {
	expandedHabitId.value = expandedHabitId.value === habitId ? null : habitId;
}
</script>

<template>
	<UiBaseModal
		title="جزئیات عملکرد طرح‌ها"
		:subtitle="fullHumanLabel"
		max-width-class="max-w-xl"
		@close="emit('close')"
	>
		<div class="max-h-[75vh] space-y-3 overflow-y-auto p-4 sm:p-6">
			<div
				v-for="perf in performances"
				:key="perf.habitId"
				class="overflow-hidden rounded-2xl border border-border bg-elevated transition hover:border-border-strong"
			>
				<button
					type="button"
					class="flex w-full items-center justify-between gap-3 p-3.5 text-right transition hover:bg-muted/40"
					@click="toggleHabitExpanded(perf.habitId)"
				>
					<div class="min-w-0 space-y-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="text-sm font-black text-fg">{{ perf.title }}</span>
							<span
								v-if="perf.trackingMode === 'tiered'"
								class="rounded-lg border px-2 py-0.5 text-[10px] font-black"
								:class="getTierBadgeMeta(perf.achievedTier).classes"
							>
								{{ getTierBadgeMeta(perf.achievedTier).label }}
							</span>
							<span
								v-else
								class="rounded-lg border border-accent-border bg-accent-soft px-2 py-0.5 text-[10px] font-black text-accent-text"
							>
								{{ toPersianDigits(perf.actualMinutes ?? 0) }} دقیقه
							</span>
							<span
								v-if="perf.isArchived"
								class="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] font-bold text-fg-muted"
							>
								بایگانی‌شده
							</span>
						</div>

						<p class="text-xs font-medium text-fg-secondary">
							<template v-if="perf.trackingMode === 'tiered'">
								{{ perf.achievedRule || 'بدون توضیح ثبت‌شده' }}
							</template>
							<template v-else>
								انجام‌شده: {{ toPersianDigits(perf.actualMinutes ?? 0) }} دقیقه از هدفِ
								{{ toPersianDigits(perf.plannedMinutes ?? 0) }} دقیقه
							</template>
						</p>
					</div>

					<div class="flex shrink-0 items-center text-fg-secondary">
						<ChevronUp v-if="expandedHabitId === perf.habitId" class="h-4 w-4 text-accent-text" />
						<ChevronDown v-else class="h-4 w-4 text-fg-muted" />
					</div>
				</button>

				<div
					v-if="expandedHabitId === perf.habitId"
					class="space-y-3 border-t border-border bg-surface p-4 text-xs"
				>
					<div
						v-if="perf.specSnapshot.scheduleLabel"
						class="flex items-center justify-between rounded-xl border border-border bg-elevated px-3.5 py-2"
					>
						<span class="flex items-center gap-1.5 font-bold text-fg-secondary">
							<Clock class="h-3.5 w-3.5 text-fg-muted" />
							<span>زمان انجام:</span>
						</span>
						<span class="font-extrabold text-fg">{{ perf.specSnapshot.scheduleLabel }}</span>
					</div>

					<div v-if="perf.trackingMode === 'tiered'" class="space-y-1.5">
						<div class="text-[11px] font-extrabold text-fg-secondary">شرایط سطوح در این روز:</div>
						<div
							v-if="perf.specSnapshot.bronzeDesc"
							class="flex items-center justify-between rounded-xl border px-3 py-2"
							:class="
								perf.achievedTier === TIER_SCORES.BRONZE
									? 'border-bronze-border bg-bronze-soft'
									: 'border-border bg-elevated/60'
							"
						>
							<span class="font-extrabold text-bronze-text">برنز:</span>
							<span class="font-bold text-fg">{{ perf.specSnapshot.bronzeDesc }}</span>
						</div>
						<div
							v-if="perf.specSnapshot.silverDesc && perf.specSnapshot.silverDesc !== '~'"
							class="flex items-center justify-between rounded-xl border px-3 py-2"
							:class="
								perf.achievedTier === TIER_SCORES.SILVER
									? 'border-silver-border bg-silver-soft'
									: 'border-border bg-elevated/60'
							"
						>
							<span class="font-extrabold text-silver-text">نقره:</span>
							<span class="font-bold text-fg">{{ perf.specSnapshot.silverDesc }}</span>
						</div>
						<div
							v-if="perf.specSnapshot.goldDesc && perf.specSnapshot.goldDesc !== '~'"
							class="flex items-center justify-between rounded-xl border px-3 py-2"
							:class="
								perf.achievedTier === TIER_SCORES.GOLD
									? 'border-gold-border bg-gold-soft'
									: 'border-border bg-elevated/60'
							"
						>
							<span class="font-extrabold text-gold-text">طلا:</span>
							<span class="font-bold text-fg">{{ perf.specSnapshot.goldDesc }}</span>
						</div>
					</div>

					<div v-else class="grid grid-cols-2 gap-2 text-xs">
						<div class="rounded-xl border border-border bg-elevated p-2.5 text-center">
							<div class="text-[10px] font-bold text-fg-muted">انجام‌شده</div>
							<div class="mt-0.5 font-mono text-sm font-black text-accent-text">
								{{ toPersianDigits(perf.actualMinutes ?? 0) }} دقیقه
							</div>
						</div>
						<div class="rounded-xl border border-border bg-elevated p-2.5 text-center">
							<div class="text-[10px] font-bold text-fg-muted">هدف روز</div>
							<div class="mt-0.5 font-mono text-sm font-black text-fg">
								{{ toPersianDigits(perf.plannedMinutes ?? 0) }} دقیقه
							</div>
						</div>
					</div>

					<div
						v-if="perf.specSnapshot.notes"
						class="rounded-xl border border-border bg-elevated px-3 py-2 text-fg-secondary"
					>
						<strong class="font-extrabold text-fg">تبصره: </strong>
						<span>{{ perf.specSnapshot.notes }}</span>
					</div>
				</div>
			</div>
		</div>
	</UiBaseModal>
</template>
