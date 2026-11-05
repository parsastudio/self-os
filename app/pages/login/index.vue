<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useClientAuth } from '~/composables/useClientAuth';
import { useSyncEngine } from '~/composables/useSyncEngine';
import { toPersianDigits } from '~/domain/calendar';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, Timer, WifiOff } from 'lucide-vue-next';

definePageMeta({
	layout: false
});

const route = useRoute();
const router = useRouter();
const clientAuth = useClientAuth();
const syncEngine = useSyncEngine();

function resolvePostLoginPath(): string {
	const target = route.query.redirectTo;
	if (typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')) {
		return target;
	}
	return '/';
}

const password = ref('');
const confirmPassword = ref('');
const honeypotWebsite = ref('');
const showPassword = ref(false);
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);
const failedAttempts = ref(0);
const activeAttemptNumber = ref(0);
const countdownRemainingMs = ref(0);
const countdownTotalMs = ref(0);
let countdownInterval: ReturnType<typeof setInterval> | null = null;

const isClientOffline = computed(() => !syncEngine.isOnline.value);

const showMinimalTimer = computed(
	() => activeAttemptNumber.value >= 4 && countdownRemainingMs.value > 0
);

const formattedCountdownSeconds = computed(() => {
	const secs = (countdownRemainingMs.value / 1000).toFixed(1);
	return toPersianDigits(secs);
});

const timerProgressPercent = computed(() => {
	if (countdownTotalMs.value <= 0) return 0;
	return Math.max(0, Math.min(100, (countdownRemainingMs.value / countdownTotalMs.value) * 100));
});

function resolveAttemptDelayMs(attemptNumber: number): number {
	if (attemptNumber <= 1) return 0;
	if (attemptNumber === 2) return 2000;
	if (attemptNumber === 3) return 3000;
	return 5000;
}

function stopCountdownTimer() {
	if (countdownInterval) {
		clearInterval(countdownInterval);
		countdownInterval = null;
	}
	countdownRemainingMs.value = 0;
	countdownTotalMs.value = 0;
}

function startCountdownTimer(durationMs: number): Promise<void> {
	stopCountdownTimer();
	if (durationMs <= 0) return Promise.resolve();

	countdownTotalMs.value = durationMs;
	countdownRemainingMs.value = durationMs;
	const endTime = Date.now() + durationMs;

	return new Promise((resolve) => {
		countdownInterval = setInterval(() => {
			const remaining = Math.max(0, endTime - Date.now());
			countdownRemainingMs.value = remaining;
			if (remaining <= 0) {
				stopCountdownTimer();
				resolve();
			}
		}, 80);
	});
}

function extractErrorText(err: unknown, fallback: string): string {
	if (err && typeof err === 'object' && 'data' in err) {
		const data = (err as {
			data?: {
				statusMessage?: string;
				data?: { failedAttempts?: number };
			};
		}).data;
		if (typeof data?.data?.failedAttempts === 'number') {
			failedAttempts.value = Math.max(failedAttempts.value, data.data.failedAttempts);
		}
		if (data?.statusMessage) return data.statusMessage;
	}
	return err instanceof Error ? err.message : fallback;
}

onMounted(async () => {
	syncEngine.init();
	const state = await clientAuth.ensureSessionChecked();
	if (state.isAuthenticated) {
		router.push(resolvePostLoginPath());
	}
});

onUnmounted(() => {
	stopCountdownTimer();
});

