<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDailyTracker } from '~/composables/useDailyTracker';
import { useLocalRepository } from '~/composables/useLocalRepository';
import { computeUpcomingEventsBanner } from '~/core/calendar-engine';
import { getTodayIso, getYesterdayIso, toPersianDigits } from '~/domain/calendar';
import type { HabitTimeSlot, HabitTreeNode } from '~/domain/schemas';
import JalaliDateScrubber from '~/components/tracker/JalaliDateScrubber.vue';
import UpcomingEventsBanner from '~/components/tracker/UpcomingEventsBanner.vue';
import TrackerActionToolbar from '~/components/tracker/TrackerActionToolbar.vue';
import CadenceHabitCard from '~/components/tracker/CadenceHabitCard.vue';
import TieredHabitCard from '~/components/tracker/TieredHabitCard.vue';
import DailyJournalSection from '~/components/tracker/DailyJournalSection.vue';
import { Moon, Sun, Sunrise } from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const localRepo = useLocalRepository();

async function handleToggleCalendarEvent(eventId: string, isCompleted: boolean) {
	await localRepo.calendar.toggleComplete(eventId, isCompleted);
}

const currentDateIso = computed(() => {
	const param = route.query.date as string | undefined;
	if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
		return param;
	}
	return getYesterdayIso();
});

const tracker = useDailyTracker(currentDateIso);

function navigateToDate(iso: string) {
	router.push({ query: { ...route.query, date: iso } });
}

const bannerCalculation = computed(() =>
	computeUpcomingEventsBanner({
		allEvents: tracker.calendarEvents.value,
		referenceDateIso: currentDateIso.value,
		todayIso: getTodayIso(),
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
		<JalaliDateScrubber
			:current-date-iso="currentDateIso"
			:recent-entries="tracker.allEntries.value"
			:live-day-status="tracker.computedDayStatus.value"
			:is-live-dirty="tracker.isDirty.value"
			:has-existing-entry="Boolean(tracker.entry.value)"
			:save-state="tracker.saveState.value"
			:completion-stats="tracker.completionStats.value"
			@select-date="navigateToDate"
			@retry-save="tracker.flushPendingSave"
		/>

		<UpcomingEventsBanner
			:upcoming-items="upcomingBannerItems"
			:selected-day-events="activeSelectedDayEvents"
			:current-date-iso="currentDateIso"
			@toggle-complete="handleToggleCalendarEvent"
			@open-calendar-date="(iso) => router.push({ path: '/calendar', query: { date: iso } })"
		/>

		<div v-if="tracker.habits.isLoading.value" class="space-y-4" aria-busy="true">
			<div class="h-18 animate-pulse rounded-3xl border border-border bg-surface"></div>
			<div v-for="idx in 3" :key="idx" class="h-24 animate-pulse rounded-3xl border border-border bg-surface"></div>
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

		<template v-else>
			<TrackerActionToolbar
				:cadence-habits="tracker.tree.value.cadenceHabits"
				:tomorrow-iso="tracker.tomorrowIso.value"
				:available-tags="tracker.availableTags.value"
				:selected-tags="tracker.selectedTags.value"
				:reflection-note="tracker.reflectionNote.value"
				:tomorrow-plans="tracker.tomorrowPlansByHabitId.value"
				@mark-all-optimal="tracker.markAllOptimalFiveSecond"
				@clear-day="tracker.clearDay"
				@toggle-tag="tracker.toggleTag"
				@update-reflection-note="(val) => { tracker.reflectionNote.value = val; tracker.scheduleAutoSave(750); }"
				@update-tomorrow-plan="(id, mins) => tracker.setTomorrowPlanMinutes(id, mins)"
				@copy-today-to-tomorrow="tracker.copyTodayActualsToTomorrowPlan"
				@save-tomorrow-plans="tracker.saveTomorrowCadencePlans"
			/>

			<!-- بخش عادات ریتمی تکرارشونده -->
			<div v-if="tracker.tree.value.cadenceHabits.length > 0" class="space-y-4">
				<CadenceHabitCard
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
						<TieredHabitCard
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
			<DailyJournalSection
				v-model="tracker.journalText.value"
				@change="tracker.scheduleAutoSave(750)"
				@open-memories="router.push('/memories')"
			/>
		</template>
	</div>
</template>
