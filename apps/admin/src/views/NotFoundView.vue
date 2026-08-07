<template>
  <div class="not-found-page">
    <div class="not-found-page__code">404</div>
    <h1>页面走丢了</h1>
    <p>你访问的页面不存在，或者已经被移动。</p>
    <el-button type="primary" @click="$router.push('/dashboard')">返回工作台</el-button>
  </div>
</template>

<style scoped>
.not-found-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  color: #8b96a8;
  text-align: center;
  background: #f4f7fb;
}

.not-found-page__code {
  color: #6755e8;
  font-size: 96px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.08em;
}

.not-found-page h1 {
  margin: 24px 0 7px;
  color: #344054;
  font-size: 22px;
}

.not-found-page p {
  margin: 0 0 22px;
  font-size: 12px;
}
</style>
