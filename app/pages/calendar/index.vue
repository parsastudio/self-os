<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppDatabase } from '~/composables/useAppDatabase';
import { useDexieLiveQuery } from '~/composables/useDexieLiveQuery';
import { useLocalRepository } from '~/composables/useLocalRepository';
import { assembleJalaliMonthArchive } from '~/core/calendar-engine';
import {
	JALALI_MONTH_NAMES,
	getJalaliMonthLength,
	getTodayIso,
	isoToJalaliParts,
	jalaliPartsToIso,
	toPersianDigits
} from '~/domain/calendar';
import type { CreateCalendarEventInput } from '~/domain/schemas';
import CalendarMonthGrid from '~/components/calendar/CalendarMonthGrid.vue';
import CalendarDayInspector from '~/components/calendar/CalendarDayInspector.vue';
import CustomSelect from '~/components/ui/CustomSelect.vue';
import { BookHeart, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const db = useAppDatabase();
const localRepo = useLocalRepository();
const isSubmittingCalendarEvent = ref(false);

async function handleCreateEvent(payload: CreateCalendarEventInput) {
	if (isSubmittingCalendarEvent.value) return;
	isSubmittingCalendarEvent.value = true;
	try {
		await localRepo.calendar.create(payload);
	} finally {
		isSubmittingCalendarEvent.value = false;
	}
}

async function handleToggleEventComplete(eventId: string, isCompleted: boolean) {
	await localRepo.calendar.toggleComplete(eventId, isCompleted);
}

async function handleDeleteEvent(eventId: string) {
	await localRepo.calendar.delete(eventId);
}

const todayIso = computed(() => getTodayIso());
const todayParts = computed(() => isoToJalaliParts(todayIso.value));

const requestedDate = computed(() => {
	const d = route.query.date as string | undefined;
	return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
});

const currentYear = computed(() => {
	const jyParam = Number(route.query.jy);
	if (!Number.isNaN(jyParam) && jyParam >= 1300 && jyParam <= 1500) return jyParam;
	if (requestedDate.value) return isoToJalaliParts(requestedDate.value).jy;
	return todayParts.value.jy;
});

const currentMonth = computed(() => {
	const jmParam = Number(route.query.jm);
	if (!Number.isNaN(jmParam) && jmParam >= 1 && jmParam <= 12) return jmParam;
	if (requestedDate.value) return isoToJalaliParts(requestedDate.value).jm;
	return todayParts.value.jm;
});

const monthIsoBounds = computed(() => {
	const jy = currentYear.value;
	const jm = currentMonth.value;
	const len = getJalaliMonthLength(jy, jm);
	return {
		startIso: jalaliPartsToIso({ jy, jm, jd: 1 }) ?? todayIso.value,
		endIso: jalaliPartsToIso({ jy, jm, jd: len }) ?? todayIso.value
	};
});

// Live Dexie subscriptions scoped to the active Jalali month
const allHabits = useDexieLiveQuery(() => db.habits.orderBy('sortOrder').toArray(), []);
const monthEntries = useDexieLiveQuery(
	() =>
		db.dailyEntries
			.where('dateIso')
			.between(monthIsoBounds.value.startIso, monthIsoBounds.value.endIso, true, true)
			.toArray(),
	[],
	monthIsoBounds
);
const monthLogs = useDexieLiveQuery(
	() =>
		db.habitLogs
			.where('dateIso')
			.between(monthIsoBounds.value.startIso, monthIsoBounds.value.endIso, true, true)
			.toArray(),
	[],
	monthIsoBounds
);
const allEvents = useDexieLiveQuery(() => db.calendarEvents.toArray(), []);
const allBooks = useDexieLiveQuery(() => db.books.toArray(), []);
const allMedia = useDexieLiveQuery(() => db.media.toArray(), []);

const userSelectedIso = ref<string | null>(null);

const archiveData = computed(() =>
	assembleJalaliMonthArchive({
		jy: currentYear.value,
		jm: currentMonth.value,
		todayIso: todayIso.value,
		selectedIso: requestedDate.value ?? undefined,
		allHabits: allHabits.value,
		entriesInMonth: monthEntries.value,
		logsInMonth: monthLogs.value,
		eventsInMonth: allEvents.value,
		booksInMonth: allBooks.value,
		mediaInMonth: allMedia.value
	})
);

const selectedIso = computed(
	() => userSelectedIso.value || archiveData.value.selectedIso
);

const selectedDay = computed(
	() => archiveData.value.days.find((d) => d.iso === selectedIso.value) ?? archiveData.value.days[0]
);

const prevMonthTarget = computed(() =>
	currentMonth.value === 1
		? { jy: currentYear.value - 1, jm: 12 }
		: { jy: currentYear.value, jm: currentMonth.value - 1 }
);

const nextMonthTarget = computed(() =>
	currentMonth.value === 12
		? { jy: currentYear.value + 1, jm: 1 }
		: { jy: currentYear.value, jm: currentMonth.value + 1 }
);

const monthOptions = JALALI_MONTH_NAMES.map((name, idx) => ({
	value: idx + 1,
	label: name
}));

const yearOptions = computed(() => {
	const base = currentYear.value;
	const list = [];
	for (let y = base - 5; y <= base + 5; y++) {
		list.push({ value: y, label: toPersianDigits(y) });
	}
	return list;
});

function navigateToMonth(jy: number, jm: number) {
	userSelectedIso.value = null;
	router.push({ query: { jy, jm } });
}

function goToToday() {
	userSelectedIso.value = null;
	router.push({ query: { date: todayIso.value } });
}
</script>

<template>
	<div class="space-y-6 pb-12">
		<section class="rounded-3xl border border-border bg-surface p-4 shadow-(--shadow-soft) sm:p-6">
			<div class="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
				<div class="flex items-center justify-between gap-2 sm:justify-start sm:gap-3">
					<div
						class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text"
					>
						<CalendarIcon class="h-5 w-5" />
					</div>

					<h1 class="text-lg font-black tracking-tight text-fg sm:text-2xl">تقویم و رویدادها</h1>
				</div>

				<div class="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
					<div class="flex items-center gap-1.5">
						<button
							type="button"
							class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-elevated text-fg transition hover:border-border-strong active:scale-95"
							aria-label="ماه قبل"
							title="ماه قبل"
							@click="navigateToMonth(prevMonthTarget.jy, prevMonthTarget.jm)"
						>
							<ChevronRight class="h-5 w-5" />
						</button>

						<div class="w-32 sm:w-36">
							<CustomSelect
								:model-value="currentMonth"
								:options="monthOptions"
								trigger-class="h-11 text-fg"
								@select="(val) => navigateToMonth(currentYear, Number(val))"
							/>
						</div>

						<div class="w-24 sm:w-28">
							<CustomSelect
								:model-value="currentYear"
								:options="yearOptions"
								trigger-class="h-11 font-mono text-fg"
								@select="(val) => navigateToMonth(Number(val), currentMonth)"
							/>
						</div>

						<button
							type="button"
							class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-elevated text-fg transition hover:border-border-strong active:scale-95"
							aria-label="ماه بعد"
							title="ماه بعد"
							@click="navigateToMonth(nextMonthTarget.jy, nextMonthTarget.jm)"
						>
							<ChevronLeft class="h-5 w-5" />
						</button>
					</div>

					<button
						type="button"
						class="h-11 rounded-2xl border border-accent-border bg-accent-soft px-4 text-xs font-extrabold text-accent-text transition hover:opacity-90"
						@click="goToToday"
					>
						امروز
					</button>
				</div>
			</div>
		</section>

		<div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
			<!-- گرید ماه جلالی -->
			<div class="space-y-6 lg:col-span-7">
				<CalendarMonthGrid
					:leading-empty-cells="archiveData.leadingEmptyCells"
					:days="archiveData.days"
					:selected-iso="selectedIso"
					@select-day="(iso) => (userSelectedIso = iso)"
				/>

				<!-- کارت خاطره و یادداشت روز انتخابی -->
				<section
					v-if="selectedDay?.entry && (selectedDay.entry.journalText || selectedDay.entry.reflectionNote || selectedDay.entry.tags.length > 0)"
					class="space-y-3.5 rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
				>
					<div class="flex items-center justify-between gap-2">
						<h3 class="flex items-center gap-2 text-sm font-black text-fg">
							<BookHeart class="h-4 w-4 text-accent-text" />
							<span>خاطره و یادداشت {{ selectedDay.fullHumanLabel }}</span>
						</h3>
					</div>

					<p
						v-if="selectedDay.entry.journalText"
						class="whitespace-pre-line rounded-2xl border border-border bg-elevated p-4 text-sm leading-8 text-fg"
					>
						{{ selectedDay.entry.journalText }}
					</p>

					<p v-if="selectedDay.entry.reflectionNote" class="rounded-2xl border border-border bg-elevated px-4 py-3 text-xs leading-6 text-fg-secondary">
						<strong class="font-extrabold text-fg">علت / یادداشت روز: </strong>
						{{ selectedDay.entry.reflectionNote }}
					</p>

					<div v-if="selectedDay.entry.tags.length > 0" class="flex flex-wrap gap-1.5 pt-0.5">
						<span
							v-for="tag in selectedDay.entry.tags"
							:key="tag"
							class="rounded-xl border border-border bg-elevated px-2.5 py-1 text-[11px] font-bold text-fg-secondary"
						>
							#{{ tag }}
						</span>
					</div>
				</section>
			</div>

			<!-- بازرس روز انتخابی -->
			<div class="lg:col-span-5">
				<CalendarDayInspector
					v-if="selectedDay"
					:day="selectedDay"
					:is-submitting-event="isSubmittingCalendarEvent"
					@create-event="handleCreateEvent"
					@toggle-event-complete="handleToggleEventComplete"
					@delete-event="handleDeleteEvent"
					@open-tracker-date="(iso) => router.push({ path: '/', query: { date: iso } })"
				/>
			</div>
		</div>
	</div>
</template>
