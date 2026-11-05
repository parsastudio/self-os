<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useSyncEngine } from '~/composables/useSyncEngine';
import { useTheme } from '~/composables/useTheme';
import { toPersianDigits } from '~/domain/calendar';
import {
	Cloud,
	CloudOff,
	RefreshCw,
	Settings
} from 'lucide-vue-next';

const route = useRoute();
const syncEngine = useSyncEngine();
const theme = useTheme();

const isLoginPage = computed(() => route.path.startsWith('/login'));

onMounted(() => {
	theme.init();
	syncEngine.init();
});

const navItems = [
	{ href: '/', label: 'ثبت روزانه' },
	{ href: '/calendar', label: 'تقویم' },
	{ href: '/memories', label: 'خاطرات' },
	{ href: '/notes', label: 'یادداشت‌ها' },
	{ href: '/architect', label: 'طرح‌ها' },
	{ href: '/books', label: 'کتابخانه' },
	{ href: '/media', label: 'فیلم و انیمه' }
];

function isActive(href: string, currentPath: string): boolean {
	if (href === '/') return currentPath === '/';
	if (href === '/architect' && currentPath.startsWith('/analytics')) return true;
	return currentPath.startsWith(href);
}
</script>

<template>
	<div class="min-h-screen bg-base text-fg">
		<header class="sticky top-0 z-30 border-b border-border bg-surface">
			<div class="mx-auto flex max-w-4xl items-center justify-between gap-2.5 px-3.5 py-3 sm:gap-4 sm:px-6 sm:py-4">
				<nav
					v-if="!isLoginPage"
					class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] sm:gap-2 [&::-webkit-scrollbar]:hidden"
				>
					<NuxtLink
						v-for="item in navItems"
						:key="item.href"
						:to="item.href"
						class="shrink-0 rounded-2xl px-3 py-2 text-xs font-extrabold transition sm:px-4 sm:py-2.5 sm:text-sm"
						:class="
							isActive(item.href, route.path)
								? 'border border-accent-border bg-accent-soft text-accent-text shadow-xs'
								: 'text-fg-secondary hover:bg-elevated hover:text-fg'
						"
					>
						{{ item.label }}
					</NuxtLink>
				</nav>
				<div v-else class="text-sm font-black text-fg">ردیابی طرح‌ها</div>

				<div class="flex shrink-0 items-center gap-2">
					<template v-if="!isLoginPage">
						<button
							type="button"
							class="flex h-10 items-center gap-1.5 rounded-2xl border px-2.5 text-xs font-extrabold transition sm:h-11 sm:px-3"
							:class="
								syncEngine.status.value === 'synced'
									? 'border-border bg-elevated text-fg-secondary hover:border-border-strong hover:text-fg'
									: syncEngine.status.value === 'syncing'
										? 'border-accent-border bg-accent-soft text-accent-text'
										: syncEngine.status.value === 'offline' || syncEngine.status.value === 'local_pending'
											? 'border-gold-border bg-gold-soft text-gold-text'
											: 'border-failed-border bg-failed-soft text-failed'
							"
							:title="
								syncEngine.status.value === 'synced'
									? 'همگام با سرور و دیتابیس Dexie محلی'
									: syncEngine.status.value === 'syncing'
										? 'در حال همگام‌سازی...'
										: syncEngine.status.value === 'offline'
											? 'حالت آفلاین (ذخیره روی دستگاه)'
											: syncEngine.status.value === 'local_pending'
												? 'در انتظار ارسال به سرور'
												: 'خطا در همگام‌سازی — کلیک برای تلاش مجدد'
							"
							@click="syncEngine.syncNow({ checkRemoteUpdates: true })"
						>
							<RefreshCw v-if="syncEngine.status.value === 'syncing'" class="h-4 w-4 animate-spin" />
							<template v-else-if="syncEngine.status.value === 'offline'">
								<CloudOff class="h-4 w-4" />
								<span class="hidden sm:inline">آفلاین</span>
								<span
									v-if="syncEngine.pendingCount.value > 0"
									class="rounded-full bg-surface px-1.5 py-0.2 font-mono text-[10px] font-black"
								>
									{{ toPersianDigits(syncEngine.pendingCount.value) }}
								</span>
							</template>
							<template v-else-if="syncEngine.status.value === 'local_pending'">
								<Cloud class="h-4 w-4" />
								<span v-if="syncEngine.pendingCount.value > 0" class="font-mono text-[11px] font-black">
									{{ toPersianDigits(syncEngine.pendingCount.value) }}
								</span>
							</template>
							<RefreshCw v-else-if="syncEngine.status.value === 'error'" class="h-4 w-4" />
							<Cloud v-else class="h-4 w-4 text-optimal" />
						</button>

						<NuxtLink
							to="/settings"
							class="flex h-10 w-10 items-center justify-center rounded-2xl border transition sm:h-11 sm:w-11"
							:class="
								route.path.startsWith('/settings')
									? 'border-accent-border bg-accent-soft text-accent-text shadow-xs'
									: 'border-border bg-elevated text-fg-secondary hover:border-border-strong hover:text-fg'
							"
							title="تنظیمات، تم و پشتیبان‌گیری"
							aria-label="تنظیمات، تم و پشتیبان‌گیری"
						>
							<Settings class="h-4.5 w-4.5" />
						</NuxtLink>
					</template>
				</div>
			</div>
		</header>

		<main class="mx-auto max-w-4xl px-3.5 py-5 sm:px-6 sm:py-8">
			<slot />
		</main>
	</div>
</template>
