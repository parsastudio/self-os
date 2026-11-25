<script setup lang="ts">
import { useAppDatabase } from '~/composables/useAppDatabase';
import { useDexieLiveQuery } from '~/composables/useDexieLiveQuery';
import { useLiveTodayIso } from '~/composables/useLiveTodayIso';
import { useLocalRepository } from '~/composables/useLocalRepository';
import { getDaysUntilNextJalaliBirthday, toPersianDigits } from '~/domain/calendar';
import type {
	NoteNumberCopyPayload,
	PersonEntity,
	PersonSortBy,
	UpsertPersonInput
} from '~/domain/schemas';
import { Cake, Plus, Search, Users } from 'lucide-vue-next';

const db = useAppDatabase();
const localRepo = useLocalRepository();
const { todayIso } = useLiveTodayIso();

const rawPeople = useDexieLiveQuery(() => db.people.orderBy('updatedAtIso').reverse().toArray(), []);
const isPeopleLoading = rawPeople.isLoading;
const peopleError = rawPeople.error;

const searchQuery = ref('');
const selectedRelation = ref<string>('ALL');
const onlyWithBirthday = ref(false);
const sortBy = ref<PersonSortBy>('pinned_newest');
const isModalOpen = ref(false);
const isSubmittingPerson = ref(false);
const editingPerson = ref<PersonEntity | null>(null);
const copiedKey = ref<string | null>(null);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

const sortOptions: ReadonlyArray<{ value: PersonSortBy; label: string }> = [
	{ value: 'pinned_newest', label: 'سنجاق و جدیدترین' },
	{ value: 'upcoming_birthday', label: 'نزدیک‌ترین تولد' },
	{ value: 'name_asc', label: 'حروف الفبا' }
];

const defaultRelationSuggestions = ['دوست', 'خانواده', 'فامیل', 'همکار', 'آشنا', 'همکلاسی'];

const relationSuggestions = computed(() => {
	const set = new Set<string>(defaultRelationSuggestions);
	for (const p of rawPeople.value) {
		if (p.relation.trim()) set.add(p.relation.trim());
	}
	return Array.from(set);
});

const existingRelations = computed(() => {
	const set = new Set<string>();
	for (const p of rawPeople.value) {
		if (p.relation.trim()) set.add(p.relation.trim());
	}
	return Array.from(set);
});

const birthdayCount = computed(
	() => rawPeople.value.filter((p) => Boolean(p.birthdayMonth && p.birthdayDay)).length
);

const filteredPeople = computed(() => {
	const q = searchQuery.value.trim().toLowerCase();

	const filtered = rawPeople.value.filter((p) => {
		if (selectedRelation.value !== 'ALL' && p.relation !== selectedRelation.value) {
			return false;
		}
		if (onlyWithBirthday.value && (!p.birthdayMonth || !p.birthdayDay)) {
			return false;
		}
		if (q) {
			const haystack = `${p.name} ${p.relation} ${p.contactInfo ?? ''} ${p.notes ?? ''}`.toLowerCase();
			if (!haystack.includes(q)) return false;
		}
		return true;
	});

	return [...filtered].sort((a, b) => {
		if (sortBy.value === 'upcoming_birthday') {
			const daysA =
				a.birthdayMonth && a.birthdayDay
					? getDaysUntilNextJalaliBirthday({
							birthMonth: a.birthdayMonth,
							birthDay: a.birthdayDay,
							todayIso: todayIso.value
						})
					: Number.POSITIVE_INFINITY;
			const daysB =
				b.birthdayMonth && b.birthdayDay
					? getDaysUntilNextJalaliBirthday({
							birthMonth: b.birthdayMonth,
							birthDay: b.birthdayDay,
							todayIso: todayIso.value
						})
					: Number.POSITIVE_INFINITY;
			if (daysA !== daysB) return daysA - daysB;
			return a.name.localeCompare(b.name, 'fa');
		}

		if (sortBy.value === 'name_asc') {
			return a.name.localeCompare(b.name, 'fa');
		}

		const pinDiff = (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
		if (pinDiff !== 0) return pinDiff;
		return b.updatedAtIso > a.updatedAtIso ? 1 : b.updatedAtIso < a.updatedAtIso ? -1 : 0;
	});
});

async function copyTextToClipboard(text: string): Promise<boolean> {
	if (!import.meta.client) return false;
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// Fallback for non-HTTPS local network contexts
		}
	}
	try {
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.setAttribute('readonly', '');
		textarea.style.position = 'fixed';
		textarea.style.opacity = '0';
		document.body.appendChild(textarea);
		textarea.select();
		const ok = document.execCommand('copy');
		document.body.removeChild(textarea);
		return ok;
	} catch {
		return false;
	}
}

