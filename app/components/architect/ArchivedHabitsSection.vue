<script setup lang="ts">
import type { HabitEntity } from '~/domain/schemas';
import { toPersianDigits } from '~/domain/calendar';

interface Props {
	archivedHabits: HabitEntity[];
}

defineProps<Props>();

const emit = defineEmits<{
	(e: 'editHabit', habit: HabitEntity): void;
}>();
</script>

<template>
	<details v-if="archivedHabits.length > 0" class="rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft)">
		<summary class="cursor-pointer text-sm font-bold text-fg-secondary select-none">
			طرح‌های بایگانی / حذف شده ({{ toPersianDigits(archivedHabits.length) }})
		</summary>
		<div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
			<div
				v-for="item in archivedHabits"
				:key="item.id"
				class="flex items-center justify-between rounded-2xl bg-elevated p-4 border border-border"
			>
				<span class="text-sm font-bold text-fg-secondary line-through">{{ item.title }}</span>
				<button
					type="button"
					class="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-fg transition hover:border-border-strong hover:text-accent-text"
					@click="emit('editHabit', item)"
				>
					بازگردانی / ویرایش
				</button>
			</div>
		</div>
	</details>
</template>
