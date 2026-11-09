<script setup lang="ts">
interface Props {
	message?: string | null;
	fallbackMessage?: string;
	retryable?: boolean;
}

withDefaults(defineProps<Props>(), {
	message: null,
	fallbackMessage: 'خطا در بارگذاری اطلاعات',
	retryable: false
});

const emit = defineEmits<{
	(e: 'retry'): void;
}>();
</script>

<template>
	<div class="rounded-3xl border border-failed-border bg-surface p-6 text-center shadow-(--shadow-soft) sm:p-8">
		<p class="text-sm font-extrabold text-failed">
			{{ message || fallbackMessage }}
		</p>
		<button
			v-if="retryable"
			type="button"
			class="mt-3 h-10 rounded-xl bg-accent px-5 text-xs font-extrabold text-accent-fg transition hover:opacity-90"
			@click="emit('retry')"
		>
			تلاش مجدد
		</button>
	</div>
</template>
