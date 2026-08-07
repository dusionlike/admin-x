import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";

import App from "./App.vue";
import router from "./router";
import { useAuthStore } from "./stores/auth";
import { useThemeStore } from "./stores/theme";
import "./styles/index.css";

const pinia = createPinia();
const app = createApp(App);
const authStore = useAuthStore(pinia);
const themeStore = useThemeStore(pinia);

authStore.restore();
themeStore.restore();

app.use(pinia);
app.use(router);
app.use(ElementPlus);
app.mount("#app");
