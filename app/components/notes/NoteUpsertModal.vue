<script setup lang="ts">
import type { NoteEntity, UpsertNoteInput } from '~/domain/schemas';
import { Tag } from 'lucide-vue-next';

interface Props {
	editingNote?: NoteEntity | null;
	existingCategories: string[];
	isSubmitting?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	editingNote: null,
	existingCategories: () => [],
	isSubmitting: false
});

const emit = defineEmits<{
	(e: 'close'): void;
	(e: 'submit', payload: UpsertNoteInput): void;
}>();

const title = ref(props.editingNote?.title ?? '');
const content = ref(props.editingNote?.content ?? '');
const category = ref(props.editingNote?.category || 'عمومی');

function handleSubmit() {
	if (!content.value.trim() || props.isSubmitting) return;

	emit('submit', {
		noteId: props.editingNote?.id,
		title: title.value.trim(),
		content: content.value.trim(),
		category: category.value.trim() || 'عمومی'
	});
}
</script>

<template>
	<UiBaseModal :title="editingNote ? 'ویرایش یادداشت' : 'افزودن یادداشت جدید'" @close="emit('close')">
		<form class="space-y-4 overflow-y-auto p-5 sm:p-6" @submit.prevent="handleSubmit">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<div class="flex-1">
					<label for="note-title" class="mb-1 block text-xs font-bold text-fg-secondary">عنوان (اختیاری)</label>
					<input
						id="note-title"
						v-model="title"
						placeholder="مثلاً: سایت ابزار هوش مصنوعی / شماره پیگیری..."
						class="h-10 w-full rounded-xl border border-border bg-elevated px-3.5 text-xs font-extrabold text-fg placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
					/>
				</div>

				<div class="w-full sm:w-36">
					<label for="note-cat" class="mb-1 flex items-center gap-1 text-xs font-bold text-fg-secondary">
						<Tag class="h-3 w-3 text-fg-muted" />
						<span>دسته‌بندی</span>
					</label>
					<input
						id="note-cat"
						v-model="category"
						list="note-categories-list"
						placeholder="عمومی"
						class="h-10 w-full rounded-xl border border-border bg-elevated px-3 text-xs font-extrabold text-fg placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
					/>
					<datalist id="note-categories-list">
						<option v-for="cat in existingCategories" :key="cat" :value="cat" />
					</datalist>
				</div>
			</div>

			<div>
				<label for="note-content" class="mb-1.5 block text-xs font-bold text-fg-secondary">
					متن یادداشت، لینک یا شماره
				</label>
				<textarea
					id="note-content"
					v-model="content"
					required
					rows="5"
					placeholder="هر لینک، شماره، دستور یا نکته‌ای که می‌خواهید ذخیره شود را اینجا بنویسید..."
					class="w-full rounded-2xl border border-border bg-elevated p-3.5 text-sm leading-7 text-fg placeholder:text-fg-muted focus:border-border-strong focus:bg-surface focus:outline-none"
				></textarea>
			</div>

			<div class="flex items-center justify-end gap-2 pt-1">
				<button
					type="button"
					class="h-10 rounded-xl px-4 text-xs font-bold text-fg-secondary hover:bg-elevated"
					@click="emit('close')"
				>
					انصراف
				</button>
				<button
					type="submit"
					:disabled="isSubmitting"
					class="h-10 rounded-xl bg-accent px-6 text-xs font-extrabold text-accent-fg shadow-xs transition hover:opacity-90 disabled:opacity-60"
				>
					{{ isSubmitting ? 'در حال ثبت...' : editingNote ? 'ذخیره تغییرات' : 'ثبت یادداشت' }}
				</button>
			</div>
		</form>
	</UiBaseModal>
</template>
