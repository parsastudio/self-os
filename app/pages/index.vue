<script setup lang="ts">
import { useDailyTracker } from '~/composables/useDailyTracker';
import { useLiveTodayIso } from '~/composables/useLiveTodayIso';
import { useLocalRepository } from '~/composables/useLocalRepository';
import { computeUpcomingEventsBanner } from '~/core/calendar-engine';
import { formatJalaliHuman, shiftIsoDate, toPersianDigits } from '~/domain/calendar';
import type { HabitTimeSlot, HabitTreeNode } from '~/domain/schemas';
import { Moon, Sun, Sunrise } from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const localRepo = useLocalRepository();
const { todayIso, yesterdayIso } = useLiveTodayIso();

async function handleToggleCalendarEvent(eventId: string, isCompleted: boolean) {
	await localRepo.calendar.toggleComplete(eventId, isCompleted);
}

const currentDateIso = computed(() => {
	const param = route.query.date as string | undefined;
	if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
		return param;
	}
	return yesterdayIso.value;
});

const currentDayRelativeLabel = computed(() => {
	const human = formatJalaliHuman(currentDateIso.value, todayIso.value);
	return human.relativeBadge || `روز ${human.weekday}`;
});

const tracker = useDailyTracker(currentDateIso);
const isHabitsLoading = tracker.habits.isLoading;
const trackerError = computed(
	() => tracker.habits.error.value || tracker.entry.error.value
);

const isSavingTomorrow = ref(false);
const isTomorrowSaved = ref(false);
let tomorrowSavedTimer: ReturnType<typeof setTimeout> | null = null;

async function handleSaveTomorrowPlans() {
	if (isSavingTomorrow.value) return;
	isSavingTomorrow.value = true;
	try {
		await tracker.saveTomorrowCadencePlans();
		isTomorrowSaved.value = true;
		if (tomorrowSavedTimer) clearTimeout(tomorrowSavedTimer);
		tomorrowSavedTimer = setTimeout(() => {
			isTomorrowSaved.value = false;
			tomorrowSavedTimer = null;
		}, 900);
	} finally {
		isSavingTomorrow.value = false;
	}
}

function navigateToDate(iso: string) {
	router.push({ query: { ...route.query, date: iso } });
}

function handleScrubberShortcut(e: KeyboardEvent) {
	const tag = (e.target as HTMLElement | null)?.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
	if (e.key === '[') {
		e.preventDefault();
		navigateToDate(shiftIsoDate(currentDateIso.value, -1));
	} else if (e.key === ']') {
		e.preventDefault();
		navigateToDate(shiftIsoDate(currentDateIso.value, 1));
	}
}

onMounted(() => {
	window.addEventListener('keydown', handleScrubberShortcut);
});

onUnmounted(() => {
	window.removeEventListener('keydown', handleScrubberShortcut);
	if (tomorrowSavedTimer) {
		clearTimeout(tomorrowSavedTimer);
		tomorrowSavedTimer = null;
	}
});

const bannerCalculation = computed(() =>
	computeUpcomingEventsBanner({
		allEvents: tracker.calendarEvents.value,
		referenceDateIso: currentDateIso.value,
		todayIso: todayIso.value,
		horizonDays: 7
	})
);

const activeSelectedDayEvents = computed(() => bannerCalculation.value.selectedDayEvents);
const upcomingBannerItems = computed(() => bannerCalculation.value.todayAndUpcoming);

const timeSlotOrder: ReadonlyArray<{
	slot: HabitTimeSlot;
	icon: typeof Sunrise;
}> = [
	{ slot: 'morning', icon: Sunrise },
	{ slot: 'day', icon: Sun },
	{ slot: 'night', icon: Moon }
];

const groupedTieredSections = computed(() => {
	const groups: Array<{
		slot: HabitTimeSlot;
		icon: typeof Sunrise;
		nodes: HabitTreeNode[];
		completedCount: number;
	}> = [];

	for (const meta of timeSlotOrder) {
		const nodes = tracker.tree.value.tieredRoots.filter((n) => n.timeSlot === meta.slot);
		if (nodes.length > 0) {
			const completedCount = nodes.filter((n) => tracker.isNodeCompleted(n.id)).length;
			groups.push({
				slot: meta.slot,
				icon: meta.icon,
				nodes,
				completedCount
			});
		}
	}
	return groups;
});
</script>

