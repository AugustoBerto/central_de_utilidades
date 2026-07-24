import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';
import { setUnauthorizedHandler } from './services/api';
import './styles.css';

setUnauthorizedHandler(() => {
  if (router.currentRoute.value.name !== 'login')
    router.replace({ name: 'login', query: { reason: 'session' } });
});

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
