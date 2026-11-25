<script setup lang="ts">
import {
	BarChart3,
	BookHeart,
	BookOpen,
	ChevronDown,
	Clapperboard,
	GitCommitHorizontal,
	Layers,
	Users
} from 'lucide-vue-next';

interface Props {
	currentPath: string;
}

const props = defineProps<Props>();

type MenuGroupId = 'plans' | 'more';

const primaryLinks = [
	{ href: '/', label: 'ثبت روزانه' },
	{ href: '/calendar', label: 'تقویم' },
	{ href: '/notes', label: 'یادداشت‌ها' }
] as const;

const planMenuItems = [
	{
		href: '/architect',
		label: 'ساختار طرح‌ها',
		description: 'تعریف، سطح‌بندی و مدیریت طرح‌ها',
		icon: Layers
	},
	{
		href: '/analytics',
		label: 'آمار و روندها',
		description: 'نمودارهای استمرار و مقایسه عملکرد',
		icon: BarChart3
	},
	{
		href: '/timeline',
		label: 'تاریخچه تغییرات',
		description: 'گزارش ویرایش قوانین طرح‌ها',
		icon: GitCommitHorizontal
	}
] as const;

const moreMenuItems = [
	{
		href: '/people',
		label: 'افراد و آشنایان',
		description: 'مخاطبین، نکات مهم و تاریخ تولدها',
		icon: Users
	},
	{
		href: '/memories',
		label: 'دفتر خاطرات',
		description: 'مرور روایت‌ها و نوشته‌های روزانه',
		icon: BookHeart
	},
	{
		href: '/books',
		label: 'کتابخانه شخصی',
		description: 'کتاب‌های در حال مطالعه و خوانده‌شده',
		icon: BookOpen
	},
	{
		href: '/media',
		label: 'فیلم، سریال و انیمه',
		description: 'فهرست تماشا و آرشیو آثار',
		icon: Clapperboard
	}
] as const;

const openMenuId = ref<MenuGroupId | null>(null);
const navContainerEl = ref<HTMLElement | null>(null);

const isPlansGroupActive = computed(() =>
	planMenuItems.some((item) => props.currentPath.startsWith(item.href))
);

const isMoreGroupActive = computed(() =>
	moreMenuItems.some((item) => props.currentPath.startsWith(item.href))
);

function isLinkActive(href: string): boolean {
	if (href === '/') return props.currentPath === '/';
	return props.currentPath.startsWith(href);
}

function toggleMenu(menuId: MenuGroupId) {
	openMenuId.value = openMenuId.value === menuId ? null : menuId;
}

function closeMenu() {
	openMenuId.value = null;
}

function handleWindowClick(e: MouseEvent) {
	if (!openMenuId.value || !navContainerEl.value) return;
	if (!navContainerEl.value.contains(e.target as Node)) {
		openMenuId.value = null;
	}
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key === 'Escape' && openMenuId.value) {
		openMenuId.value = null;
	}
}

watch(
	() => props.currentPath,
	() => {
		openMenuId.value = null;
	}
);

