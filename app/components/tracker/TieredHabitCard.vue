<script setup lang="ts">
import { ref, computed } from 'vue';
import {
	buildTierButtonDescriptors,
	getMaxSupportedTier,
	resolveCompositeChildrenState,
	resolveHabitRuleSnapshot
} from '~/core/habit-engine';
import { COMPOSITE_FULL_LABEL, TIER_SCORES } from '~/domain/constants';
import type { HabitLogItemInput, HabitTreeNode } from '~/domain/schemas';
import { resolveTierButtonWidthClass } from '~/utils/ui-tokens';
import { Check, ChevronDown, ChevronUp, Minus, X } from 'lucide-vue-next';

interface Props {
	node: HabitTreeNode;
	logsByHabitId: Record<string, HabitLogItemInput>;
	compositeNotation?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	(e: 'selectTier', habitId: string, tier: number): void;
	(e: 'selectGroupTier', parentId: string, tier: number): void;
}>();

const isExpanded = ref(false);
const hasChildren = computed(() => props.node.children && props.node.children.length > 0);
const maxTier = computed(() => getMaxSupportedTier(props.node));
const currentLog = computed(() => props.logsByHabitId[props.node.id]);
const currentTier = computed(() => currentLog.value?.achievedTier ?? null);
const displayTitle = computed(() => currentLog.value?.habitTitleSnapshot || props.node.title);
const hasSituationalGroup = computed(
	() => Boolean(props.node.isSituational) || props.node.children.some((c) => Boolean(c.isSituational))
);

const compositeState = computed(() =>
	resolveCompositeChildrenState(props.node.children, props.logsByHabitId, maxTier.value)
);

const uniformChildrenTier = computed<number | null>(() => compositeState.value.uniformTier);
const hasMixedChildren = computed<boolean>(() => compositeState.value.hasMixedTiers);
const maxChildSupportedTier = computed<1 | 2 | 3>(() => compositeState.value.maxChildSupportedTier);

const isNodeLogged = computed(() =>
	hasChildren.value
		? compositeState.value.allLogged
		: currentTier.value !== null && currentTier.value !== undefined
);

const activeRuleSubtitle = computed(() => {
	if (hasChildren.value) {
		return props.node.scheduleLabel || '';
	}
	if (currentTier.value !== null && currentTier.value !== undefined) {
		return currentLog.value?.achievedRuleSnapshot || resolveHabitRuleSnapshot(props.node, currentTier.value) || '';
	}
	return props.node.bronzeDesc || props.node.scheduleLabel || '';
});

const effectiveCardTier = computed(() => (hasChildren.value ? uniformChildrenTier.value : currentTier.value));

const cardSurfaceClasses = computed(() => {
	const spacing = 'py-3.5 sm:py-4 shadow-(--shadow-soft)';

	if (hasChildren.value && props.compositeNotation === COMPOSITE_FULL_LABEL) {
		return `${spacing} border-gold-border bg-gold-soft`;
	}
	if (effectiveCardTier.value === TIER_SCORES.SKIPPED) return `${spacing} border-border bg-elevated`;
	if (effectiveCardTier.value === TIER_SCORES.GOLD) return `${spacing} border-gold-border bg-gold-soft`;
	if (effectiveCardTier.value === TIER_SCORES.SILVER) return `${spacing} border-silver-border bg-silver-soft`;
	if (effectiveCardTier.value === TIER_SCORES.BRONZE) return `${spacing} border-bronze-border bg-bronze-soft`;
	if (effectiveCardTier.value === TIER_SCORES.FAILED) return `${spacing} border-failed-border bg-failed-soft`;
	return 'py-3.5 sm:py-4 border-border-strong bg-surface shadow-(--shadow-soft)';
});

function getOptionStyle(selected: number | null, target: number): string {
	if (selected !== target) {
		return 'text-fg-secondary hover:bg-surface hover:text-fg';
	}
	if (target === TIER_SCORES.SKIPPED) return 'bg-muted text-fg font-extrabold border border-border-strong shadow-xs';
	if (target === TIER_SCORES.FAILED) return 'bg-failed text-on-solid font-extrabold shadow-xs';
	if (target === TIER_SCORES.BRONZE) return 'bg-bronze text-on-solid font-extrabold shadow-xs';
	if (target === TIER_SCORES.SILVER) return 'bg-silver text-on-solid font-extrabold shadow-xs';
	return 'bg-gold text-on-solid font-black shadow-xs';
}

const getTierButtons = buildTierButtonDescriptors;
</script>

