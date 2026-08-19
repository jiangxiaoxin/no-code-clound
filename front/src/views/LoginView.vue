<template>
  <el-row class="auth-page">
    <el-col :xs="24" :md="14" class="auth-visual" aria-hidden="true">
      <img class="auth-visual__image" :src="authIllustration" alt="" />
    </el-col>
    <el-col :xs="24" :md="10" class="auth-panel">
      <div class="auth-card">
        <el-text class="auth-kicker" tag="p">No-Code Cloud</el-text>
        <el-text class="auth-title" tag="h1">登录</el-text>
        <el-form
          ref="formRef"
          class="auth-form"
          :model="form"
          :rules="rules"
          label-position="top"
          @submit.prevent="onSubmit"
        >
          <el-form-item label="用户名 / 邮箱" prop="username">
            <el-input
              v-model="form.username"
              placeholder="请输入用户名或邮箱"
            />
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              show-password
              placeholder="请输入密码"
            />
          </el-form-item>
          <el-form-item>
            <el-button
              class="auth-submit"
              type="primary"
              native-type="submit"
              :loading="loading"
            >
              登录
            </el-button>
          </el-form-item>
        </el-form>
        <el-text class="auth-switch" tag="p">
          还没有账号？
          <el-link type="primary"  @click="router.push('/register')">
            去注册
          </el-link>
        </el-text>
      </div>
    </el-col>
  </el-row>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { loginApi } from '../api/auth'
import { useUserStore } from '../stores/user'
import authIllustration from '../assets/auth-illustration.png'

const router = useRouter()
const userStore = useUserStore()
const loading = ref(false)
const formRef = ref()
const form = reactive({
  username: 'admin',
  password: '123456',
})

const accountPattern = /^([A-Za-z0-9_]{3,32}|[^\s@]+@[^\s@]+\.[^\s@]+)$/

const rules = {
  username: [
    { required: true, message: '请输入用户名或邮箱', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (!accountPattern.test(String(value || '').trim())) {
          callback(new Error('请输入用户名或邮箱'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
}

async function onSubmit() {
  await formRef.value.validate()
  loading.value = true
  try {
    const data = await loginApi(form)
    userStore.setSession(data.accessToken, data.user)
    ElMessage.success('登录成功')
    router.push('/')
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    loading.value = false
  }
}
</script>

<style lang="less">
@import '../styles/auth.less';
</style>