<template>
	<div class="space-y-6 pb-12">
		<TrackerJalaliDateScrubber
			:current-date-iso="currentDateIso"
			:recent-entries="tracker.allEntries.value"
			:live-day-status="tracker.computedDayStatus.value"
			:is-live-dirty="tracker.isDirty.value"
			:has-existing-entry="Boolean(tracker.entry.value)"
			:save-state="tracker.saveState.value"
			:completion-stats="tracker.completionStats.value"
			@select-date="navigateToDate"
			@retry-save="() => tracker.flushPendingSave(true)"
		/>

		<TrackerUpcomingEventsBanner
			:upcoming-items="upcomingBannerItems"
			:selected-day-events="activeSelectedDayEvents"
			:current-date-iso="currentDateIso"
			@toggle-complete="handleToggleCalendarEvent"
			@open-calendar-date="(iso) => router.push({ path: '/calendar', query: { date: iso } })"
		/>

		<div v-if="isHabitsLoading" class="space-y-4" aria-busy="true">
			<div class="h-18 animate-pulse rounded-3xl border border-border bg-surface"></div>
			<div v-for="idx in 3" :key="idx" class="h-24 animate-pulse rounded-3xl border border-border bg-surface"></div>
		</div>

		<div
			v-else-if="trackerError"
			class="rounded-3xl border border-failed-border bg-surface p-8 text-center shadow-(--shadow-soft)"
		>
			<p class="text-sm font-extrabold text-failed">{{ trackerError }}</p>
		</div>

		<div v-else-if="tracker.habits.value.length === 0" class="rounded-3xl border border-border bg-surface p-10 text-center">
			<h2 class="text-xl font-black text-fg">پایگاه داده خالی است</h2>
			<p class="mt-2 text-sm text-fg-secondary">
				طرحی برای ردیابی ثبت نشده است. می‌توانید از بخش «طرح‌ها» اولین طرح خود را ایجاد کنید یا از دیتابیس پشتیبان بگیرید.
			</p>
			<NuxtLink
				to="/architect"
				class="mt-4 inline-flex h-11 items-center justify-center rounded-2xl bg-accent px-5 text-xs font-black text-accent-fg shadow-xs"
			>
				تعریف اولین طرح در معمار طرح‌ها
			</NuxtLink>
		</div>

		<NuxtErrorBoundary v-else>
			<div class="space-y-6">
			<TrackerActionToolbar
				:cadence-habits="tracker.schedulableCadenceHabits.value"
				:tomorrow-iso="tracker.tomorrowIso.value"
				:available-tags="tracker.availableTags.value"
				:selected-tags="tracker.selectedTags.value"
				:reflection-note="tracker.reflectionNote.value"
				:tomorrow-plans="tracker.tomorrowPlansByHabitId.value"
				:is-saving-tomorrow="isSavingTomorrow"
				:is-tomorrow-saved="isTomorrowSaved"
				@mark-all-optimal="tracker.markAllOptimalFiveSecond"
				@clear-day="tracker.clearDay"
				@toggle-tag="tracker.toggleTag"
				@update-reflection-note="(val) => { tracker.reflectionNote.value = val; tracker.scheduleAutoSave(750); }"
				@update-tomorrow-plan="(id, mins) => tracker.setTomorrowPlanMinutes(id, mins)"
				@copy-today-to-tomorrow="tracker.copyTodayActualsToTomorrowPlan"
				@save-tomorrow-plans="handleSaveTomorrowPlans"
			/>

			<!-- بخش عادات ریتمی تکرارشونده -->
			<div v-if="tracker.tree.value.cadenceHabits.length > 0" class="space-y-4">
				<TrackerCadenceHabitCard
					v-for="habit in tracker.tree.value.cadenceHabits"
					:key="habit.id"
					:habit="habit"
					:log="tracker.logsByHabitId.value[habit.id]"
					@update-actual="(id, mins) => tracker.updateCadenceActual(id, mins)"
				/>
			</div>

			<!-- بخش عادات رتبه‌بندی شده تفکیک نوبت زمانی -->
			<div class="space-y-5">
				<div v-for="section in groupedTieredSections" :key="section.slot" class="space-y-2.5">
					<div v-if="groupedTieredSections.length > 1" class="flex items-center gap-2.5 px-2">
						<div class="flex h-7 w-7 items-center justify-center rounded-xl border border-border bg-elevated text-fg-secondary">
							<component :is="section.icon" class="h-3.5 w-3.5" />
						</div>
						<div class="h-px flex-1 bg-border"></div>
						<span class="font-mono text-[11px] font-extrabold text-fg-muted">
							{{ toPersianDigits(section.completedCount) }}/{{ toPersianDigits(section.nodes.length) }}
						</span>
					</div>

					<div class="space-y-2.5">
						<TrackerTieredHabitCard
							v-for="node in section.nodes"
							:key="node.id"
							:node="node"
							:logs-by-habit-id="tracker.logsByHabitId.value"
							:composite-notation="node.children.length > 0 ? tracker.getCompositeNotation(node.id) : undefined"
							@select-tier="(id, tier) => tracker.setTierScore(id, tier)"
							@select-group-tier="(parentId, tier) => tracker.setParentGroupAllTier(parentId, tier)"
						/>
					</div>
				</div>
			</div>

			<!-- بخش خاطره‌نگاری و روایت روزانه -->
			<TrackerDailyJournalSection
				v-model="tracker.journalText.value"
				:day-label="currentDayRelativeLabel"
				@change="tracker.scheduleAutoSave(750)"
				@open-memories="router.push('/memories')"
			/>
			</div>

			<template #error="{ error, clearError }">
				<div class="rounded-3xl border border-failed-border bg-surface p-6 text-center shadow-(--shadow-soft)">
					<p class="text-sm font-extrabold text-failed">
						{{ error?.message || 'خطا در نمایش فهرست طرح‌های روزانه' }}
					</p>
					<button
						type="button"
						class="mt-3 h-10 rounded-xl bg-accent px-5 text-xs font-extrabold text-accent-fg"
						@click="clearError()"
					>
						تلاش مجدد
					</button>
				</div>
			</template>
		</NuxtErrorBoundary>
	</div>
</template>
