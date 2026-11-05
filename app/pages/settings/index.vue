<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAppDatabase } from '~/composables/useAppDatabase';
import { useDexieLiveQuery } from '~/composables/useDexieLiveQuery';
import { useLocalRepository } from '~/composables/useLocalRepository';
import { useSyncEngine } from '~/composables/useSyncEngine';
import { useTheme } from '~/composables/useTheme';
import { useClientAuth } from '~/composables/useClientAuth';
import { toPersianDigits } from '~/domain/calendar';
import { isDemoRecordId } from '~/domain/demo-seed';
import { DatabaseBackupPayloadSchema } from '~/domain/schemas';
import {
	Check,
	Database,
	Download,
	FlaskConical,
	HardDriveDownload,
	HardDriveUpload,
	KeyRound,
	LogOut,
	Moon,
	Palette,
	Plus,
	Settings,
	ShieldCheck,
	Sun,
	Trash2
} from 'lucide-vue-next';

const router = useRouter();
const db = useAppDatabase();
const localRepo = useLocalRepository();
const syncEngine = useSyncEngine();
const theme = useTheme();
const clientAuth = useClientAuth();

const habits = useDexieLiveQuery(() => db.habits.toArray(), []);
const entries = useDexieLiveQuery(() => db.dailyEntries.toArray(), []);

const selectedFile = ref<File | null>(null);
const currentPassword = ref('');
const newPassword = ref('');
const confirmNewPassword = ref('');
const passwordMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const importMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const demoSeedMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const isExporting = ref(false);
const isImporting = ref(false);
const isMutatingDemoSeed = ref(false);
const isChangingPassword = ref(false);

const activeDemoHabitsCount = computed(
	() => habits.value.filter((h) => isDemoRecordId(h.id)).length
);

async function handleInjectDemoSeed() {
	if (isMutatingDemoSeed.value) return;
	isMutatingDemoSeed.value = true;
	demoSeedMessage.value = null;

	try {
		await localRepo.injectDemoSeed();
		if (navigator.onLine) {
			try {
				await $fetch('/api/backup/demo-seed', {
					method: 'POST',
					body: { action: 'inject' }
				});
			} catch {
				// در حالت آفلاین یا عدم دسترسی، در Dexie محلی تزریق شده است
			}
		}
		demoSeedMessage.value = {
			type: 'success',
			text: 'داده‌های آزمایشی (Seed) با موفقیت اضافه شدند. اکنون می‌توانید تمام بخش‌ها و نمودارها را بررسی کنید.'
		};
	} catch {
		demoSeedMessage.value = {
			type: 'error',
			text: 'خطا در افزودن داده‌های آزمایشی'
		};
	} finally {
		isMutatingDemoSeed.value = false;
	}
}

async function handleRemoveDemoSeed() {
	if (isMutatingDemoSeed.value) return;
	isMutatingDemoSeed.value = true;
	demoSeedMessage.value = null;

	try {
		await localRepo.removeDemoSeed();
		if (navigator.onLine) {
			try {
				await $fetch('/api/backup/demo-seed', {
					method: 'POST',
					body: { action: 'remove' }
				});
			} catch {
				// در حالت آفلاین یا عدم دسترسی، از Dexie محلی حذف شده است
			}
		}
		demoSeedMessage.value = {
			type: 'success',
			text: 'تمام داده‌های آزمایشی به طور کامل و بدون دست زدن به داده‌های شخصی شما حذف شدند.'
		};
	} catch {
		demoSeedMessage.value = {
			type: 'error',
			text: 'خطا در حذف داده‌های آزمایشی'
		};
	} finally {
		isMutatingDemoSeed.value = false;
	}
}

