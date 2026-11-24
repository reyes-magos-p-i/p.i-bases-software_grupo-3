<script setup lang="ts">
import logo from '@/assets/logos/cinetadel-logo.png'

// SCRUM-438: footer of the portal prototype (option A). Every row is 44 px high with the same
// gap, so the columns keep a uniform spacing at any width.
const year = new Date().getFullYear()
</script>

<template>
  <footer class="site-footer">
    <div class="landing-container">
      <div class="footer-grid">
        <div class="footer-brand">
          <img :src="logo" alt="Cinetadel" class="footer-logo" />
          <p>Cartelera, preventas y estrenos en un solo lugar.</p>
        </div>

        <section aria-labelledby="footer-contact">
          <h2 id="footer-contact">Contáctanos</h2>
          <ul>
            <li>
              <a href="tel:+50600000000"
                ><i class="bi bi-telephone" aria-hidden="true"></i>+506 0000 0000</a
              >
            </li>
            <li>
              <a href="mailto:cinetadel2026@gmail.com"
                ><i class="bi bi-envelope" aria-hidden="true"></i>cinetadel2026@gmail.com</a
              >
            </li>
            <li>
              <span
                ><i class="bi bi-geo-alt" aria-hidden="true"></i>San José, San Pedro, Costa
                Rica</span
              >
            </li>
          </ul>
        </section>

        <section aria-labelledby="footer-sections">
          <h2 id="footer-sections">Cartelera</h2>
          <ul>
            <li><RouterLink :to="{ path: '/', hash: '#cartelera' }">Ver cartelera</RouterLink></li>
            <li><RouterLink :to="{ path: '/', hash: '#preventas' }">Preventas</RouterLink></li>
            <li><RouterLink :to="{ path: '/', hash: '#estrenos' }">Estrenos</RouterLink></li>
          </ul>
        </section>

        <section aria-labelledby="footer-about">
          <h2 id="footer-about">Sobre Cinetadel</h2>
          <ul>
            <li><RouterLink to="/terms-and-conditions">Términos y condiciones</RouterLink></li>
            <li><RouterLink to="/refund-policy">Política de reembolso</RouterLink></li>
            <li><RouterLink to="/privacy-policy">Aviso de privacidad</RouterLink></li>
          </ul>
        </section>
      </div>

      <p class="footer-bottom">© {{ year }} Cinetadel</p>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  margin-top: 112px;
  border-top: 1px solid color-mix(in srgb, var(--text-on-dark) 8%, transparent);
  background: var(--surface-background);
  color: var(--text-on-dark);
}

.footer-grid {
  display: grid;
  align-items: start;
  gap: 40px;
  grid-template-columns: 1.4fr 1fr 1fr 1fr;
  padding: 56px 0 40px;
}

.footer-logo {
  display: block;
  width: auto;
  height: 72px;
}

.footer-brand p {
  max-width: 280px;
  margin: 16px 0 0;
  color: var(--text-on-dark-secondary);
  font-size: 0.9375rem;
  line-height: 1.55;
}

.footer-grid h2 {
  margin: 0 0 12px;
  color: var(--text-on-dark);
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.footer-grid ul {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.footer-grid li a,
.footer-grid li span {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 10px;
  color: var(--text-on-dark-secondary);
  font-size: 0.9375rem;
  overflow-wrap: anywhere;
  text-decoration: none;
}

.footer-grid li a:hover {
  color: var(--accent-color);
}

.footer-grid li a:focus-visible {
  outline: 2px solid var(--focus-on-dark);
  outline-offset: 2px;
}

.footer-grid i {
  flex: none;
  color: var(--accent-color);
}

.footer-bottom {
  margin: 0;
  padding: 20px 0 28px;
  border-top: 1px solid color-mix(in srgb, var(--text-on-dark) 8%, transparent);
  color: var(--text-on-dark-secondary);
  font-size: 0.8125rem;
}

@media (width <= 1100px) {
  .footer-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (width <= 640px) {
  .footer-grid {
    gap: 28px;
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
