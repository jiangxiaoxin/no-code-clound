import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import App from './App.vue'
import router from './router'
import { useUserStore } from './stores/user'
import './style.css'

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  app.use(router)
  app.use(ElementPlus, { locale: zhCn })

  const userStore = useUserStore()
  await userStore.restore()
  await router.isReady()
  app.mount('#app')
}

bootstrap()
