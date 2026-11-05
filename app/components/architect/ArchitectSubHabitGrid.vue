<script setup lang="ts">
import type { HabitEntity } from '~/domain/schemas';
import { BarChart3, CornerDownLeft } from 'lucide-vue-next';

interface Props {
	children: HabitEntity[];
}

defineProps<Props>();

const emit = defineEmits<{
	(e: 'editSubHabit', habit: HabitEntity): void;
	(e: 'openStats', habitId: string): void;
}>();
</script>

<template>
	<div class="mt-5 border-t border-border pt-4">
		<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
			<div
				v-for="sub in children"
				:key="sub.id"
				class="flex flex-col justify-between rounded-2xl border border-border bg-elevated p-4 transition hover:border-border-strong"
			>
				<div>
					<div class="flex items-start justify-between gap-2">
						<div class="flex items-center gap-2">
							<CornerDownLeft class="h-4 w-4 text-fg-muted" />
							<h3 class="text-base font-extrabold text-fg">{{ sub.title }}</h3>
						</div>
						<div class="flex items-center gap-1.5">
							<button
								type="button"
								class="flex items-center gap-1 rounded-lg border border-accent-border bg-accent-soft px-2 py-1 text-xs font-extrabold text-accent-text transition hover:opacity-90"
								title="مشاهده آمار این زیرطرح"
								@click="emit('openStats', sub.id)"
							>
								<BarChart3 class="h-3 w-3" />
								<span>آمار</span>
							</button>
							<button
								type="button"
								class="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-bold text-fg-secondary transition hover:text-fg"
								@click="emit('editSubHabit', sub)"
							>
								ویرایش
							</button>
						</div>
					</div>

					<p v-if="sub.scheduleLabel" class="mt-1 text-xs text-fg-muted">{{ sub.scheduleLabel }}</p>

					<div class="mt-3 space-y-1.5 text-xs">
						<div v-if="sub.bronzeDesc" class="flex items-center justify-between rounded-lg bg-surface px-2.5 py-1.5">
							<span class="font-bold text-bronze-text">برنز:</span>
							<span class="font-semibold text-fg">{{ sub.bronzeDesc }}</span>
						</div>
						<div v-if="sub.silverDesc" class="flex items-center justify-between rounded-lg bg-surface px-2.5 py-1.5">
							<span class="font-bold text-silver-text">نقره:</span>
							<span class="font-semibold text-fg">{{ sub.silverDesc }}</span>
						</div>
						<div v-if="sub.goldDesc" class="flex items-center justify-between rounded-lg bg-surface px-2.5 py-1.5">
							<span class="font-bold text-gold-text">طلا:</span>
							<span class="font-semibold text-fg">{{ sub.goldDesc }}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
