<script setup lang="ts">
import { ref, computed } from 'vue';
import { formatJalaliHuman, toPersianDigits } from '~/domain/calendar';
import type { HabitEntity } from '~/domain/schemas';
import { CalendarClock, Copy, Eraser, MessageSquarePlus, Sparkles } from 'lucide-vue-next';

interface Props {
	cadenceHabits: HabitEntity[];
	tomorrowIso: string;
	availableTags: string[];
	selectedTags: string[];
	reflectionNote: string;
	tomorrowPlans: Record<string, { plannedMinutesPerInterval: number }>;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	(e: 'markAllOptimal'): void;
	(e: 'clearDay'): void;
	(e: 'toggleTag', tag: string): void;
	(e: 'updateReflectionNote', text: string): void;
	(e: 'copyTodayToTomorrow'): void;
	(e: 'saveTomorrowPlans'): void;
}>();

const showReflectionDrawer = ref(false);
const showTomorrowDrawer = ref(false);

const tomorrowHuman = computed(() => formatJalaliHuman(props.tomorrowIso));
const activeNotesBadgeCount = computed(
	() => props.selectedTags.length + (props.reflectionNote.trim().length > 0 ? 1 : 0)
);
</script>

<template>
	<div class="rounded-3xl border border-border bg-surface p-4 shadow-(--shadow-soft) sm:px-6">
		<div class="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
			<div class="flex w-full items-center gap-2 sm:w-auto">
				<button
					type="button"
					class="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-xs font-black text-accent-fg shadow-xs transition hover:opacity-90 active:scale-98 sm:flex-initial sm:px-5 sm:text-sm"
					@click="emit('markAllOptimal')"
				>
					<Sparkles class="h-4 w-4 shrink-0" />
					<span>همه عالی انجام شد</span>
				</button>

				<button
					type="button"
					class="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-border bg-elevated px-3 text-xs font-extrabold text-fg-secondary transition hover:border-failed-border hover:bg-failed-soft hover:text-failed sm:px-3.5"
					title="پاک کردن کامل ثبت‌های این روز و بازگشت به حالت ثبت‌نشده"
					@click="emit('clearDay')"
				>
					<Eraser class="h-3.5 w-3.5 shrink-0" />
					<span>پاک کردن روز</span>
				</button>
			</div>

			<div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
				<button
					type="button"
					class="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl border px-3 text-xs font-extrabold transition sm:flex-initial sm:gap-2 sm:px-4"
					:class="
						showReflectionDrawer || activeNotesBadgeCount > 0
							? 'border-accent-border bg-accent-soft text-accent-text'
							: 'border-border bg-elevated text-fg-secondary hover:text-fg'
					"
					@click="showReflectionDrawer = !showReflectionDrawer"
				>
					<MessageSquarePlus class="h-4 w-4 shrink-0" />
					<span class="truncate">علت‌ها و یادداشت</span>
					<span
						v-if="activeNotesBadgeCount > 0"
						class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-black text-accent-fg"
					>
						{{ toPersianDigits(activeNotesBadgeCount) }}
					</span>
				</button>

				<button
					v-if="cadenceHabits.length > 0"
					type="button"
					class="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl border px-3 text-xs font-extrabold transition sm:flex-initial sm:gap-2 sm:px-4"
					:class="
						showTomorrowDrawer
							? 'border-accent-border bg-accent-soft text-accent-text'
							: 'border-border bg-elevated text-fg-secondary hover:text-fg'
					"
					@click="showTomorrowDrawer = !showTomorrowDrawer"
				>
					<CalendarClock class="h-4 w-4 shrink-0" />
					<span class="truncate">تنظیم ریتم فردا</span>
				</button>
			</div>
		</div>

		<!-- کشوی علت‌ها و یادداشت روز -->
		<div v-if="showReflectionDrawer" class="mt-4 space-y-4 border-t border-border pt-4">
			<div class="space-y-2">
				<div class="text-xs font-bold text-fg-secondary">تگ‌های سریع علت کاهش یا افزایش:</div>
				<div class="flex flex-wrap gap-1.5">
					<button
						v-for="tag in availableTags"
						:key="tag"
						type="button"
						class="h-9 rounded-xl border px-3 text-xs font-bold transition"
						:class="
							selectedTags.includes(tag)
								? 'border-accent-border bg-accent text-accent-fg'
								: 'border-border bg-elevated text-fg-secondary hover:text-fg'
						"
						@click="emit('toggleTag', tag)"
					>
						#{{ tag }}
					</button>
				</div>
			</div>

			<div>
				<textarea
					rows="2"
					:value="reflectionNote"
					placeholder="یادداشت کوتاه درباره اتفاقات یا دلایل امروز..."
					class="w-full rounded-2xl border border-border bg-elevated p-3.5 text-sm text-fg placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
					@input="emit('updateReflectionNote', ($event.target as HTMLTextAreaElement).value)"
				></textarea>
			</div>
		</div>

		<!-- کشوی تنظیم ریتم فردا -->
		<div v-if="showTomorrowDrawer && cadenceHabits.length > 0" class="mt-4 space-y-4 border-t border-border pt-4">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h3 class="text-sm font-black text-fg">
						تعیین هدف طرح‌های تکرارشونده برای فردا ({{ tomorrowHuman.fullLabel }})
					</h3>
				</div>

				<button
					type="button"
					class="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-elevated px-3 text-xs font-bold text-fg hover:border-border-strong"
					@click="emit('copyTodayToTomorrow')"
				>
					<Copy class="h-3.5 w-3.5 text-accent-text" />
					<span>کپی از امروز</span>
				</button>
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div
					v-for="habit in cadenceHabits"
					:key="habit.id"
					class="flex items-center justify-between gap-3 rounded-2xl border border-border bg-elevated px-4 py-3"
				>
					<span class="text-sm font-extrabold text-fg">{{ habit.title }}</span>
					<label class="flex items-center gap-2">
						<input
							v-if="tomorrowPlans[habit.id]"
							:value="tomorrowPlans[habit.id]?.plannedMinutesPerInterval"
							type="number"
							min="0"
							step="1"
							class="h-10 w-20 rounded-xl border border-border bg-surface px-3 text-center font-mono text-base font-black text-fg focus:border-border-strong focus:outline-none"
							@input="tomorrowPlans[habit.id] && (tomorrowPlans[habit.id]!.plannedMinutesPerInterval = Number(($event.target as HTMLInputElement).value))"
						/>
						<span class="text-xs font-bold text-fg-secondary">دقیقه</span>
					</label>
				</div>
			</div>

			<div class="flex justify-end">
				<button
					type="button"
					class="h-10 rounded-xl bg-accent px-5 text-xs font-black text-accent-fg transition active:scale-98"
					@click="emit('saveTomorrowPlans')"
				>
					ذخیره برنامه فردا
				</button>
			</div>
		</div>
	</div>
</template>