async function handleLogin() {
	if (!password.value.trim() || isSubmitting.value) return;

	if (honeypotWebsite.value.trim().length > 0) {
		isSubmitting.value = true;
		errorMessage.value = null;
		await new Promise((r) => setTimeout(r, 2000));
		errorMessage.value = 'رمز عبور وارد شده نادرست است';
		isSubmitting.value = false;
		return;
	}

	isSubmitting.value = true;
	errorMessage.value = null;

	const currentAttempt = failedAttempts.value + 1;
	activeAttemptNumber.value = currentAttempt;
	const delayMs = resolveAttemptDelayMs(currentAttempt);
	const timerPromise = startCountdownTimer(delayMs);

	try {
		if (navigator.onLine) {
			const [res] = await Promise.all([
				$fetch('/api/auth/login', {
					method: 'POST',
					body: {
						password: password.value,
						website: honeypotWebsite.value
					}
				}),
				timerPromise
			]);

			if (res) {
				failedAttempts.value = 0;
				await clientAuth.saveClientCredential(password.value);
				router.push(resolvePostLoginPath());
				return;
			}
		}

		const [offlineRes] = await Promise.all([
			clientAuth.loginOffline(password.value),
			timerPromise
		]);

		if (offlineRes.success) {
			failedAttempts.value = 0;
			router.push(resolvePostLoginPath());
		} else {
			failedAttempts.value = currentAttempt;
			errorMessage.value = offlineRes.error || 'رمز عبور وارد شده نادرست است';
		}
	} catch (err: unknown) {
		await timerPromise;
		failedAttempts.value = Math.max(failedAttempts.value, currentAttempt);
		errorMessage.value = extractErrorText(err, 'رمز عبور وارد شده نادرست است');
	} finally {
		stopCountdownTimer();
		isSubmitting.value = false;
	}
}

async function handleSetup() {
	if (honeypotWebsite.value.trim().length > 0) {
		errorMessage.value = 'درخواست نامعتبر است';
		return;
	}
	if (password.value !== confirmPassword.value) {
		errorMessage.value = 'رمز عبور و تکرار آن یکسان نیستند';
		return;
	}
	isSubmitting.value = true;
	errorMessage.value = null;

	try {
		await $fetch('/api/auth/setup', {
			method: 'POST',
			body: {
				password: password.value,
				confirmPassword: confirmPassword.value,
				website: honeypotWebsite.value
			}
		});

		await clientAuth.saveClientCredential(password.value);
		router.push(resolvePostLoginPath());
	} catch (err: unknown) {
		errorMessage.value = extractErrorText(err, 'خطا در ثبت رمز عبور');
	} finally {
		isSubmitting.value = false;
	}
}
</script>