async function handleCopyText(payload: NoteNumberCopyPayload) {
	if (!(await copyTextToClipboard(payload.value))) return;
	copiedKey.value = payload.key;
	if (copyResetTimer) clearTimeout(copyResetTimer);
	copyResetTimer = setTimeout(() => {
		copiedKey.value = null;
		copyResetTimer = null;
	}, 1600);
}

onUnmounted(() => {
	if (copyResetTimer) clearTimeout(copyResetTimer);
});

function openCreateModal() {
	editingPerson.value = null;
	isModalOpen.value = true;
}

function openEditModal(person: PersonEntity) {
	editingPerson.value = person;
	isModalOpen.value = true;
}

function closeModal() {
	isModalOpen.value = false;
	editingPerson.value = null;
}

async function handleSavePerson(payload: UpsertPersonInput) {
	if (isSubmittingPerson.value) return;
	isSubmittingPerson.value = true;
	try {
		if (payload.personId) {
			await localRepo.people.update(payload.personId, payload);
		} else {
			await localRepo.people.create(payload);
		}
		closeModal();
	} finally {
		isSubmittingPerson.value = false;
	}
}

async function handleTogglePin(personId: string, isPinned: boolean) {
	await localRepo.people.togglePin(personId, isPinned);
}

async function handleDeletePerson(personId: string) {
	await localRepo.people.delete(personId);
}
</script>

