<template>
  <main
    class="grid min-h-screen place-items-center bg-canvas px-6 text-center text-foreground"
  >
    <section>
      <p class="text-sm font-semibold text-accent">404</p>
      <h1 class="mt-2 text-2xl font-semibold">Página não encontrada</h1>
      <p class="mt-2 text-muted">O endereço informado não existe neste painel.</p>
      <RouterLink
        to="/dashboard"
        class="mt-6 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
      >
        Voltar ao painel
      </RouterLink>
    </section>
  </main>
</template>
