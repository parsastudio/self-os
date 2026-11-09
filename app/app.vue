<script setup lang="ts">
let handleVisibilityChange: (() => void) | null = null;

onMounted(() => {
	if (!import.meta.client || !('serviceWorker' in navigator)) return;

	const checkForSwUpdate = async () => {
		if (!navigator.onLine) return;
		try {
			const registration = await navigator.serviceWorker.getRegistration();
			if (registration) {
				await registration.update();
			}
		} catch {
			// Ignore background update check errors when offline or unreachable
		}
	};

	void checkForSwUpdate();

	handleVisibilityChange = () => {
		if (document.visibilityState === 'visible') {
			void checkForSwUpdate();
		}
	};

	document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
	if (handleVisibilityChange) {
		document.removeEventListener('visibilitychange', handleVisibilityChange);
		handleVisibilityChange = null;
	}
});
</script>

<template>
	<NuxtPwaManifest />
	<NuxtLayout>
		<NuxtPage />
	</NuxtLayout>
</template>
