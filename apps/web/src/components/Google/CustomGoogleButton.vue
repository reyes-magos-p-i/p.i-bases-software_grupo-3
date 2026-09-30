<script setup lang="ts">
	// For curstom button
	import { googleAuthCodeLogin } from 'vue3-google-login';
  import axios from 'axios'


  const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'


  const login = async () => {
    try {
      const response = await googleAuthCodeLogin()

      console.log('Google response:', response)

      const result = await axios.post(
        `${API_URL}/auth/google`,
        {
          code: response.code
        }
      )

      console.log('Backend response:', result.data)

    } catch (error) {
      console.error('Google login failed:', error)
    }
  }

/*  const sendCodeToBackend = async (authCode:string)=> {
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
*/

</script>

<template>
	<div>
    <button type="button" class="btn btn-light border"  @click="login">
      <i class="bi bi-google me-2"></i>Registrarse con Google
    </button>
	</div>
</template>