<template>
	<div class="rounded-3xl border px-4 transition-all duration-200 sm:px-6" :class="cardSurfaceClasses">
		<div class="flex flex-col justify-between gap-3.5 sm:flex-row sm:items-center">
			<div class="min-w-0 space-y-1">
				<div class="flex flex-wrap items-center gap-2.5">
					<span v-if="!isNodeLogged" class="h-2.5 w-2.5 shrink-0 rounded-full bg-accent"></span>
					<span
						v-else-if="effectiveCardTier === TIER_SCORES.FAILED"
						class="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border border-failed-border bg-surface text-failed"
					>
						<X class="h-3.5 w-3.5 stroke-[2.75]" />
					</span>
					<span
						v-else-if="effectiveCardTier === TIER_SCORES.SKIPPED"
						class="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-fg-secondary"
					>
						<Minus class="h-3.5 w-3.5 stroke-[2.75]" />
					</span>
					<span
						v-else
						class="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border bg-surface"
						:class="
							effectiveCardTier === TIER_SCORES.GOLD
								? 'border-gold-border text-gold-text'
								: effectiveCardTier === TIER_SCORES.SILVER
									? 'border-silver-border text-silver-text'
									: 'border-bronze-border text-bronze-text'
						"
					>
						<Check class="h-3.5 w-3.5 stroke-[2.75]" />
					</span>

					<h3 class="text-base font-black text-fg sm:text-lg">{{ displayTitle }}</h3>

					<span
						v-if="node.status === 'archived'"
						class="rounded-lg border border-border bg-surface px-2 py-0.5 text-[10px] font-bold text-fg-muted"
					>
						بایگانی‌شده
					</span>

					<span
						v-if="hasChildren && compositeNotation"
						dir="ltr"
						class="rounded-xl border border-gold-border bg-surface px-2.5 py-0.5 font-mono text-xs font-black text-gold-text"
					>
						{{ compositeNotation }}
					</span>
				</div>
				<p v-if="activeRuleSubtitle" class="text-xs font-semibold text-fg-secondary">{{ activeRuleSubtitle }}</p>
			</div>

			<!-- دکمه‌های سطوح گروه والد -->
			<div v-if="hasChildren" class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
				<div class="flex flex-wrap items-center gap-1 border border-border min-w-0 flex-1 rounded-2xl bg-elevated p-1 sm:w-auto sm:flex-initial sm:gap-1.5 sm:p-1.5">
					<button
						v-for="btn in getTierButtons(maxChildSupportedTier, hasSituationalGroup, false)"
						:key="btn.tier"
						type="button"
						class="flex-1 text-xs whitespace-nowrap transition h-10 rounded-xl px-2.5 sm:h-11"
						:class="[resolveTierButtonWidthClass(btn.sizeVariant), getOptionStyle(uniformChildrenTier, btn.tier)]"
						@click.stop="emit('selectGroupTier', node.id, btn.tier)"
					>
						{{ btn.label }}
					</button>
				</div>

				<button
					type="button"
					class="flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-border bg-elevated px-3 text-xs font-bold text-fg transition hover:border-border-strong sm:px-3.5"
					@click="isExpanded = !isExpanded"
				>
					<span>تک‌به‌تک</span>
					<ChevronUp v-if="isExpanded || hasMixedChildren" class="h-4 w-4 text-fg-secondary" />
					<ChevronDown v-else class="h-4 w-4 text-fg-secondary" />
				</button>
			</div>

			<!-- دکمه‌های سطوح عادت مستقل -->
			<div v-else class="flex flex-wrap items-center gap-1 border border-border min-w-0 flex-1 rounded-2xl bg-elevated p-1 sm:w-auto sm:flex-initial sm:gap-1.5 sm:p-1.5">
				<button
					v-for="btn in getTierButtons(maxTier, Boolean(node.isSituational), true)"
					:key="btn.tier"
					type="button"
					class="flex-1 text-xs whitespace-nowrap transition h-10 rounded-xl px-2.5 sm:h-11"
					:class="[resolveTierButtonWidthClass(btn.sizeVariant), getOptionStyle(currentTier, btn.tier)]"
					@click.stop="emit('selectTier', node.id, btn.tier)"
				>
					{{ btn.label }}
				</button>
			</div>
		</div>

		<!-- ردیف‌های زیرطرح‌های درون گروه -->
		<div v-if="hasChildren && (isExpanded || hasMixedChildren)" class="mt-4 space-y-2.5 border-t border-border pt-4">
			<div
				v-for="sub in node.children"
				:key="sub.id"
				class="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-elevated px-4 py-3 sm:flex-row sm:items-center"
			>
				<div>
					<div class="flex items-center gap-2">
						<span class="text-sm font-extrabold text-fg">{{ logsByHabitId[sub.id]?.habitTitleSnapshot || sub.title }}</span>
						<span v-if="sub.status === 'archived'" class="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] font-bold text-fg-muted">
							بایگانی‌شده
						</span>
					</div>
					<div class="mt-0.5 text-xs font-medium text-fg-secondary">
						{{
							logsByHabitId[sub.id]?.achievedTier !== null && logsByHabitId[sub.id]?.achievedTier !== undefined
								? logsByHabitId[sub.id]?.achievedRuleSnapshot || resolveHabitRuleSnapshot(sub, logsByHabitId[sub.id]?.achievedTier) || sub.bronzeDesc
								: sub.bronzeDesc
						}}
					</div>
				</div>

				<div class="flex flex-wrap items-center gap-1 border border-border w-full rounded-xl bg-surface p-1 sm:w-auto">
					<button
						v-for="btn in getTierButtons(getMaxSupportedTier(sub), Boolean(sub.isSituational || node.isSituational), false)"
						:key="btn.tier"
						type="button"
						class="flex-1 text-xs whitespace-nowrap transition h-9 rounded-lg px-2.5 sm:px-3"
						:class="getOptionStyle(logsByHabitId[sub.id]?.achievedTier ?? null, btn.tier)"
						@click.stop="emit('selectTier', sub.id, btn.tier)"
					>
						{{ btn.label }}
					</button>
				</div>
			</div>
		</div>
	</div>
</template>
