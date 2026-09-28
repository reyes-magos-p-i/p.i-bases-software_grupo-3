<script setup lang="ts">
	// Callback function receives Google ccredential response
	import type { CallbackTypes } from 'vue3-google-login';
  import axios from 'axios'
  import { ref } from 'vue';

  const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
  const errorMessage = ref<string | null>(null)

  const sendCodeToBackend = async (authCode:string)=> {
    errorMessage.value=null
    try {
      const backendResponse = await axios.post(`${API_URL}/auth/google`, {
        code: authCode
    });

    console.log('Backend verified successfully:', backendResponse.data)

    } catch(error) {
      console.error('Backend authentication failed:', error);
      errorMessage.value = 'Failed to authenticate with the server.';
    }


  }

  const callback: CallbackTypes.CodeResponseCallback = async (response) => {
    console.log("Authorisation code", response.code);

    if (response.code) {
      sendCodeToBackend(response.code);
    }
};

</script>

<template>
	<div>
		<GoogleLogin :callback="callback">
      <button type="button" class="btn btn-light border" >
      <i class="bi bi-google me-2"></i>Registrarse con Google
    </button>
    </GoogleLogin>
	</div>
</template>
