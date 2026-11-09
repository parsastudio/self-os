<script setup lang="ts">
import { detectNoteSmartSignals } from '~/core/note-signals';
import { isoToJalaliSlash, toPersianDigits } from '~/domain/calendar';
import type { NoteEntity } from '~/domain/schemas';
import { Check, Copy, ExternalLink, Pencil, Pin, Trash2 } from 'lucide-vue-next';

interface Props {
	note: NoteEntity;
	isCopied?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	isCopied: false
});

const emit = defineEmits<{
	(e: 'copy', note: NoteEntity): void;
	(e: 'edit', note: NoteEntity): void;
	(e: 'togglePin', noteId: string, isPinned: boolean): void;
	(e: 'delete', noteId: string): void;
}>();

const signals = computed(() => detectNoteSmartSignals(`${props.note.title} ${props.note.content}`));
</script>

<template>
	<article
		class="group flex flex-col justify-between rounded-3xl border p-5 shadow-(--shadow-soft) transition hover:border-border-strong"
		:class="
			note.isPinned
				? 'border-accent-border bg-surface ring-1 ring-accent-border/40'
				: 'border-border bg-surface'
		"
	>
		<div>
			<div class="flex items-center justify-between gap-2">
				<span class="truncate rounded-xl border border-border bg-elevated px-2.5 py-1 text-[11px] font-extrabold text-fg-secondary">
					{{ note.category }}
				</span>

				<div class="flex shrink-0 items-center gap-1">
					<button
						type="button"
						class="flex h-8 w-8 items-center justify-center rounded-xl text-fg-muted transition hover:bg-elevated hover:text-fg active:scale-95"
						title="کپی متن"
						@click="emit('copy', note)"
					>
						<Check v-if="isCopied" class="h-4 w-4 text-optimal" />
						<Copy v-else class="h-4 w-4" />
					</button>

					<button
						type="button"
						class="flex h-8 w-8 items-center justify-center rounded-xl transition active:scale-95"
						:class="
							note.isPinned
								? 'border border-accent-border bg-accent-soft text-accent-text'
								: 'text-fg-muted hover:bg-elevated hover:text-fg'
						"
						:title="note.isPinned ? 'برداشتن سنجاق' : 'سنجاق به بالای لیست'"
						@click="emit('togglePin', note.id, !note.isPinned)"
					>
						<Pin class="h-4 w-4" :class="{ 'fill-current': note.isPinned }" />
					</button>
				</div>
			</div>

			<h3 v-if="note.title" class="mt-3 text-base font-black leading-snug text-fg">{{ note.title }}</h3>

			<p
				dir="rtl"
				class="mt-2.5 line-clamp-6 whitespace-pre-line break-words text-right text-xs leading-6 font-medium text-fg-secondary select-text"
			>
				{{ note.content }}
			</p>
		</div>

		<div class="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-fg-muted">
			<span dir="ltr" class="shrink-0 font-mono text-[11px] font-bold">
				{{ toPersianDigits(isoToJalaliSlash(note.updatedAtIso.slice(0, 10))) }}
			</span>

			<div class="flex shrink-0 items-center gap-1">
				<a
					v-if="signals.firstUrl"
					:href="signals.firstUrl"
					target="_blank"
					rel="noopener noreferrer"
					class="flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-accent-border bg-accent-soft px-2.5 text-[11px] font-extrabold whitespace-nowrap text-accent-text transition hover:opacity-90 active:scale-95"
					title="باز کردن لینک"
				>
					<span>باز کردن لینک</span>
					<ExternalLink class="h-3.5 w-3.5 shrink-0" />
				</a>

				<button
					type="button"
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-fg-muted transition hover:bg-elevated hover:text-fg active:scale-95"
					title="ویرایش یادداشت"
					@click="emit('edit', note)"
				>
					<Pencil class="h-3.5 w-3.5" />
				</button>

				<button
					type="button"
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-fg-muted transition hover:bg-failed-soft hover:text-failed active:scale-95"
					title="حذف یادداشت"
					@click="emit('delete', note.id)"
				>
					<Trash2 class="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	</article>
</template>
