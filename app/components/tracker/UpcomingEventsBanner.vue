<script setup lang="ts">
import { toPersianDigits } from '~/domain/calendar';
import type { CalendarEventEntity, PersonEntity, UpcomingEventBannerItem } from '~/domain/schemas';
import { BellRing, Cake, CalendarDays, Check } from 'lucide-vue-next';

interface Props {
	upcomingItems?: UpcomingEventBannerItem[];
	selectedDayEvents?: Array<Pick<CalendarEventEntity, 'id' | 'title' | 'isAnnual' | 'isCompleted'>>;
	selectedDayBirthdays?: Array<Pick<PersonEntity, 'id' | 'name'>>;
	currentDateIso: string;
}

const props = withDefaults(defineProps<Props>(), {
	upcomingItems: () => [],
	selectedDayEvents: () => [],
	selectedDayBirthdays: () => []
});

const emit = defineEmits<{
	(e: 'toggleComplete', eventId: string, isCompleted: boolean): void;
	(e: 'openCalendarDate', dateIso: string): void;
}>();

const hasAnythingToShow = computed(
	() =>
		props.upcomingItems.length > 0 ||
		props.selectedDayEvents.length > 0 ||
		props.selectedDayBirthdays.length > 0
);

function getRelativeText(days: number): string {
	if (days === -1) return 'دیروز (انجام‌نشده)';
	if (days === 0) return 'امروز';
	if (days === 1) return 'فردا';
	if (days === 2) return 'پس‌فردا';
	return `${toPersianDigits(days)} روز دیگر`;
}
</script>

<template>
	<section
		v-if="hasAnythingToShow"
		class="rounded-3xl border border-accent-border bg-surface p-3.5 shadow-(--shadow-card) sm:px-5 sm:py-4"
	>
		<div class="flex flex-wrap items-center gap-2">
			<div
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-accent-border bg-accent-soft text-accent-text"
			>
				<BellRing class="h-4 w-4" />
			</div>

			<div
				v-for="dayEv in selectedDayEvents"
				:key="dayEv.id"
				class="flex items-center gap-2 rounded-2xl border border-accent-border bg-accent-soft px-3 py-1.5 text-xs font-extrabold text-accent-text"
			>
				<button
					type="button"
					class="flex items-center gap-1.5 text-right transition hover:opacity-80"
					@click="emit('openCalendarDate', currentDateIso)"
				>
					<CalendarDays class="h-3.5 w-3.5 shrink-0" />
					<span>در این روز: {{ dayEv.title }}</span>
				</button>
				<button
					v-if="!dayEv.isAnnual"
					type="button"
					class="flex h-5 w-5 items-center justify-center rounded-md border border-current transition active:scale-95"
					:class="dayEv.isCompleted ? 'bg-optimal text-on-solid' : 'bg-surface'"
					:title="dayEv.isCompleted ? 'انجام شد' : 'علامت به عنوان انجام‌شده'"
					@click="emit('toggleComplete', dayEv.id, !dayEv.isCompleted)"
				>
					<Check v-if="dayEv.isCompleted" class="h-3 w-3" />
				</button>
			</div>

			<button
				v-for="bday in selectedDayBirthdays"
				:key="`today-bday-${bday.id}`"
				type="button"
				class="flex items-center gap-1.5 rounded-2xl border border-gold-border bg-gold-soft px-3 py-1.5 text-xs font-extrabold text-gold-text transition hover:opacity-90"
				@click="emit('openCalendarDate', currentDateIso)"
			>
				<Cake class="h-3.5 w-3.5 shrink-0" />
				<span>تولد {{ bday.name }}</span>
			</button>

			<button
				v-for="item in upcomingItems.filter(
					(u) =>
						!selectedDayEvents.some((s) => s.id === u.id) &&
						!selectedDayBirthdays.some((b) => `bday:${b.id}` === u.id)
				)"
				:key="item.id + item.occurrenceDateIso"
				type="button"
				class="flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-xs font-bold transition hover:border-border-strong"
				:class="
					item.kind === 'birthday'
						? 'border-gold-border bg-gold-soft text-gold-text'
						: 'border-border bg-elevated text-fg'
				"
				@click="emit('openCalendarDate', item.occurrenceDateIso)"
			>
				<Cake v-if="item.kind === 'birthday'" class="h-3.5 w-3.5 shrink-0" />
				<span v-else class="h-2 w-2 shrink-0 rounded-full bg-accent"></span>
				<span
					class="font-extrabold"
					:class="item.kind === 'birthday' ? 'text-gold-text' : 'text-accent-text'"
				>
					{{ getRelativeText(item.daysRemaining) }}:
				</span>
				<span>{{ item.title }}</span>
			</button>
		</div>
	</section>
</template>