<template>
	<div class="space-y-6 pb-16">
		<section class="rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
			<div class="flex flex-wrap items-center justify-between gap-4">
				<div class="flex items-center gap-3.5">
					<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text">
						<Users class="h-6 w-6" />
					</div>
					<div>
						<h1 class="text-xl font-black tracking-tight text-fg sm:text-2xl">افراد و آشنایان</h1>
						<span class="text-xs font-bold text-fg-secondary">
							{{ toPersianDigits(rawPeople.length) }} نفر ثبت‌شده
							<template v-if="birthdayCount > 0">
								• {{ toPersianDigits(birthdayCount) }} تاریخ تولد
							</template>
						</span>
					</div>
				</div>

				<div class="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
					<div v-if="rawPeople.length > 0" class="relative flex-1 sm:w-56 sm:flex-initial">
						<Search class="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-fg-muted" />
						<input
							v-model="searchQuery"
							type="search"
							placeholder="جستجو در افراد یا جزئیات..."
							class="h-11 w-full rounded-2xl border border-border bg-elevated pr-9 pl-3.5 text-xs font-bold text-fg placeholder:font-normal placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
						/>
					</div>

					<div v-if="rawPeople.length > 1" class="w-full sm:w-44">
						<UiCustomSelect
							v-model="sortBy"
							:options="sortOptions"
							trigger-class="h-11 text-xs font-extrabold text-fg"
						/>
					</div>

					<button
						type="button"
						class="flex h-11 items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-xs font-extrabold text-accent-fg shadow-xs transition hover:opacity-90 active:scale-98 sm:text-sm"
						@click="openCreateModal"
					>
						<Plus class="h-4 w-4" />
						<span>افزودن فرد جدید</span>
					</button>
				</div>
			</div>

			<div
				v-if="rawPeople.length > 0"
				class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
			>
				<div class="flex flex-wrap items-center gap-1.5">
					<button
						type="button"
						class="rounded-xl px-3 py-1.5 text-xs font-extrabold transition"
						:class="
							selectedRelation === 'ALL'
								? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs'
								: 'bg-elevated text-fg-secondary hover:text-fg'
						"
						@click="selectedRelation = 'ALL'"
					>
						همه
					</button>
					<button
						v-for="rel in existingRelations"
						:key="rel"
						type="button"
						class="rounded-xl px-3 py-1.5 text-xs font-extrabold transition"
						:class="
							selectedRelation === rel
								? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs'
								: 'bg-elevated text-fg-secondary hover:text-fg'
						"
						@click="selectedRelation = selectedRelation === rel ? 'ALL' : rel"
					>
						{{ rel }}
					</button>
				</div>

				<button
					v-if="birthdayCount > 0"
					type="button"
					class="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition"
					:class="
						onlyWithBirthday
							? 'border border-gold-border bg-gold-soft text-gold-text shadow-xs'
							: 'bg-elevated text-fg-secondary hover:text-fg'
					"
					@click="onlyWithBirthday = !onlyWithBirthday"
				>
					<Cake class="h-3.5 w-3.5" />
					<span>دارای تاریخ تولد</span>
				</button>
			</div>
		</section>

		<div v-if="isPeopleLoading" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
			<div v-for="idx in 6" :key="idx" class="h-44 animate-pulse rounded-3xl border border-border bg-surface"></div>
		</div>

		<UiErrorStateCard v-else-if="peopleError" :message="peopleError" />

		<div
			v-else-if="rawPeople.length === 0"
			class="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-surface p-12 text-center"
		>
			<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-elevated text-fg-muted">
				<Users class="h-8 w-8" />
			</div>
			<h2 class="text-base font-extrabold text-fg">هنوز فردی ثبت نشده است</h2>
			<p class="mt-1.5 max-w-md text-xs leading-6 text-fg-muted">
				اطلاعات دوستان، همکاران و آشنایان جدید، نکات مهم درباره آن‌ها و تاریخ تولدشان را اینجا ثبت کنید تا تولدها به‌صورت خودکار در تقویم یادآوری شوند.
			</p>
			<button
				type="button"
				class="mt-5 inline-flex h-11 items-center gap-2 rounded-2xl bg-accent px-5 text-xs font-extrabold text-accent-fg shadow-xs transition hover:opacity-90"
				@click="openCreateModal"
			>
				<Plus class="h-4 w-4" />
				<span>ثبت اولین فرد</span>
			</button>
		</div>

		<div
			v-else-if="filteredPeople.length === 0"
			class="rounded-3xl border border-border bg-surface p-10 text-center text-sm font-semibold text-fg-muted"
		>
			فردی مطابق با این فیلتر یا عبارت جستجو یافت نشد.
		</div>

		<NuxtErrorBoundary v-else>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<PeoplePersonItemCard
					v-for="person in filteredPeople"
					:key="person.id"
					:person="person"
					:today-iso="todayIso"
					:copied-key="copiedKey"
					@copy-text="handleCopyText"
					@edit="openEditModal"
					@toggle-pin="handleTogglePin"
					@delete="handleDeletePerson"
				/>
			</div>

			<template #error="{ error, clearError }">
				<UiErrorStateCard
					:message="error?.message"
					fallback-message="خطا در نمایش فهرست افراد"
					retryable
					@retry="clearError()"
				/>
			</template>
		</NuxtErrorBoundary>

		<LazyPeoplePersonUpsertModal
			v-if="isModalOpen"
			:key="editingPerson?.id ?? 'new'"
			:editing-person="editingPerson"
			:existing-relations="relationSuggestions"
			:is-submitting="isSubmittingPerson"
			@submit="handleSavePerson"
			@close="closeModal"
		/>
	</div>
</template>
