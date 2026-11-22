<script setup lang="ts">
import LegalDocument from '@/components/common/LegalDocument.vue'
</script>

<template>
  <LegalDocument title="Términos y condiciones" updated-at="17 de noviembre de 2026">
    <section>
      <h2>1. Uso del portal y de tu cuenta</h2>
      <p>
        El portal de Cinetadel permite consultar la cartelera, elegir funciones y adquirir boletos.
        Puedes comprar con tu cuenta o como invitado. Al registrarte, proporciona información
        correcta, mantén actualizado tu correo y protege tus credenciales. No utilices cuentas de
        otras personas ni el portal para realizar actividades fraudulentas o afectar su
        funcionamiento.
      </p>
    </section>
    <section>
      <h2>2. Selección y confirmación de la compra</h2>
      <p>
        Antes de confirmar, revisa la película, sucursal, sala, fecha, hora, asientos, categorías de
        boleto e importe total. Los precios se muestran en colones costarricenses y corresponden a
        las opciones elegidas. Seleccionar un asiento no lo reserva: su disponibilidad se confirma
        al completar la compra. Si deja de estar disponible, deberás elegir otro.
      </p>
    </section>
    <section>
      <h2>3. Boletos y comprobantes</h2>
      <p>
        Cada boleto corresponde a la función y al asiento indicados en su detalle. Conserva la
        referencia de compra y el comprobante con sus boletos y QR. Si tienes cuenta, puedes
        consultar tus compras desde el perfil; si compraste como invitado, utiliza el enlace privado
        mostrado al finalizar y enviado a tu correo. No compartas ese enlace, pues permite consultar
        tu compra.
      </p>
      <p>
        Comprueba el correo antes de comprar. Si el mensaje de boletos no llega, revisa el correo no
        deseado y utiliza la opción de reenvío del comprobante. Un fallo en el envío del correo no
        cancela una compra registrada correctamente.
      </p>
    </section>
    <section>
      <h2>4. Cambios de función y reprogramación</h2>
      <p>
        Cuando se ofrezcan funciones alternativas para un boleto, podrás reprogramarlo según la
        disponibilidad que muestre el sistema, para la misma película y sucursal. Revisa el nuevo
        horario y asiento antes de confirmar. Si Cinetadel cancela o modifica una función, consulta
        las indicaciones recibidas y la
        <RouterLink to="/refund-policy">política de reembolso</RouterLink>.
      </p>
    </section>
    <section>
      <h2>5. Datos personales y seguridad</h2>
      <p>
        El <RouterLink to="/privacy-policy">aviso de privacidad</RouterLink> explica los datos
        usados para gestionar tu cuenta, compras, comunicaciones y preferencias. En un equipo
        compartido, cierra la sesión al terminar. No envíes contraseñas ni enlaces privados de
        compra a terceros.
      </p>
    </section>
    <section>
      <h2>6. Consultas y condiciones aplicables</h2>
      <p>
        Para consultas sobre el servicio, escribe a
        <a href="mailto:cinetadel2026@gmail.com">cinetadel2026@gmail.com</a>. Estos términos se
        aplican junto con las condiciones mostradas al comprar y la legislación de Costa Rica.
        Ninguna disposición limita los derechos que la normativa reconoce a las personas
        consumidoras. Las actualizaciones se publicarán en esta página.
      </p>
    </section>
  </LegalDocument>
</template>
