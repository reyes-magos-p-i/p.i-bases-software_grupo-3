<script setup lang="ts">
	// Callback function receives Google ccredential response
	import type { CallbackTypes } from 'vue3-google-login';
	const callback :CallbackTypes.CredentialCallback = (response) =>{

		console.log("Credentials JWT string", response.credential);
	}
</script>

<template>
	<div>
		<GoogleLogin :callback="callback"/>
	</div>
</template>
