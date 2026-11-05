<script setup lang="ts">
import { toPersianDigits } from '~/domain/calendar';
import { BookOpen, Plus } from 'lucide-vue-next';

interface Props {
	completedCount: number;
	readingCount: number;
}

defineProps<Props>();

const emit = defineEmits<{
	(e: 'openCreate'): void;
}>();
</script>

<template>
	<div
		class="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-4.5 shadow-(--shadow-soft) sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-6 sm:p-6 sm:px-8"
	>
		<div class="flex items-center gap-3">
			<div
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text sm:h-12 sm:w-12"
			>
				<BookOpen class="h-5 w-5 sm:h-6 sm:w-6" />
			</div>
			<h1 class="text-xl font-black tracking-tight text-fg sm:text-2xl">کتابخانه شخصی</h1>
		</div>

		<div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3.5">
			<div class="grid w-full grid-cols-2 gap-2.5 sm:w-auto sm:flex sm:items-center sm:gap-3.5">
				<div
					class="flex flex-col items-center justify-center rounded-2xl border border-optimal-border bg-optimal-soft px-3.5 py-2.5 text-center sm:min-w-32 sm:px-5 sm:py-3"
				>
					<div class="font-mono text-xl font-black text-optimal sm:text-2xl">{{ toPersianDigits(completedCount) }}</div>
					<div class="mt-0.5 whitespace-nowrap text-xs font-bold text-optimal">خوانده‌شده</div>
				</div>
				<div
					class="flex flex-col items-center justify-center rounded-2xl border border-gold-border bg-gold-soft px-3.5 py-2.5 text-center sm:min-w-32 sm:px-5 sm:py-3"
				>
					<div class="font-mono text-xl font-black text-gold-text sm:text-2xl">{{ toPersianDigits(readingCount) }}</div>
					<div class="mt-0.5 whitespace-nowrap text-xs font-bold text-gold-text">در حال مطالعه</div>
				</div>
			</div>

			<button
				type="button"
				class="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-xs font-extrabold text-accent-fg shadow-xs transition hover:opacity-90 active:scale-98 sm:h-12 sm:w-auto sm:text-sm"
				@click="emit('openCreate')"
			>
				<Plus class="h-4 w-4" />
				<span>افزودن کتاب جدید</span>
			</button>
		</div>
	</div>
</template>
