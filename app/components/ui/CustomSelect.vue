<script setup lang="ts">
import { Check, ChevronDown } from 'lucide-vue-next';
import type { SelectOption } from '~/domain/schemas';

export type { SelectOption };

interface Props {
	id?: string;
	name?: string;
	modelValue: string | number;
	options: ReadonlyArray<SelectOption>;
	disabled?: boolean;
	triggerClass?: string;
	placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
	id: undefined,
	name: undefined,
	disabled: false,
	triggerClass: '',
	placeholder: 'انتخاب کنید'
});

const emit = defineEmits<{
	(e: 'update:modelValue', value: string | number): void;
	(e: 'select', value: string | number): void;
}>();

const isOpen = ref(false);
const containerEl = ref<HTMLDivElement | null>(null);

const selectedOption = computed(
	() => props.options.find((opt) => String(opt.value) === String(props.modelValue)) ?? props.options[0]
);

function toggleDropdown() {
	if (props.disabled) return;
	isOpen.value = !isOpen.value;
}

function selectOption(opt: SelectOption) {
	emit('update:modelValue', opt.value);
	emit('select', opt.value);
	isOpen.value = false;
}

function handleWindowClick(e: MouseEvent) {
	if (!isOpen.value || !containerEl.value) return;
	if (!containerEl.value.contains(e.target as Node)) {
		isOpen.value = false;
	}
}

function handleKeydown(e: KeyboardEvent) {
	if (props.disabled) return;
	if (e.key === 'Escape' && isOpen.value) {
		e.preventDefault();
		isOpen.value = false;
		return;
	}
	if (!isOpen.value && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
		e.preventDefault();
		isOpen.value = true;
		return;
	}
	if (isOpen.value && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
		e.preventDefault();
		const currentIndex = props.options.findIndex((o) => String(o.value) === String(props.modelValue));
		const targetIndex =
			e.key === 'ArrowDown'
				? (currentIndex + 1) % props.options.length
				: (currentIndex - 1 + props.options.length) % props.options.length;
		const targetOpt = props.options[targetIndex];
		if (targetOpt) {
			const nextVal = targetOpt.value;
			emit('update:modelValue', nextVal);
			emit('select', nextVal);
		}
	}
}

onMounted(() => {
	window.addEventListener('click', handleWindowClick);
});

onUnmounted(() => {
	window.removeEventListener('click', handleWindowClick);
});
</script>

<template>
	<div ref="containerEl" class="relative w-full">
		<input v-if="name" type="hidden" :name="name" :value="modelValue" />

		<button
			:id="id"
			type="button"
			:disabled="disabled"
			aria-haspopup="listbox"
			:aria-expanded="isOpen"
			class="flex h-11 w-full items-center justify-between gap-2 rounded-2xl border px-3.5 text-right text-sm font-bold transition focus:outline-none"
			:class="[
				isOpen
					? 'border-border-strong bg-surface ring-2 ring-accent-border'
					: 'border-border bg-elevated hover:border-border-strong',
				disabled ? 'opacity-60 cursor-not-allowed' : '',
				triggerClass
			]"
			@click="toggleDropdown"
			@keydown="handleKeydown"
		>
			<span class="truncate">{{ selectedOption ? selectedOption.label : placeholder }}</span>
			<ChevronDown
				class="h-4 w-4 shrink-0 text-fg-muted transition-transform duration-200"
				:class="{ 'rotate-180 text-accent-text': isOpen }"
			/>
		</button>

		<div
			v-if="isOpen"
			role="listbox"
			class="absolute right-0 left-0 z-50 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-border-strong bg-surface p-1.5 shadow-(--shadow-modal)"
		>
			<button
				v-for="opt in options"
				:key="String(opt.value)"
				type="button"
				role="option"
				:aria-selected="String(opt.value) === String(modelValue)"
				class="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-right text-xs font-extrabold transition"
				:class="
					String(opt.value) === String(modelValue)
						? 'bg-accent-soft text-accent-text'
						: 'text-fg hover:bg-elevated'
				"
				@click="selectOption(opt)"
			>
				<span class="truncate">{{ opt.label }}</span>
				<Check v-if="String(opt.value) === String(modelValue)" class="h-4 w-4 shrink-0 text-accent-text" />
			</button>
		</div>
	</div>
</template>
