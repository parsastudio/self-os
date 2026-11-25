<script setup lang="ts">
import { detectNoteSmartSignals, parseNoteContentSegments } from '~/core/note-signals';
import { isoToJalaliSlash, toPersianDigits } from '~/domain/calendar';
import type { NoteEntity, NoteNumberCopyPayload } from '~/domain/schemas';
import { Check, Copy, ExternalLink, Pencil, Pin, Trash2 } from 'lucide-vue-next';

interface Props {
	note: NoteEntity;
	isCopied?: boolean;
	copiedNumberKey?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
	isCopied: false,
	copiedNumberKey: null
});

const emit = defineEmits<{
	(e: 'copy', note: NoteEntity): void;
	(e: 'copyNumber', payload: NoteNumberCopyPayload): void;
	(e: 'edit', note: NoteEntity): void;
	(e: 'togglePin', noteId: string, isPinned: boolean): void;
	(e: 'delete', noteId: string): void;
}>();

const isExpanded = ref(false);

const signals = computed(() => detectNoteSmartSignals(`${props.note.title} ${props.note.content}`));
const contentSegments = computed(() => parseNoteContentSegments(props.note.content));
const isLongContent = computed(
	() => props.note.content.length > 220 || props.note.content.split('\n').length > 5
);
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

			<div class="mt-2.5">
				<p
					dir="rtl"
					class="whitespace-pre-line break-words text-right text-xs leading-6 font-medium text-fg-secondary select-text"
					:class="{ 'line-clamp-6': isLongContent && !isExpanded }"
				>
					<template v-for="(seg, idx) in contentSegments" :key="`${note.id}:${idx}`">
						<button
							v-if="seg.kind === 'number'"
							type="button"
							dir="ltr"
							class="mx-0.5 inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.2 align-baseline font-mono text-[11px] font-extrabold transition active:scale-95"
							:class="
								copiedNumberKey === `${note.id}:${idx}`
									? 'border-optimal-border bg-optimal-soft text-optimal'
									: 'border-border bg-elevated text-accent-text hover:border-accent-border hover:bg-accent-soft'
							"
							:title="`کلیک برای کپی ${seg.copyValue}`"
							@click.stop="
								emit('copyNumber', {
									key: `${note.id}:${idx}`,
									value: seg.copyValue
								})
							"
						>
							<Check
								v-if="copiedNumberKey === `${note.id}:${idx}`"
								class="h-3 w-3 shrink-0"
							/>
							<Copy v-else class="h-2.5 w-2.5 shrink-0 opacity-75" />
							<span>{{ seg.raw }}</span>
						</button>
						<a
							v-else-if="seg.kind === 'url'"
							:href="seg.href"
							target="_blank"
							rel="noopener noreferrer"
							dir="ltr"
							class="break-all text-accent-text underline decoration-accent-border/60 underline-offset-4 transition hover:opacity-80"
							@click.stop
						>
							{{ seg.raw }}
						</a>
						<template v-else>{{ seg.raw }}</template>
					</template>
				</p>

				<button
					v-if="isLongContent"
					type="button"
					class="mt-1.5 text-[11px] font-extrabold text-accent-text hover:underline"
					@click="isExpanded = !isExpanded"
				>
					{{ isExpanded ? 'بستن متن' : 'مشاهده کامل متن' }}
				</button>
			</div>
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