async function exportLocalBackup() {
	isExporting.value = true;
	try {
		const backup = await localRepo.exportBackupPayload();

		const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `new-life-backup-${backup.jalaliDate.replace(/\//g, '-')}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	} finally {
		isExporting.value = false;
	}
}

async function handleFileSelected(e: Event) {
	const input = e.target as HTMLInputElement;
	selectedFile.value = input.files?.[0] ?? null;
}

async function importBackup() {
	if (!selectedFile.value || isImporting.value) return;
	isImporting.value = true;
	importMessage.value = null;

	try {
		const text = await selectedFile.value.text();
		const json = JSON.parse(text);
		const parsed = DatabaseBackupPayloadSchema.safeParse(json);
		if (!parsed.success) {
			importMessage.value = {
				type: 'error',
				text: `فایل بکاپ نامعتبر است: ${parsed.error.issues[0]?.message ?? ''}`
			};
			return;
		}

		await localRepo.restoreBackupPayload(parsed.data);

		if (navigator.onLine) {
			try {
				await $fetch('/api/backup/import', {
					method: 'POST',
					body: parsed.data
				});
				void syncEngine.syncNow({ checkRemoteUpdates: true });
			} catch {
				// در صورت عدم دسترسی موقت به سرور، داده‌های محلی در Dexie بازگردانی شده‌اند
			}
		}

		importMessage.value = {
			type: 'success',
			text: 'پشتیبان با موفقیت بازگردانی شد و داده‌های محلی و سرور به‌روزرسانی شدند.'
		};
		selectedFile.value = null;
	} catch (err) {
		importMessage.value = {
			type: 'error',
			text: 'خواندن فایل با خطا مواجه شد.'
		};
	} finally {
		isImporting.value = false;
	}
}

async function handleChangePassword() {
	if (newPassword.value !== confirmNewPassword.value) {
		passwordMessage.value = { type: 'error', text: 'رمز عبور جدید و تکرار آن یکسان نیستند' };
		return;
	}
	if (!navigator.onLine) {
		passwordMessage.value = {
			type: 'error',
			text: 'تغییر رمز عبور نیازمند اتصال به اینترنت و ارتباط با سرور است'
		};
		return;
	}
	isChangingPassword.value = true;
	passwordMessage.value = null;

	try {
		await $fetch('/api/auth/change-password', {
			method: 'POST',
			body: {
				currentPassword: currentPassword.value,
				newPassword: newPassword.value,
				confirmNewPassword: confirmNewPassword.value
			}
		});

		await clientAuth.saveClientCredential(newPassword.value);
		passwordMessage.value = { type: 'success', text: 'رمز عبور با موفقیت به‌روزرسانی شد.' };
		currentPassword.value = '';
		newPassword.value = '';
		confirmNewPassword.value = '';
	} catch (err: unknown) {
		const statusMessage =
			err && typeof err === 'object' && 'data' in err
				? (err as { data?: { statusMessage?: string } }).data?.statusMessage
				: undefined;
		passwordMessage.value = {
			type: 'error',
			text: statusMessage || (err instanceof Error ? err.message : 'خطا در تغییر رمز')
		};
	} finally {
		isChangingPassword.value = false;
	}
}

async function handleLogout() {
	try {
		if (navigator.onLine) {
			await $fetch('/api/auth/logout', { method: 'POST' });
		}
	} catch {
		// ignore
	}
	await clientAuth.logout();
	await localRepo.clearLocalData();
	router.push('/login');
}
</script>

<template>
	<div class="mx-auto max-w-3xl space-y-8 pb-16">
		<div class="flex items-center justify-between rounded-3xl border border-border bg-surface p-5 shadow-(--shadow-soft) sm:px-7">
			<div class="flex items-center gap-3.5">
				<div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text">
					<Settings class="h-6 w-6" />
				</div>
				<div>
					<h1 class="text-xl font-black text-fg sm:text-2xl">تنظیمات و پشتیبان‌گیری</h1>
					<p class="text-xs font-bold text-fg-secondary">مدیریت تم، پشتیبان‌گیری کامل از داده‌ها، امنیت و نشست دستگاه</p>
				</div>
			</div>
		</div>

		<!-- بخش ظاهر و پوسته -->
		<section class="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-(--shadow-soft) sm:p-7">
			<div class="flex items-center gap-2.5 border-b border-border pb-3.5">
				<Palette class="h-5 w-5 text-accent-text" />
				<h2 class="text-base font-black text-fg">ظاهر و پوسته برنامه</h2>
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<button
					type="button"
					class="flex items-center justify-between rounded-2xl border p-4 text-right transition"
					:class="!theme.isDark.value ? 'border-accent bg-accent-soft text-accent-text ring-1 ring-accent-border' : 'border-border bg-elevated text-fg-secondary hover:border-border-strong hover:text-fg'"
					@click="theme.setTheme(false)"
				>
					<div class="flex items-center gap-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-surface">
							<Sun class="h-5 w-5" />
						</div>
						<div>
							<div class="text-sm font-extrabold">پوسته روشن (Light)</div>
							<div class="text-xs opacity-80">زمینه روشن با تفکیک بصری نرم</div>
						</div>
					</div>
					<Check v-if="!theme.isDark.value" class="h-4 w-4" />
				</button>

				<button
					type="button"
					class="flex items-center justify-between rounded-2xl border p-4 text-right transition"
					:class="theme.isDark.value ? 'border-accent bg-accent-soft text-accent-text ring-1 ring-accent-border' : 'border-border bg-elevated text-fg-secondary hover:border-border-strong hover:text-fg'"
					@click="theme.setTheme(true)"
				>
					<div class="flex items-center gap-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-surface">
							<Moon class="h-5 w-5" />
						</div>
						<div>
							<div class="text-sm font-extrabold">پوسته تاریک (Dark)</div>
							<div class="text-xs opacity-80">زمینه مخملی تیره برای تمرکز شبانه</div>
						</div>
					</div>
					<Check v-if="theme.isDark.value" class="h-4 w-4" />
				</button>
			</div>
		</section>

		<!-- بخش پشتیبان‌گیری آفلاین JSON -->
		<section class="space-y-5 rounded-3xl border border-border bg-surface p-6 shadow-(--shadow-soft) sm:p-7">
			<div class="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
				<div class="flex items-center gap-2.5">
					<Database class="h-5 w-5 text-accent-text" />
					<h2 class="text-base font-black text-fg">پشتیبان‌گیری کامل از داده‌ها (JSON)</h2>
				</div>
				<span class="rounded-xl border border-border bg-elevated px-3 py-1 font-mono text-xs font-bold text-fg-secondary">
					{{ toPersianDigits(habits.length) }} طرح • {{ toPersianDigits(entries.length) }} روز ثبت‌شده
				</span>
			</div>

			<div v-if="importMessage" class="rounded-2xl border px-4 py-3 text-xs font-extrabold" :class="importMessage.type === 'success' ? 'border-optimal-border bg-optimal-soft text-optimal' : 'border-failed-border bg-failed-soft text-failed'">
				{{ importMessage.text }}
			</div>

			<div class="grid grid-cols-1 gap-5 md:grid-cols-2">
				<div class="flex flex-col justify-between rounded-2xl border border-border bg-elevated p-5">
					<div class="space-y-2">
						<div class="flex items-center gap-2 text-sm font-black text-fg">
							<HardDriveDownload class="h-4 w-4 text-accent-text" />
							<span>خروجی و دانلود بکاپ (Export)</span>
						</div>
						<p class="text-xs leading-6 text-fg-secondary">
							یک فایل استاندارد <code class="font-mono text-fg">.json</code> شامل تمام داده‌های ذخیره‌شده در دیتابیس محلی شما دانلود می‌شود.
						</p>
					</div>

					<button
						type="button"
						:disabled="isExporting"
						class="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-xs font-black text-accent-fg shadow-xs transition hover:opacity-90 active:scale-98 disabled:opacity-60"
						@click="exportLocalBackup"
					>
						<Download class="h-4 w-4" />
						<span>{{ isExporting ? 'در حال آماده‌سازی...' : 'دانلود فایل پشتیبان (JSON)' }}</span>
					</button>
				</div>

				<div class="flex flex-col justify-between rounded-2xl border border-border bg-elevated p-5">
					<div class="space-y-2">
						<div class="flex items-center gap-2 text-sm font-black text-fg">
							<HardDriveUpload class="h-4 w-4 text-gold-text" />
							<span>بازیابی فایل بکاپ (Import)</span>
						</div>
						<p class="text-xs leading-6 text-fg-secondary">
							بارگذاری فایل بکاپ برای بازگردانی اطلاعات یا انتقال به یک مرورگر/دستگاه جدید.
						</p>
					</div>

					<div class="mt-4 space-y-3">
						<label class="flex h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-dashed border-border bg-surface px-4 text-xs font-bold text-fg-secondary transition hover:border-border-strong hover:text-fg">
							<span class="truncate">{{ selectedFile ? selectedFile.name : 'انتخاب فایل JSON...' }}</span>
							<input type="file" accept=".json,application/json" class="hidden" @change="handleFileSelected" />
						</label>

						<button
							type="button"
							:disabled="!selectedFile || isImporting"
							class="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-gold-border bg-gold-soft text-xs font-black text-gold-text transition hover:opacity-90 active:scale-98 disabled:opacity-50"
							@click="importBackup"
						>
							<HardDriveUpload class="h-4 w-4" />
							<span>{{ isImporting ? 'در حال بازگردانی...' : 'اعمال و بازگردانی داده‌ها' }}</span>
						</button>
					</div>
				</div>
			</div>
		</section>

		<!-- بخش داده‌های آزمایشی (Demo Seed) قابل افزودن و حذف ایمن -->
		<section class="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-(--shadow-soft) sm:p-7">
			<div class="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
				<div class="flex items-center gap-2.5">
					<FlaskConical class="h-5 w-5 text-accent-text" />
					<h2 class="text-base font-black text-fg">داده‌های آزمایشی (Demo Seed)</h2>
				</div>
				<span
					class="rounded-xl border px-3 py-1 text-xs font-extrabold"
					:class="
						activeDemoHabitsCount > 0
							? 'border-gold-border bg-gold-soft text-gold-text'
							: 'border-border bg-elevated text-fg-muted'
					"
				>
					{{
						activeDemoHabitsCount > 0
							? `${toPersianDigits(activeDemoHabitsCount)} طرح آزمایشی فعال`
							: 'بدون داده آزمایشی'
					}}
				</span>
			</div>

			<p class="text-xs leading-6 text-fg-secondary">
				برای بررسی سریع نمودارهای آمار، تقویم، کتابخانه و طرح‌های تکرارشونده می‌توانید یک مجموعه دادهٔ آزمایشی سبک اضافه کنید. تمامی رکوردهای آزمایشی با شناسهٔ مجزا ثبت می‌شوند و هر زمان که بخواهید، با زدن دکمهٔ حذف، <strong class="font-extrabold text-fg">فقط و فقط داده‌های آزمایشی</strong> پاک می‌شوند و به اطلاعات شخصی شما آسیبی نمی‌رسد.
			</p>

			<div
				v-if="demoSeedMessage"
				class="rounded-2xl border px-4 py-3 text-xs font-extrabold"
				:class="
					demoSeedMessage.type === 'success'
						? 'border-optimal-border bg-optimal-soft text-optimal'
						: 'border-failed-border bg-failed-soft text-failed'
				"
			>
				{{ demoSeedMessage.text }}
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<button
					type="button"
					:disabled="isMutatingDemoSeed"
					class="flex h-11 items-center justify-center gap-2 rounded-xl border border-accent-border bg-accent-soft px-4 text-xs font-black text-accent-text transition hover:opacity-90 active:scale-98 disabled:opacity-50"
					@click="handleInjectDemoSeed"
				>
					<Plus class="h-4 w-4" />
					<span>افزودن داده‌های آزمایشی (Seed)</span>
				</button>

				<button
					type="button"
					:disabled="isMutatingDemoSeed || activeDemoHabitsCount === 0"
					class="flex h-11 items-center justify-center gap-2 rounded-xl border border-failed-border bg-failed-soft px-4 text-xs font-black text-failed transition hover:opacity-90 active:scale-98 disabled:opacity-40"
					@click="handleRemoveDemoSeed"
				>
					<Trash2 class="h-4 w-4" />
					<span>حذف دقیق داده‌های آزمایشی</span>
				</button>
			</div>
		</section>

		<!-- بخش امنیت و حساب کاربری -->
		<section class="space-y-5 rounded-3xl border border-border bg-surface p-6 shadow-(--shadow-soft) sm:p-7">
			<div class="flex items-center gap-2.5 border-b border-border pb-3.5">
				<ShieldCheck class="h-5 w-5 text-accent-text" />
				<h2 class="text-base font-black text-fg">امنیت و نشست کاربری</h2>
			</div>

			<div v-if="passwordMessage" class="rounded-xl border px-4 py-2.5 text-xs font-extrabold" :class="passwordMessage.type === 'success' ? 'border-optimal-border bg-optimal-soft text-optimal' : 'border-failed-border bg-failed-soft text-failed'">
				{{ passwordMessage.text }}
			</div>

			<form class="space-y-3.5" @submit.prevent="handleChangePassword">
				<div class="text-xs font-black text-fg">تغییر رمز عبور اصلی</div>

				<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<div>
						<label for="cur-pass" class="mb-1 block text-xs font-bold text-fg-secondary">رمز فعلی</label>
						<input
							id="cur-pass"
							v-model="currentPassword"
							type="password"
							required
							dir="ltr"
							class="h-11 w-full rounded-xl border border-border bg-elevated px-3 text-center font-mono text-xs font-bold text-fg focus:border-border-strong focus:outline-none"
						/>
					</div>

					<div>
						<label for="new-pass" class="mb-1 block text-xs font-bold text-fg-secondary">رمز جدید</label>
						<input
							id="new-pass"
							v-model="newPassword"
							type="password"
							required
							minlength="4"
							dir="ltr"
							class="h-11 w-full rounded-xl border border-border bg-elevated px-3 text-center font-mono text-xs font-bold text-fg focus:border-border-strong focus:outline-none"
						/>
					</div>

					<div>
						<label for="conf-pass" class="mb-1 block text-xs font-bold text-fg-secondary">تکرار رمز جدید</label>
						<input
							id="conf-pass"
							v-model="confirmNewPassword"
							type="password"
							required
							minlength="4"
							dir="ltr"
							class="h-11 w-full rounded-xl border border-border bg-elevated px-3 text-center font-mono text-xs font-bold text-fg focus:border-border-strong focus:outline-none"
						/>
					</div>
				</div>

				<div class="flex justify-end pt-1">
					<button
						type="submit"
						:disabled="isChangingPassword"
						class="flex h-10 items-center gap-2 rounded-xl bg-accent px-6 text-xs font-black text-accent-fg shadow-xs transition hover:opacity-90 active:scale-98 disabled:opacity-60"
					>
						<KeyRound class="h-4 w-4" />
						<span>{{ isChangingPassword ? 'در حال ثبت...' : 'ذخیره رمز جدید' }}</span>
					</button>
				</div>
			</form>

			<div class="flex items-center justify-between border-t border-border pt-4">
				<div class="text-xs font-bold text-fg-secondary">خروج از نشست و پاک‌سازی داده‌های حافظه محلی این مرورگر</div>
				<button
					type="button"
					class="flex h-10 items-center gap-2 rounded-xl border border-failed-border bg-failed-soft px-4 text-xs font-extrabold text-failed transition hover:opacity-90 active:scale-95"
					@click="handleLogout"
				>
					<LogOut class="h-4 w-4" />
					<span>خروج از حساب</span>
				</button>
			</div>
		</section>
	</div>
</template>
