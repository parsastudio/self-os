<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useClientAuth } from '~/composables/useClientAuth';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, WifiOff } from 'lucide-vue-next';

definePageMeta({
	layout: false
});

const router = useRouter();
const clientAuth = useClientAuth();

const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);

onMounted(async () => {
	try {
		const res = await fetch('/api/auth/status');
		if (res.ok) {
			const data = await res.json();
			if (data.isAuthenticated) {
				router.push('/');
				return;
			}
			await clientAuth.checkAuth(data.isAuthenticated, data.isPasswordConfigured);
		}
	} catch {
		await clientAuth.checkAuth();
		if (clientAuth.isAuthenticated.value) {
			router.push('/');
		}
	}
});

async function handleLogin() {
	if (!password.value.trim() || isSubmitting.value) return;
	isSubmitting.value = true;
	errorMessage.value = null;

	try {
		if (navigator.onLine) {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ password: password.value })
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.statusMessage || 'رمز عبور نادرست است');
			}

			await clientAuth.saveClientCredential(password.value);
			router.push('/');
			return;
		}

		const offlineRes = await clientAuth.loginOffline(password.value);
		if (offlineRes.success) {
			router.push('/');
		} else {
			errorMessage.value = offlineRes.error || 'رمز عبور وارد شده نادرست است';
		}
	} catch (err: unknown) {
		errorMessage.value = err instanceof Error ? err.message : 'خطای ارتباط با سرور';
	} finally {
		isSubmitting.value = false;
	}
}

async function handleSetup() {
	if (password.value !== confirmPassword.value) {
		errorMessage.value = 'رمز عبور و تکرار آن یکسان نیستند';
		return;
	}
	isSubmitting.value = true;
	errorMessage.value = null;

	try {
		const res = await fetch('/api/auth/setup', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				password: password.value,
				confirmPassword: confirmPassword.value
			})
		});

		if (!res.ok) {
			const data = await res.json();
			throw new Error(data.statusMessage || 'خطا در تعیین رمز عبور');
		}

		await clientAuth.saveClientCredential(password.value);
		router.push('/');
	} catch (err: unknown) {
		errorMessage.value = err instanceof Error ? err.message : 'خطا در ثبت رمز عبور';
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
						v-if="typeof navigator !== 'undefined' && !navigator.onLine"
						class="inline-flex items-center gap-1 rounded-lg border border-gold-border bg-gold-soft px-2 py-0.5 text-[10px] font-black text-gold-text"
					>
						<WifiOff class="h-3 w-3" />
						<span>ورود آفلاین</span>
					</span>
				</div>

				<p class="mt-1.5 text-xs leading-6 font-bold text-fg-secondary">
					{{
						clientAuth.isPasswordConfigured.value
							? 'با وارد کردن رمز عبور، نشست شما تا یک سال روی این دستگاه به صورت امن فعال می‌ماند.'
							: 'برای محافظت از اطلاعات شخصی، یک رمز عبور امن برای دسترسی تعیین کنید.'
					}}
				</p>
			</div>

			<div v-if="errorMessage" class="mb-5 rounded-2xl border border-failed-border bg-failed-soft px-4 py-3 text-center text-xs font-extrabold text-failed">
				{{ errorMessage }}
			</div>

			<!-- فرم لاگین -->
			<form v-if="clientAuth.isPasswordConfigured.value" class="space-y-4" @submit.prevent="handleLogin">
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

				<button
					type="submit"
					:disabled="isSubmitting"
					class="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-extrabold text-accent-fg shadow-xs transition hover:opacity-90 active:scale-98 disabled:opacity-60"
				>
					<KeyRound class="h-4 w-4" />
					<span>{{ isSubmitting ? 'در حال بررسی...' : 'ورود و ذخیره نشست' }}</span>
				</button>
			</form>

			<!-- فرم تعریف رمز اولیه -->
			<form v-else class="space-y-4" @submit.prevent="handleSetup">
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
