<script setup lang="ts">
import { toPersianDigits } from '~/domain/calendar';
import type { HabitEvolutionItem } from '~/domain/schemas';
import { ArrowLeft, GitCommitHorizontal, TrendingDown, TrendingUp } from 'lucide-vue-next';

interface Props {
	habitTitle: string;
	evolutionTimeline: HabitEvolutionItem[];
}

defineProps<Props>();
</script>

<template>
	<section class="rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
		<div class="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
			<div class="flex items-center gap-2.5">
				<div class="flex h-9 w-9 items-center justify-center rounded-xl border border-accent-border bg-accent-soft text-accent-text">
					<GitCommitHorizontal class="h-5 w-5" />
				</div>
				<h3 class="text-base font-black text-fg">تاریخچه تغییرات «{{ habitTitle }}»</h3>
			</div>

			<span class="rounded-xl border border-border bg-elevated px-3 py-1 text-xs font-extrabold text-fg-secondary">
				{{ toPersianDigits(evolutionTimeline.length) }} رویداد ثبت‌شده
			</span>
		</div>

		<div v-if="evolutionTimeline.length === 0" class="mt-4 rounded-2xl border border-dashed border-border bg-elevated p-6 text-center text-xs font-bold text-fg-muted">
			برای این طرح هنوز تغییر قوانین یا رویداد تکاملی در تاریخچه ثبت نشده است.
		</div>

		<div v-else class="relative mt-5 space-y-4 before:absolute before:top-3 before:right-4 before:bottom-3 before:w-0.5 before:bg-border">
			<div v-for="item in evolutionTimeline" :key="item.id" class="relative pr-10">
				<div class="absolute top-3.5 right-2.5 h-3.5 w-3.5 rounded-full border-2 border-accent bg-surface"></div>

				<div class="rounded-2xl border border-border bg-elevated p-4 transition hover:border-border-strong">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div class="flex flex-wrap items-center gap-2">
							<span class="rounded-lg border px-2.5 py-0.5 text-[11px] font-extrabold" :class="item.badgeClasses">
								{{ item.eventTypeLabel }}
							</span>
							<span class="text-sm font-black text-fg">{{ item.summary }}</span>
						</div>

						<div class="flex items-center gap-2">
							<span
								v-if="item.impactDelta !== null && item.beforeSuccessRate !== null && item.afterSuccessRate !== null"
								class="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-black"
								:class="item.impactDelta >= 0 ? 'border-optimal-border bg-optimal-soft text-optimal' : 'border-failed-border bg-failed-soft text-failed'"
								title="مقایسه کیفیت ۱۴ روز قبل و ۱۴ روز بعد از این تغییر"
							>
								<TrendingUp v-if="item.impactDelta >= 0" class="h-3.5 w-3.5" />
								<TrendingDown v-else class="h-3.5 w-3.5" />
								<span>قبل: %{{ toPersianDigits(item.beforeSuccessRate) }} ← بعد: %{{ toPersianDigits(item.afterSuccessRate) }}</span>
							</span>
							<span class="font-mono text-xs font-bold text-fg-muted">{{ item.humanDateLabel }}</span>
						</div>
					</div>

					<div v-if="item.diffs.length > 0" class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
						<div
							v-for="diff in item.diffs"
							:key="diff.fieldLabel"
							class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs"
						>
							<span class="font-extrabold text-fg-secondary">{{ diff.fieldLabel }}:</span>
							<div class="flex items-center gap-1.5 font-bold">
								<span class="text-fg-muted line-through">{{ diff.previousValue }}</span>
								<ArrowLeft class="h-3 w-3 text-accent-text" />
								<span class="font-extrabold text-accent-text">{{ diff.newValue }}</span>
							</div>
						</div>
					</div>

					<div v-if="item.reason" class="mt-2.5 text-xs text-fg-secondary">
						<strong class="font-extrabold text-fg">دلیل تغییر: </strong>
						<span>{{ item.reason }}</span>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>