<template>
	<div class="flex min-h-screen items-center justify-center bg-base p-4 text-fg">
		<div class="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-(--shadow-modal) sm:p-8">
			<div class="mb-6 flex flex-col items-center text-center">
				<div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text shadow-xs">
					<Lock v-if="clientAuth.isPasswordConfigured.value" class="h-7 w-7" />
					<ShieldCheck v-else class="h-7 w-7" />
				</div>

				<div class="flex flex-wrap items-center justify-center gap-2">
					<h1 class="text-xl font-black tracking-tight text-fg sm:text-2xl">
						{{ clientAuth.isPasswordConfigured.value ? 'ورود به فضای شخصی' : 'تعیین رمز عبور اولیه' }}
					</h1>
					<span
						v-if="isClientOffline"
						class="inline-flex items-center gap-1 rounded-lg border border-gold-border bg-gold-soft px-2 py-0.5 text-[10px] font-black text-gold-text"
					>
						<WifiOff class="h-3 w-3" />
						<span>ورود آفلاین</span>
					</span>
				</div>

				<p v-if="!clientAuth.isPasswordConfigured.value" class="mt-1.5 text-xs leading-6 font-bold text-fg-secondary">
					یک رمز عبور برای محافظت از اطلاعات شخصی خود تعیین کنید.
				</p>
			</div>

			<div v-if="errorMessage" class="mb-5 rounded-2xl border border-failed-border bg-failed-soft px-4 py-3 text-center text-xs font-extrabold text-failed">
				{{ errorMessage }}
			</div>

			<!-- فرم لاگین -->
			<form v-if="clientAuth.isPasswordConfigured.value" class="space-y-4" @submit.prevent="handleLogin">
				<!-- فیلد مخفی تله برای ربات‌ها (Honeypot) -->
				<div class="pointer-events-none absolute -z-10 h-0 w-0 overflow-hidden opacity-0" aria-hidden="true">
					<label for="login-website">Website</label>
					<input
						id="login-website"
						v-model="honeypotWebsite"
						type="text"
						name="website"
						tabindex="-1"
						autocomplete="off"
					/>
				</div>

				<div>
					<label for="login-pass" class="mb-1.5 block text-xs font-extrabold text-fg">رمز عبور</label>
					<div class="relative">
						<input
							id="login-pass"
							v-model="password"
							:type="showPassword ? 'text' : 'password'"
							required
							dir="ltr"
							placeholder="••••••••"
							class="h-12 w-full rounded-2xl border border-border bg-elevated pr-4 pl-11 text-center font-mono text-sm font-bold text-fg focus:border-border-strong focus:bg-surface focus:outline-none"
						/>
						<button
							type="button"
							class="absolute top-1/2 left-3 -translate-y-1/2 rounded-lg p-1.5 text-fg-muted transition hover:text-fg"
							aria-label="نمایش یا مخفی‌سازی رمز"
							@click="showPassword = !showPassword"
						>
							<EyeOff v-if="showPassword" class="h-4 w-4" />
							<Eye v-else class="h-4 w-4" />
						</button>
					</div>
				</div>

				<!-- تایمر مینیمال از تلاش چهارم به بعد -->
				<div
					v-if="showMinimalTimer"
					class="overflow-hidden rounded-2xl border border-border bg-elevated px-3.5 py-2.5 transition-all"
				>
					<div class="flex items-center justify-between text-xs font-extrabold text-fg-secondary">
						<span class="inline-flex items-center gap-1.5">
							<Timer class="h-3.5 w-3.5 text-accent-text animate-pulse" />
							<span>بررسی امنیتی</span>
						</span>
						<span class="font-mono text-fg">{{ formattedCountdownSeconds }} ثانیه</span>
					</div>
					<div class="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface">
						<div
							class="h-full rounded-full bg-accent transition-all duration-75"
							:style="{ width: `${timerProgressPercent}%` }"
						></div>
					</div>
				</div>

				<button
					type="submit"
					:disabled="isSubmitting"
					class="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-extrabold text-accent-fg shadow-xs transition hover:opacity-90 active:scale-98 disabled:opacity-60"
				>
					<KeyRound class="h-4 w-4" />
					<span>{{ isSubmitting ? 'در حال بررسی...' : 'ورود' }}</span>
				</button>
			</form>

			<!-- فرم تعریف رمز اولیه -->
			<form v-else class="space-y-4" @submit.prevent="handleSetup">
				<!-- فیلد مخفی تله برای ربات‌ها (Honeypot) -->
				<div class="pointer-events-none absolute -z-10 h-0 w-0 overflow-hidden opacity-0" aria-hidden="true">
					<label for="setup-website">Website</label>
					<input
						id="setup-website"
						v-model="honeypotWebsite"
						type="text"
						name="website"
						tabindex="-1"
						autocomplete="off"
					/>
				</div>

				<div>
					<label for="setup-pass" class="mb-1.5 block text-xs font-extrabold text-fg">رمز عبور جدید</label>
					<input
						id="setup-pass"
						v-model="password"
						type="password"
						required
						minlength="4"
						dir="ltr"
						placeholder="حداقل ۴ کاراکتر"
						class="h-12 w-full rounded-2xl border border-border bg-elevated px-4 text-center font-mono text-sm font-bold text-fg focus:border-border-strong focus:outline-none"
					/>
				</div>

				<div>
					<label for="setup-conf" class="mb-1.5 block text-xs font-extrabold text-fg">تکرار رمز عبور</label>
					<input
						id="setup-conf"
						v-model="confirmPassword"
						type="password"
						required
						minlength="4"
						dir="ltr"
						placeholder="تکرار رمز عبور"
						class="h-12 w-full rounded-2xl border border-border bg-elevated px-4 text-center font-mono text-sm font-bold text-fg focus:border-border-strong focus:outline-none"
					/>
				</div>

				<button
					type="submit"
					:disabled="isSubmitting"
					class="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-extrabold text-accent-fg shadow-xs transition hover:opacity-90 active:scale-98 disabled:opacity-60"
				>
					<ShieldCheck class="h-4 w-4" />
					<span>{{ isSubmitting ? 'در حال ثبت...' : 'ثبت رمز عبور و ورود' }}</span>
				</button>
			</form>
		</div>
	</div>
</template>
