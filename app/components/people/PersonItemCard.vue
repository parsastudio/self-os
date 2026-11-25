<script setup lang="ts">
import { parseNoteContentSegments } from '~/core/note-signals';
import {
	computeJalaliAge,
	formatJalaliBirthdayHuman,
	getDaysUntilNextJalaliBirthday,
	normalizeDigits,
	toPersianDigits
} from '~/domain/calendar';
import type { NoteNumberCopyPayload, PersonEntity } from '~/domain/schemas';
import { Cake, Check, Copy, Pencil, Phone, Pin, Trash2 } from 'lucide-vue-next';

interface Props {
	person: PersonEntity;
	todayIso: string;
	copiedKey?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
	copiedKey: null
});

const emit = defineEmits<{
	(e: 'copyText', payload: NoteNumberCopyPayload): void;
	(e: 'edit', person: PersonEntity): void;
	(e: 'togglePin', personId: string, isPinned: boolean): void;
	(e: 'delete', personId: string): void;
}>();

const isExpanded = ref(false);

const hasBirthday = computed(() =>
	Boolean(props.person.birthdayMonth && props.person.birthdayDay)
);

const birthdayLabel = computed(() => {
	if (!props.person.birthdayMonth || !props.person.birthdayDay) return '';
	return formatJalaliBirthdayHuman({
		year: props.person.birthdayYear,
		month: props.person.birthdayMonth,
		day: props.person.birthdayDay
	});
});

const ageLabel = computed(() => {
	if (
		!props.person.birthdayYear ||
		!props.person.birthdayMonth ||
		!props.person.birthdayDay
	) {
		return null;
	}
	return computeJalaliAge({
		birthYear: props.person.birthdayYear,
		birthMonth: props.person.birthdayMonth,
		birthDay: props.person.birthdayDay,
		referenceIso: props.todayIso
	});
});

const upcomingDaysUntilBirthday = computed<number | null>(() => {
	if (!props.person.birthdayMonth || !props.person.birthdayDay) return null;
	const diff = getDaysUntilNextJalaliBirthday({
		birthMonth: props.person.birthdayMonth,
		birthDay: props.person.birthdayDay,
		todayIso: props.todayIso
	});
	return diff <= 14 ? diff : null;
});

const notesSegments = computed(() =>
	props.person.notes ? parseNoteContentSegments(props.person.notes) : []
);

const isLongNotes = computed(() => {
	const raw = props.person.notes ?? '';
	return raw.length > 200 || raw.split('\n').length > 4;
});

const contactCopyKey = computed(() => `contact:${props.person.id}`);
</script>

