<script setup lang="ts">
import { useAppDatabase } from '~/composables/useAppDatabase';
import { useDexieLiveQuery } from '~/composables/useDexieLiveQuery';
import { extractLifecycleRuleDiffs } from '~/core/habit-engine';
import { formatJalaliHuman } from '~/domain/calendar';
import { LIFECYCLE_EVENT_META, LIFECYCLE_FILTER_OPTIONS } from '~/domain/constants';
import type { LifecycleEventType } from '~/domain/schemas';
import { ArrowLeft, Filter, GitCommitHorizontal } from 'lucide-vue-next';

const db = useAppDatabase();
const events = useDexieLiveQuery(() => db.lifecycleEvents.orderBy('createdAtIso').reverse().toArray(), []);
const isEventsLoading = events.isLoading;
const eventsError = events.error;

const selectedFilter = ref<LifecycleEventType | 'ALL'>('ALL');

const filteredEvents = computed(() =>
	selectedFilter.value === 'ALL'
		? events.value
		: events.value.filter((e) => e.eventType === selectedFilter.value)
);
</script>

<template>
	<div class="space-y-6 pb-16">
		<div class="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) sm:px-7">
			<div class="flex items-center gap-3">
				<div class="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text">
					<GitCommitHorizontal class="h-6 w-6" />
				</div>
				<h1 class="text-xl font-black text-fg sm:text-2xl">تاریخچه تغییرات</h1>
			</div>

			<div class="flex flex-wrap items-center gap-1.5 text-xs">
				<Filter class="h-4 w-4 text-fg-muted" />
				<button
					v-for="item in LIFECYCLE_FILTER_OPTIONS"
					:key="item.id"
					type="button"
					class="rounded-xl border px-3 py-1.5 font-extrabold transition"
					:class="
						selectedFilter === item.id
							? 'border-accent bg-accent text-accent-fg shadow-xs'
							: 'border-border bg-elevated text-fg-secondary hover:text-fg'
					"
					@click="selectedFilter = item.id"
				>
					{{ item.label }}
				</button>
			</div>
		</div>

		<div v-if="isEventsLoading" class="space-y-4" aria-busy="true">
			<div v-for="idx in 4" :key="idx" class="h-28 animate-pulse rounded-2xl border border-border bg-surface"></div>
		</div>

		<div
			v-else-if="eventsError"
			class="rounded-3xl border border-failed-border bg-surface p-8 text-center shadow-(--shadow-soft)"
		>
			<p class="text-sm font-extrabold text-failed">{{ eventsError }}</p>
		</div>

		<div v-else-if="filteredEvents.length === 0" class="rounded-3xl border border-dashed border-border bg-surface p-12 text-center text-xs font-bold text-fg-muted">
			رویدادی متناسب با این فیلتر یافت نشد.
		</div>

		<NuxtErrorBoundary v-else>
			<div class="relative space-y-4 before:absolute before:top-4 before:right-5 before:bottom-4 before:w-0.5 before:bg-border">
				<div v-for="ev in filteredEvents" :key="ev.id" class="relative pr-12">
					<div class="absolute top-4 right-3.5 h-3.5 w-3.5 rounded-full border-2 border-accent bg-surface"></div>

					<div class="rounded-2xl border border-border bg-surface p-5 shadow-(--shadow-soft) transition hover:border-border-strong">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div class="flex flex-wrap items-center gap-2">
								<span
									class="rounded-lg border px-2.5 py-0.5 text-xs font-extrabold"
									:class="LIFECYCLE_EVENT_META[ev.eventType]?.badgeClasses"
								>
									{{ LIFECYCLE_EVENT_META[ev.eventType]?.label }}
								</span>
								<h3 class="text-sm font-extrabold text-fg">{{ ev.habitTitleSnapshot }}</h3>
							</div>

							<span class="text-xs font-medium text-fg-muted">{{ formatJalaliHuman(ev.effectiveDateIso).fullLabel }}</span>
						</div>

						<p
							v-if="ev.eventType === 'CONVERTED_TO_SUBHABIT' || ev.eventType === 'CADENCE_UPDATED' || ev.eventType === 'STATUS_CHANGED'"
							class="mt-2 text-xs font-semibold text-fg-secondary"
						>
							{{ ev.summary }}
						</p>

						<!-- جزئیات تغییرات و مقادیر قبلی/جدید (Diff View) -->
						<div v-if="extractLifecycleRuleDiffs(ev.previousStateJson, ev.newStateJson).length > 0" class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
							<div
								v-for="diff in extractLifecycleRuleDiffs(ev.previousStateJson, ev.newStateJson)"
								:key="diff.fieldLabel"
								class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-elevated px-3 py-2 text-xs"
							>
								<span class="font-extrabold text-fg-secondary">{{ diff.fieldLabel }}:</span>
								<div class="flex items-center gap-1.5 font-bold">
									<span class="text-fg-muted line-through">{{ diff.previousValue }}</span>
									<ArrowLeft class="h-3 w-3 text-accent-text" />
									<span class="font-extrabold text-accent-text">{{ diff.newValue }}</span>
								</div>
							</div>
						</div>

						<div v-if="ev.reason && ev.reason !== 'تعریف طرح جدید'" class="mt-2.5 rounded-xl border border-border bg-elevated px-3 py-2 text-xs text-fg-secondary">
							<strong class="font-extrabold text-fg">دلیل: </strong>
							<span>{{ ev.reason }}</span>
						</div>
					</div>
				</div>
			</div>

			<template #error="{ error, clearError }">
				<div class="rounded-3xl border border-failed-border bg-surface p-6 text-center shadow-(--shadow-soft)">
					<p class="text-sm font-extrabold text-failed">
						{{ error?.message || 'خطا در نمایش تاریخچه تغییرات' }}
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
