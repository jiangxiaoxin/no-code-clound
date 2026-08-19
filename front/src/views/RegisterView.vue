<template>
  <el-row class="auth-page">
    <el-col :xs="24" :md="14" class="auth-visual" aria-hidden="true">
      <img class="auth-visual__image" :src="authIllustration" alt="" />
    </el-col>
    <el-col :xs="24" :md="10" class="auth-panel">
      <div class="auth-card">
        <el-text class="auth-kicker" tag="p">No-Code Cloud</el-text>
        <el-text class="auth-title" tag="h1">注册</el-text>
        <el-form
          ref="formRef"
          class="auth-form"
          :model="form"
          :rules="rules"
          label-position="top"
          @submit.prevent="onSubmit"
        >
          <el-form-item label="邮箱" prop="email">
            <el-input
              v-model="form.email"
              placeholder="请输入邮箱"
            />
          </el-form-item>
          <el-form-item label="用户名" prop="username">
            <el-input
              v-model="form.username"
              placeholder="请输入用户名"
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
          <el-form-item label="确认密码" prop="confirmPassword">
            <el-input
              v-model="form.confirmPassword"
              type="password"
              show-password
              placeholder="请再次输入密码"
            />
          </el-form-item>
          <el-form-item>
            <el-button
              class="auth-submit"
              type="primary"
              native-type="submit"
              :loading="loading"
            >
              注册
            </el-button>
          </el-form-item>
        </el-form>
        <el-text class="auth-switch" tag="p">
          已有账号？
          <el-link type="primary" @click="router.push('/login')">
            去登录
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
import { registerApi } from '../api/auth'
import authIllustration from '../assets/auth-illustration-register.png'

const router = useRouter()
const loading = ref(false)
const formRef = ref()
const form = reactive({
  email: '',
  username: '',
  password: '',
  confirmPassword: '',
})

const rules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入有效邮箱', trigger: 'blur' },
  ],
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    {
      pattern: /^[A-Za-z0-9_]{3,32}$/,
      message: '用户名须为 3–32 位字母、数字或下划线',
      trigger: 'blur',
    },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== form.password) {
          callback(new Error('两次输入的密码不一致'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

async function onSubmit() {
  await formRef.value.validate()
  loading.value = true
  try {
    await registerApi({
      email: form.email,
      username: form.username,
      password: form.password,
    })
    ElMessage.success('注册成功，请登录')
    router.push('/login')
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
