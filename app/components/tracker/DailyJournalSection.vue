<script setup lang="ts">
import { BookHeart } from 'lucide-vue-next';

interface Props {
	modelValue: string;
}

defineProps<Props>();

const emit = defineEmits<{
	(e: 'update:modelValue', value: string): void;
	(e: 'change'): void;
}>();
</script>

<template>
	<section
		class="rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) transition focus-within:border-border-strong sm:px-6"
	>
		<div class="mb-3 flex items-center justify-between gap-2">
			<label for="daily-journal-input" class="flex items-center gap-2 text-sm font-black text-fg">
				<BookHeart class="h-4 w-4 text-accent-text" />
				<span>خاطره و روایت امروز</span>
			</label>
			<NuxtLink to="/memories" class="text-xs font-bold text-fg-secondary transition hover:text-accent-text">
				مشاهده دفتر خاطرات ←
			</NuxtLink>
		</div>

		<textarea
			id="daily-journal-input"
			rows="2"
			:value="modelValue"
			placeholder="چند خط درباره حس‌وحال، اتفاقات مهم یا خاطره این روز بنویسید..."
			class="w-full [field-sizing:content] min-h-19 resize-none overflow-hidden rounded-2xl border border-border bg-elevated px-4 py-3 text-sm leading-7 text-fg placeholder:text-fg-muted focus:border-border-strong focus:bg-surface focus:outline-none"
			@input="
				emit('update:modelValue', ($event.target as HTMLTextAreaElement).value);
				emit('change');
			"
		></textarea>
	</section>
</template>