<template>
	<article
		class="flex flex-col justify-between rounded-3xl border p-5 shadow-(--shadow-soft) transition hover:border-border-strong"
		:class="
			person.isPinned
				? 'border-accent-border bg-surface ring-1 ring-accent-border/40'
				: 'border-border bg-surface'
		"
	>
		<div>
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0 space-y-1.5">
					<span class="inline-block rounded-xl border border-border bg-elevated px-2.5 py-0.5 text-[11px] font-extrabold text-fg-secondary">
						{{ person.relation }}
					</span>
					<h3 class="truncate text-base font-black text-fg">{{ person.name }}</h3>
				</div>

				<button
					type="button"
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition active:scale-95"
					:class="
						person.isPinned
							? 'border border-accent-border bg-accent-soft text-accent-text'
							: 'text-fg-muted hover:bg-elevated hover:text-fg'
					"
					:title="person.isPinned ? 'برداشتن سنجاق' : 'سنجاق به بالای لیست'"
					@click="emit('togglePin', person.id, !person.isPinned)"
				>
					<Pin class="h-4 w-4" :class="{ 'fill-current': person.isPinned }" />
				</button>
			</div>

			<div v-if="hasBirthday || person.contactInfo" class="mt-3 flex flex-wrap items-center gap-2">
				<div
					v-if="hasBirthday"
					class="inline-flex items-center gap-1.5 rounded-xl border border-gold-border bg-gold-soft px-2.5 py-1 text-[11px] font-extrabold text-gold-text"
				>
					<Cake class="h-3.5 w-3.5 shrink-0" />
					<span>{{ birthdayLabel }}</span>
					<span v-if="ageLabel !== null" class="opacity-85">
						({{ toPersianDigits(ageLabel) }} ساله)
					</span>
					<span
						v-if="upcomingDaysUntilBirthday !== null"
						class="rounded-md bg-surface px-1.5 py-0.2 text-[10px] font-black text-gold-text"
					>
						{{
							upcomingDaysUntilBirthday === 0
								? 'امروز!'
								: upcomingDaysUntilBirthday === 1
									? 'فردا'
									: `${toPersianDigits(upcomingDaysUntilBirthday)} روز دیگر`
						}}
					</span>
				</div>

				<button
					v-if="person.contactInfo"
					type="button"
					dir="ltr"
					class="inline-flex max-w-full items-center gap-1.5 rounded-xl border px-2.5 py-1 font-mono text-[11px] font-extrabold transition active:scale-95"
					:class="
						copiedKey === contactCopyKey
							? 'border-optimal-border bg-optimal-soft text-optimal'
							: 'border-border bg-elevated text-fg-secondary hover:border-accent-border hover:bg-accent-soft hover:text-accent-text'
					"
					title="کلیک برای کپی راه ارتباطی"
					@click="
						emit('copyText', {
							key: contactCopyKey,
							value: normalizeDigits(person.contactInfo)
						})
					"
				>
					<Check v-if="copiedKey === contactCopyKey" class="h-3 w-3 shrink-0" />
					<Phone v-else class="h-3 w-3 shrink-0" />
					<span class="truncate">{{ person.contactInfo }}</span>
				</button>
			</div>

			<div v-if="person.notes" class="mt-3 rounded-2xl border border-border bg-elevated px-3.5 py-2.5">
				<p
					dir="rtl"
					class="whitespace-pre-line break-words text-right text-xs leading-6 font-medium text-fg-secondary select-text"
					:class="{ 'line-clamp-4': isLongNotes && !isExpanded }"
				>
					<template v-for="(seg, idx) in notesSegments" :key="`${person.id}:${idx}`">
						<button
							v-if="seg.kind === 'number'"
							type="button"
							dir="ltr"
							class="mx-0.5 inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.2 align-baseline font-mono text-[11px] font-extrabold transition active:scale-95"
							:class="
								copiedKey === `${person.id}:${idx}`
									? 'border-optimal-border bg-optimal-soft text-optimal'
									: 'border-border bg-surface text-accent-text hover:border-accent-border hover:bg-accent-soft'
							"
							:title="`کلیک برای کپی ${seg.copyValue}`"
							@click.stop="
								emit('copyText', {
									key: `${person.id}:${idx}`,
									value: seg.copyValue
								})
							"
						>
							<Check v-if="copiedKey === `${person.id}:${idx}`" class="h-3 w-3 shrink-0" />
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
					v-if="isLongNotes"
					type="button"
					class="mt-1.5 text-[11px] font-extrabold text-accent-text hover:underline"
					@click="isExpanded = !isExpanded"
				>
					{{ isExpanded ? 'بستن متن' : 'نمایش کامل نکات' }}
				</button>
			</div>
		</div>

		<div class="mt-4 flex items-center justify-end gap-1.5 border-t border-border pt-3">
			<button
				type="button"
				class="flex h-8 items-center gap-1 rounded-xl border border-border bg-elevated px-2.5 text-xs font-bold text-fg-secondary transition hover:border-border-strong hover:text-fg active:scale-95"
				@click="emit('edit', person)"
			>
				<Pencil class="h-3.5 w-3.5" />
				<span>ویرایش</span>
			</button>

			<button
				type="button"
				class="flex h-8 w-8 items-center justify-center rounded-xl text-fg-muted transition hover:bg-failed-soft hover:text-failed active:scale-95"
				title="حذف فرد"
				@click="emit('delete', person.id)"
			>
				<Trash2 class="h-3.5 w-3.5" />
			</button>
		</div>
	</article>
</template>
