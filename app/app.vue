<script setup lang="ts">
import { onMounted } from 'vue';

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

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			void checkForSwUpdate();
		}
	});
});
</script>

<template>
	<NuxtPwaManifest />
	<NuxtLayout>
		<NuxtPage />
	</NuxtLayout>
</template>