onMounted(() => {
	window.addEventListener('click', handleWindowClick);
	window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
	window.removeEventListener('click', handleWindowClick);
	window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
	<nav
		ref="navContainerEl"
		aria-label="منوی اصلی"
		class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] sm:gap-2 sm:overflow-visible [&::-webkit-scrollbar]:hidden"
	>
		<NuxtLink
			v-for="item in primaryLinks"
			:key="item.href"
			:to="item.href"
			class="shrink-0 whitespace-nowrap rounded-2xl px-3 py-2 text-xs font-extrabold transition sm:px-4 sm:py-2.5 sm:text-sm"
			:class="
				isLinkActive(item.href)
					? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs'
					: 'text-fg-secondary hover:bg-elevated hover:text-fg'
			"
		>
			{{ item.label }}
		</NuxtLink>

		<!-- منوی کشویی طرح‌ها و آمار -->
		<div class="shrink-0 sm:relative">
			<button
				type="button"
				aria-haspopup="menu"
				:aria-expanded="openMenuId === 'plans'"
				class="flex items-center gap-1 whitespace-nowrap rounded-2xl px-3 py-2 text-xs font-extrabold transition sm:px-3.5 sm:py-2.5 sm:text-sm"
				:class="
					isPlansGroupActive
						? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs'
						: openMenuId === 'plans'
							? 'bg-elevated text-fg'
							: 'text-fg-secondary hover:bg-elevated hover:text-fg'
				"
				@click="toggleMenu('plans')"
			>
				<span>طرح‌ها</span>
				<ChevronDown
					class="h-3.5 w-3.5 shrink-0 transition-transform duration-200"
					:class="{ 'rotate-180': openMenuId === 'plans' }"
				/>
			</button>

			<div
				v-if="openMenuId === 'plans'"
				role="menu"
				class="fixed inset-x-3 top-16 z-50 rounded-3xl border border-border-strong bg-surface p-2 shadow-(--shadow-modal) sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-72"
			>
				<NuxtLink
					v-for="sub in planMenuItems"
					:key="sub.href"
					:to="sub.href"
					role="menuitem"
					class="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition"
					:class="
						isLinkActive(sub.href)
							? 'bg-accent-soft text-accent-text'
							: 'text-fg hover:bg-elevated'
					"
					@click="closeMenu"
				>
					<div
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
						:class="
							isLinkActive(sub.href)
								? 'border-accent-border bg-surface text-accent-text'
								: 'border-border bg-elevated text-fg-secondary'
						"
					>
						<component :is="sub.icon" class="h-4 w-4" />
					</div>
					<div class="min-w-0">
						<div class="text-xs font-black">{{ sub.label }}</div>
						<div class="mt-0.5 truncate text-[11px] font-medium text-fg-muted">
							{{ sub.description }}
						</div>
					</div>
				</NuxtLink>
			</div>
		</div>

		<!-- منوی کشویی افراد و آرشیوها -->
		<div class="shrink-0 sm:relative">
			<button
				type="button"
				aria-haspopup="menu"
				:aria-expanded="openMenuId === 'more'"
				class="flex items-center gap-1 whitespace-nowrap rounded-2xl px-3 py-2 text-xs font-extrabold transition sm:px-3.5 sm:py-2.5 sm:text-sm"
				:class="
					isMoreGroupActive
						? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs'
						: openMenuId === 'more'
							? 'bg-elevated text-fg'
							: 'text-fg-secondary hover:bg-elevated hover:text-fg'
				"
				@click="toggleMenu('more')"
			>
				<span>بیشتر</span>
				<ChevronDown
					class="h-3.5 w-3.5 shrink-0 transition-transform duration-200"
					:class="{ 'rotate-180': openMenuId === 'more' }"
				/>
			</button>

			<div
				v-if="openMenuId === 'more'"
				role="menu"
				class="fixed inset-x-3 top-16 z-50 rounded-3xl border border-border-strong bg-surface p-2 shadow-(--shadow-modal) sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-72"
			>
				<NuxtLink
					v-for="sub in moreMenuItems"
					:key="sub.href"
					:to="sub.href"
					role="menuitem"
					class="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition"
					:class="
						isLinkActive(sub.href)
							? 'bg-accent-soft text-accent-text'
							: 'text-fg hover:bg-elevated'
					"
					@click="closeMenu"
				>
					<div
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
						:class="
							isLinkActive(sub.href)
								? 'border-accent-border bg-surface text-accent-text'
								: 'border-border bg-elevated text-fg-secondary'
						"
					>
						<component :is="sub.icon" class="h-4 w-4" />
					</div>
					<div class="min-w-0">
						<div class="text-xs font-black">{{ sub.label }}</div>
						<div class="mt-0.5 truncate text-[11px] font-medium text-fg-muted">
							{{ sub.description }}
						</div>
					</div>
				</NuxtLink>
			</div>
		</div>
	</nav>
</template>
