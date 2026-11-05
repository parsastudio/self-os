<script setup lang="ts">
import { computed } from 'vue';
import { resolveEffectiveCadenceMinutes } from '~/core/habit-engine';
import { CADENCE_DEFAULTS } from '~/domain/constants';
import { toPersianDigits } from '~/domain/calendar';
import type { HabitEntity, HabitLogItemInput } from '~/domain/schemas';
import { Flame, Timer } from 'lucide-vue-next';

interface Props {
	habit: HabitEntity;
	log?: HabitLogItemInput;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	(e: 'updateActual', habitId: string, minutes: number): void;
}>();

const plannedMinutes = computed(() =>
	props.log?.plannedMinutesSnapshot && props.log.plannedMinutesSnapshot > 0
		? props.log.plannedMinutesSnapshot
		: props.habit.defaultMinutesPerInterval > 0
			? props.habit.defaultMinutesPerInterval
			: 10
);

const actualMinutes = computed(() => props.log?.actualMinutesPerInterval ?? 0);
const effectiveTotalMinutes = computed(() => resolveEffectiveCadenceMinutes(props.log));

const progressPercent = computed(() =>
	plannedMinutes.value > 0
		? Math.min(100, Math.round((effectiveTotalMinutes.value / plannedMinutes.value) * 100))
		: 0
);

const quickPresets = computed(() => {
	const set = new Set<number>([0, 5, 10, 15, 20, 30]);
	if (plannedMinutes.value > 0) set.add(plannedMinutes.value);
	return Array.from(set).sort((a, b) => a - b);
});
</script>

<template>
	<div
		class="relative overflow-hidden rounded-3xl border p-4 shadow-(--shadow-soft) transition-all duration-200 sm:px-6 sm:py-4"
		:class="
			effectiveTotalMinutes >= plannedMinutes
				? 'border-optimal-border bg-optimal-soft'
				: effectiveTotalMinutes > 0
					? 'border-accent-border bg-accent-soft'
					: 'border-border bg-surface'
		"
	>
		<div class="flex flex-col justify-between gap-3.5 lg:flex-row lg:items-center">
			<div class="flex items-center gap-3">
				<div
					class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border bg-surface"
					:class="
						effectiveTotalMinutes >= plannedMinutes
							? 'border-optimal-border text-optimal'
							: 'border-accent-border text-accent-text'
					"
				>
					<Timer class="h-5 w-5" />
				</div>

				<div class="space-y-0.5">
					<h3 class="text-base font-black text-fg sm:text-lg">{{ habit.title }}</h3>
					<p v-if="habit.scheduleLabel" class="text-xs font-semibold text-fg-secondary">
						{{ habit.scheduleLabel }} • هدف: {{ toPersianDigits(plannedMinutes) }} دقیقه
					</p>
					<p v-else class="text-xs font-semibold text-fg-secondary">
						هدف: {{ toPersianDigits(plannedMinutes) }} دقیقه
					</p>
				</div>
			</div>

			<div class="flex w-full flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-elevated p-1 lg:w-auto">
				<button
					v-for="preset in quickPresets"
					:key="preset"
					type="button"
					class="relative h-9.5 min-w-10 flex-1 rounded-xl px-2 text-xs font-extrabold transition active:scale-95 sm:h-10 sm:min-w-12 sm:flex-initial sm:px-3"
					:class="
						actualMinutes === preset
							? preset === 0
								? 'bg-failed text-on-solid shadow-xs'
								: preset === plannedMinutes && preset > 0
									? 'bg-optimal text-on-solid shadow-xs'
									: 'bg-accent text-accent-fg shadow-xs'
							: preset === plannedMinutes && preset > 0
								? 'border border-dashed border-accent-border text-accent-text hover:bg-surface'
								: 'text-fg-secondary hover:bg-surface hover:text-fg'
					"
					:title="
						actualMinutes === preset && preset !== 0
							? 'کلیک مجدد برای صفر کردن'
							: preset === plannedMinutes && preset > 0
								? `هدف تعیین‌شده (${toPersianDigits(preset)} دقیقه)`
								: ''
					"
					@click="emit('updateActual', habit.id, actualMinutes === preset && preset !== 0 ? 0 : preset)"
				>
					{{ preset === 0 ? 'صفر' : toPersianDigits(preset) }}
				</button>

				<button
					v-if="habit.emergencyMinDesc"
					type="button"
					class="flex h-9.5 items-center gap-1 rounded-xl px-2.5 text-xs font-extrabold transition sm:h-10"
					:class="
						actualMinutes === CADENCE_DEFAULTS.EMERGENCY_MINUTES
							? 'bg-bronze text-on-solid shadow-xs'
							: 'text-bronze-text hover:bg-surface'
					"
					:title="habit.emergencyMinDesc"
					@click="emit('updateActual', habit.id, CADENCE_DEFAULTS.EMERGENCY_MINUTES)"
				>
					<Flame class="h-3.5 w-3.5" />
					<span>{{ toPersianDigits(CADENCE_DEFAULTS.EMERGENCY_MINUTES) }}</span>
				</button>
			</div>
		</div>

		<div class="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-elevated">
			<div
				class="h-full rounded-full transition-all duration-300"
				:class="
					effectiveTotalMinutes >= plannedMinutes
						? 'bg-optimal'
						: effectiveTotalMinutes > 0
							? 'bg-accent'
							: 'bg-transparent'
				"
				:style="{ width: `${progressPercent}%` }"
			></div>
		</div>
	</div>
</template>
