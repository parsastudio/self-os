<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppDatabase } from '~/composables/useAppDatabase';
import { useDexieLiveQuery } from '~/composables/useDexieLiveQuery';
import type { HabitEntity } from '~/domain/schemas';
import ArchitectHabitCard from '~/components/architect/ArchitectHabitCard.vue';
import ArchivedHabitsSection from '~/components/architect/ArchivedHabitsSection.vue';
import HabitUpsertModal from '~/components/architect/HabitUpsertModal.vue';
import { BarChart3, GitCommitHorizontal, Plus } from 'lucide-vue-next';

const db = useAppDatabase();
const habits = useDexieLiveQuery(() => db.habits.orderBy('sortOrder').toArray(), []);

const activeModal = ref<'create' | 'edit' | null>(null);
const editingHabit = ref<HabitEntity | null>(null);
const createParentId = ref('');

const rootHabits = computed(() => habits.value.filter((h) => h.parentId === null && h.status !== 'archived'));
const archivedHabits = computed(() => habits.value.filter((h) => h.status === 'archived'));

function getChildren(parentId: string): HabitEntity[] {
	return habits.value.filter((h) => h.parentId === parentId && h.status !== 'archived');
}

function openCreateModal(parentId = '') {
	createParentId.value = parentId;
	editingHabit.value = null;
	activeModal.value = 'create';
}

function openEditModal(habit: HabitEntity) {
	editingHabit.value = habit;
	activeModal.value = 'edit';
}

function closeModal() {
	activeModal.value = null;
	editingHabit.value = null;
	createParentId.value = '';
}
</script>

<template>
	<div class="space-y-8 pb-16">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<h1 class="text-2xl font-black text-fg sm:text-3xl">معمار ساختار طرح‌ها</h1>

			<div class="flex flex-wrap items-center gap-2.5">
				<NuxtLink
					to="/timeline"
					class="flex h-11 items-center gap-1.5 rounded-2xl border border-border bg-elevated px-4 text-xs font-extrabold text-fg-secondary transition hover:border-border-strong hover:text-fg sm:h-12"
				>
					<GitCommitHorizontal class="h-4 w-4" />
					<span>تاریخچه وقایع</span>
				</NuxtLink>

				<NuxtLink
					to="/analytics"
					class="flex h-11 items-center gap-2 rounded-2xl border border-accent-border bg-accent-soft px-4.5 text-xs font-extrabold text-accent-text shadow-xs transition hover:opacity-90 active:scale-98 sm:h-12 sm:text-sm"
				>
					<BarChart3 class="h-4.5 w-4.5" />
					<span>مشاهده آمار و روندها</span>
				</NuxtLink>

				<button
					type="button"
					class="flex h-11 items-center gap-2 rounded-2xl bg-accent px-5 text-xs font-extrabold text-accent-fg shadow-(--shadow-soft) transition hover:opacity-90 active:scale-98 sm:h-12 sm:text-sm"
					@click="openCreateModal('')"
				>
					<Plus class="h-4.5 w-4.5" />
					<span>افزودن طرح جدید</span>
				</button>
			</div>
		</div>

		<!-- گرید کارت‌های طرح‌های اصلی -->
		<div class="grid grid-cols-1 gap-5 md:grid-cols-2">
			<ArchitectHabitCard
				v-for="habit in rootHabits"
				:key="habit.id"
				:habit="habit"
				:children="getChildren(habit.id)"
				@create-sub-habit="openCreateModal"
				@edit-habit="openEditModal"
			/>
		</div>

		<!-- بخش کشویی طرح‌های بایگانی‌شده -->
		<ArchivedHabitsSection :archived-habits="archivedHabits" @edit-habit="openEditModal" />

		<!-- مودال درج و ویرایش طرح -->
		<HabitUpsertModal
			v-if="activeModal"
			:key="`${activeModal}:${editingHabit?.id ?? createParentId}`"
			:mode="activeModal"
			:editing-habit="editingHabit"
			:has-sub-habits="editingHabit ? getChildren(editingHabit.id).length > 0 : false"
			:initial-parent-id="createParentId"
			:root-habits="rootHabits"
			@close="closeModal"
		/>
	</div>
</template>
