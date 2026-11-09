<script setup lang="ts">
import { useAppDatabase } from '~/composables/useAppDatabase';
import { useDexieLiveQuery } from '~/composables/useDexieLiveQuery';
import { useLocalRepository } from '~/composables/useLocalRepository';
import type { CreateHabitInput, HabitEntity, MutateHabitStructureInput } from '~/domain/schemas';
import ArchitectHabitCard from '~/components/architect/ArchitectHabitCard.vue';
		<!-- مودال درج و ویرایش طرح -->
		<LazyArchitectHabitUpsertModal
			v-if="activeModal"
import { BarChart3, GitCommitHorizontal, Plus } from 'lucide-vue-next';
=======
import ArchivedHabitsSection from '~/components/architect/ArchivedHabitsSection.vue';
import { BarChart3, GitCommitHorizontal, Plus } from 'lucide-vue-next';
=======
		<!-- مودال درج و ویرایش طرح -->
		<LazyArchitectHabitUpsertModal
			v-if="activeModal"
import { BarChart3, GitCommitHorizontal, Plus } from 'lucide-vue-next';

const router = useRouter();
const db = useAppDatabase();
const localRepo = useLocalRepository();
const habits = useDexieLiveQuery(() => db.habits.orderBy('sortOrder').toArray(), []);
const isHabitsLoading = habits.isLoading;

const activeModal = ref<'create' | 'edit' | null>(null);
const isSubmittingHabit = ref(false);
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

async function handleCreateHabit(payload: CreateHabitInput) {
	if (isSubmittingHabit.value) return;
	isSubmittingHabit.value = true;
	try {
		await localRepo.habits.create(payload);
		closeModal();
	} finally {
		isSubmittingHabit.value = false;
	}
}

async function handleUpdateHabit(payload: MutateHabitStructureInput) {
	if (isSubmittingHabit.value) return;
	isSubmittingHabit.value = true;
	try {
		await localRepo.habits.update(payload);
		closeModal();
	} finally {
		isSubmittingHabit.value = false;
	}
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

		<div v-if="isHabitsLoading" class="grid grid-cols-1 gap-5 md:grid-cols-2" aria-busy="true">
			<div v-for="idx in 4" :key="idx" class="h-48 animate-pulse rounded-3xl border border-border bg-surface"></div>
		</div>

		<!-- گرید کارت‌های طرح‌های اصلی -->
		<div v-else class="grid grid-cols-1 gap-5 md:grid-cols-2">
			<ArchitectHabitCard
				v-for="habit in rootHabits"
				:key="habit.id"
				:habit="habit"
				:children="getChildren(habit.id)"
				@create-sub-habit="openCreateModal"
				@edit-habit="openEditModal"
				@open-stats="(habitId) => router.push({ path: '/analytics', query: { habit: habitId } })"
			/>
		</div>

		<!-- بخش کشویی طرح‌های بایگانی‌شده -->
		<ArchivedHabitsSection :archived-habits="archivedHabits" @edit-habit="openEditModal" />

		<!-- مودال درج و ویرایش طرح -->
		<LazyArchitectHabitUpsertModal
			v-if="activeModal"
			:key="`${activeModal}:${editingHabit?.id ?? createParentId}`"
			:mode="activeModal"
			:editing-habit="editingHabit"
			:has-sub-habits="editingHabit ? getChildren(editingHabit.id).length > 0 : false"
			:initial-parent-id="createParentId"
			:root-habits="rootHabits"
			:is-submitting="isSubmittingHabit"
			@create="handleCreateHabit"
			@update="handleUpdateHabit"
			@close="closeModal"
		/>
	</div>
</template>
