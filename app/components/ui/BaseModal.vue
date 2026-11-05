<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { X } from 'lucide-vue-next';

interface Props {
	title?: string;
	subtitle?: string;
	maxWidthClass?: string;
}

withDefaults(defineProps<Props>(), {
	title: '',
	subtitle: '',
	maxWidthClass: 'max-w-lg'
});

const emit = defineEmits<{
	(e: 'close'): void;
}>();

function handleKeydown(e: KeyboardEvent) {
	if (e.key === 'Escape') {
		e.preventDefault();
		emit('close');
	}
}

onMounted(() => {
	window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
	window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
	<Teleport to="body">
		<div
			class="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-2.5 backdrop-blur-xs transition-opacity sm:items-center sm:p-5"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			@click.self="emit('close')"
		>
			<div
				class="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-(--shadow-modal) transition-all"
				:class="maxWidthClass"
			>
				<div class="flex items-center justify-between gap-2 border-b border-border px-5 py-4 sm:px-6">
					<slot name="headerContent">
						<div class="flex min-w-0 items-center gap-2.5">
							<div
								v-if="$slots.headerIcon"
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent-border bg-accent-soft text-accent-text"
							>
								<slot name="headerIcon" />
							</div>
							<div class="min-w-0">
								<h2 class="truncate text-base font-black text-fg sm:text-lg">{{ title }}</h2>
								<p v-if="subtitle" class="mt-0.5 text-xs font-bold text-fg-secondary">{{ subtitle }}</p>
							</div>
						</div>
					</slot>

					<button
						type="button"
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-elevated text-fg-secondary transition hover:text-fg"
						aria-label="بستن"
						@click="emit('close')"
					>
						<X class="h-4 w-4" />
					</button>
				</div>

				<slot />
			</div>
		</div>
	</Teleport>
</template>
