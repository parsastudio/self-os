<script setup lang="ts">
import type { HabitEntity } from '~/domain/schemas';
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
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="min-w-0 space-y-1">
					<div class="flex flex-wrap items-center gap-2">
						<h2 class="text-base font-black leading-snug text-fg sm:text-lg">{{ habit.title }}</h2>
						<span
							v-if="habit.trackingMode === 'interval_cadence'"
							class="rounded-lg border border-accent-border bg-accent-soft px-2 py-0.5 text-[11px] font-extrabold text-accent-text"
						>
							ریتمی
						</span>
					</div>

					<div v-if="habit.scheduleLabel" class="flex items-center gap-1.5 text-xs font-semibold text-fg-secondary">
						<Clock class="h-3.5 w-3.5 shrink-0 text-fg-muted" />
						<span>{{ habit.scheduleLabel }}</span>
					</div>
				</div>

				<div class="mr-auto flex shrink-0 items-center gap-1.5">
					<button
						type="button"
						class="flex h-8.5 items-center justify-center gap-1.5 rounded-xl border border-accent-border bg-accent-soft px-2.5 text-xs font-extrabold text-accent-text transition hover:opacity-90"
						title="مشاهده نمودار روند و آمار این طرح"
						@click="emit('openStats', habit.id)"
					>
						<BarChart3 class="h-3.5 w-3.5 shrink-0" />
						<span>آمار</span>
					</button>

					<button
						v-if="habit.trackingMode === 'tiered'"
						type="button"
						class="flex h-8.5 items-center justify-center gap-1 rounded-xl border border-border bg-elevated px-2.5 text-xs font-bold text-fg-secondary transition hover:border-border-strong hover:text-fg"
						title="افزودن زیرطرح به این طرح"
						@click="emit('createSubHabit', habit.id)"
					>
						<Plus class="h-3.5 w-3.5 shrink-0" />
						<span>زیرطرح</span>
					</button>

					<button
						type="button"
						class="flex h-8.5 items-center justify-center gap-1.5 rounded-xl border border-border bg-elevated px-3 text-xs font-bold text-fg transition hover:border-border-strong hover:bg-muted"
						@click="emit('editHabit', habit)"
					>
						<Pencil class="h-3.5 w-3.5 shrink-0" />
						<span>ویرایش</span>
					</button>
				</div>
			</div>

			<!-- جزئیات قوانین طرح ریتمی -->
			<div v-if="habit.trackingMode === 'interval_cadence' && habit.emergencyMinDesc" class="mt-4 space-y-1.5 text-xs">
				<div class="flex items-center justify-between rounded-xl bg-elevated px-3.5 py-2.5">
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
