<script setup lang="ts">
import { computed } from 'vue';
import type { HabitEntity } from '~/domain/schemas';
import { toPersianDigits } from '~/domain/calendar';
import ArchitectSubHabitGrid from './ArchitectSubHabitGrid.vue';
import { BarChart3, Clock, Pencil, Plus } from 'lucide-vue-next';

interface Props {
	habit: HabitEntity;
	children: HabitEntity[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
	(e: 'createSubHabit', parentId: string): void;
	(e: 'editHabit', habit: HabitEntity): void;
	(e: 'openStats', habitId: string): void;
}>();

const isComposite = computed(() => props.children && props.children.length > 0);
</script>

<template>
	<div
		class="flex flex-col justify-between rounded-3xl border border-border bg-surface p-4 shadow-(--shadow-soft) transition hover:border-border-strong sm:p-6"
		:class="{ 'md:col-span-2': isComposite }"
	>
		<div>
			<div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-start sm:gap-4">
				<div class="min-w-0 space-y-1.5">
					<div class="flex flex-wrap items-center gap-2">
						<h2 class="text-lg font-black text-fg sm:text-xl">{{ habit.title }}</h2>
						<span
							v-if="habit.trackingMode === 'interval_cadence'"
							class="rounded-xl border border-accent-border bg-accent-soft px-3 py-1 text-xs font-extrabold text-accent-text"
						>
							تکرارشونده
						</span>
						<span
							v-else-if="isComposite"
							class="rounded-xl border border-gold-border bg-gold-soft px-3 py-1 text-xs font-extrabold text-gold-text"
						>
							مجموعه‌طرح ({{ toPersianDigits(children.length) }} زیرطرح)
						</span>
						<span
							v-if="habit.isSituational"
							class="rounded-xl border border-border bg-elevated px-2.5 py-0.5 text-xs font-bold text-fg-secondary"
						>
							رویدادی
						</span>
					</div>

					<div v-if="habit.scheduleLabel" class="flex items-center gap-1.5 text-sm text-fg-secondary">
						<Clock class="h-4 w-4 text-fg-muted" />
						<span>{{ habit.scheduleLabel }}</span>
					</div>
				</div>

				<div class="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
					<button
						type="button"
						class="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-accent-border bg-accent-soft px-3 text-xs font-extrabold text-accent-text transition hover:opacity-90 sm:flex-initial"
						title="مشاهده نمودار روند و آمار این طرح"
						@click="emit('openStats', habit.id)"
					>
						<BarChart3 class="h-3.5 w-3.5 shrink-0" />
						<span>آمار</span>
					</button>

					<button
						v-if="habit.trackingMode === 'tiered'"
						type="button"
						class="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-elevated px-3.5 text-xs font-bold text-fg-secondary transition hover:border-border-strong hover:text-fg sm:flex-initial"
						title="افزودن زیرطرح به این طرح"
						@click="emit('createSubHabit', habit.id)"
					>
						<Plus class="h-3.5 w-3.5 shrink-0" />
						<span>زیرطرح</span>
					</button>

					<button
						type="button"
						class="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-elevated px-4 text-xs font-bold text-fg transition hover:border-border-strong hover:bg-muted sm:flex-initial"
						@click="emit('editHabit', habit)"
					>
						<Pencil class="h-3.5 w-3.5 shrink-0" />
						<span>ویرایش</span>
					</button>
				</div>
			</div>

			<!-- جزئیات قوانین طرح ریتمی -->
			<div v-if="habit.trackingMode === 'interval_cadence'" class="mt-4 space-y-1.5 text-xs">
				<div class="flex items-center justify-between rounded-xl bg-elevated px-3.5 py-2.5">
					<span class="font-bold text-accent-text">نحوه هدف‌گذاری:</span>
					<span class="font-semibold text-fg">تعیین دقیقه از شب قبل</span>
				</div>
				<div v-if="habit.emergencyMinDesc" class="flex items-center justify-between rounded-xl bg-elevated px-3.5 py-2.5">
					<span class="font-bold text-fg-secondary">حداقل اضطراری:</span>
					<span class="font-semibold text-fg">{{ habit.emergencyMinDesc }}</span>
				</div>
			</div>

			<!-- جزئیات قوانین طرح رتبه‌ای مستقل -->
			<div v-else-if="!isComposite" class="mt-4 space-y-1.5 text-xs">
				<div v-if="habit.bronzeDesc" class="flex items-center justify-between rounded-xl bg-elevated px-3.5 py-2.5">
					<span class="font-bold text-bronze-text">برنز:</span>
					<span class="font-semibold text-fg">{{ habit.bronzeDesc }}</span>
				</div>
				<div v-if="habit.silverDesc && habit.silverDesc !== '~'" class="flex items-center justify-between rounded-xl bg-elevated px-3.5 py-2.5">
					<span class="font-bold text-silver-text">نقره:</span>
					<span class="font-semibold text-fg">{{ habit.silverDesc }}</span>
				</div>
				<div v-if="habit.goldDesc && habit.goldDesc !== '~'" class="flex items-center justify-between rounded-xl bg-elevated px-3.5 py-2.5">
					<span class="font-bold text-gold-text">طلا:</span>
					<span class="font-semibold text-fg">{{ habit.goldDesc }}</span>
				</div>
			</div>

			<!-- گرید زیرطرح‌های وابسته در مجموعه‌طرح -->
			<ArchitectSubHabitGrid
				v-if="isComposite"
				:children="children"
				@edit-sub-habit="emit('editHabit', $event)"
				@open-stats="emit('openStats', $event)"
			/>
		</div>

		<div v-if="habit.notes" class="mt-4 border-t border-border pt-3 text-xs text-fg-secondary">
			<span>تبصره: {{ habit.notes }}</span>
		</div>
	</div>
</template>
