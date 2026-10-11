<template>
  <footer class="site-footer">
    <div class="landing-container footer-grid">
      <section>
        <h2>CONTÁCTANOS</h2>

        <p>
          <i class="bi bi-telephone"></i>
          +506 0000 0000
        </p>

        <p>
          <i class="bi bi-envelope"></i>
          contact@cinetadel.com
        </p>

        <p>
          <i class="bi bi-geo-alt"></i>
          San José, San Pedro, Costa Rica
        </p>
      </section>

      <section>
        <h2>CARTELERA</h2>

        <a href="#">Ver cartelera</a>
        <a href="place-holder">Preventas</a>
        <a href="place-holder">Estrenos</a>
      </section>

      <section>
        <h2>SOBRE CINETADEL</h2>
        <router-link to="/terms-and-conditions">Términos y condiciones</router-link>
        <router-link to="/refund-policy">Política de reembolso</router-link>
        <router-link to="/privacy-policy">Aviso de Privacidad</router-link>
      </section>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  margin-top: 72px;

  padding: 48px 0;

  color: var(--text-on-dark);

  background-color: var(--surface-background);
}

.footer-grid {
  display: grid;

  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));

  gap: 40px;
}

.footer-grid section {
  display: flex;
  flex-direction: column;

  gap: 8px;
}

.footer-grid h2 {
  margin-bottom: 10px;

  font-size: 1rem;
  font-weight: 700;
}

.footer-grid p,
.footer-grid a {
  margin: 0;

  color: var(--text-on-dark-secondary);

  font-size: 0.9rem;
}

.footer-grid a:hover {
  color: var(--accent-color);
}

.footer-grid i {
  margin-right: 7px;

  color: var(--accent-color);
}
</style>