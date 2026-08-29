<script setup lang="ts">
import {
  PRIVACY_NOTICE_DETAILS,
  PRIVACY_NOTICE_SUMMARY,
  PRIVACY_NOTICE_VERSION,
} from "@admin-x/shared";

const props = withDefaults(
  defineProps<{
    actionLabel?: string;
  }>(),
  {
    actionLabel: "继续操作",
  },
);
const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ read: [] }>();

function confirmPrivacyNoticeRead() {
  emit("read");
  visible.value = false;
}
</script>

<template>
  <el-dialog
    v-model="visible"
    class="privacy-notice-dialog"
    title="个人信息保护告知"
    width="min(680px, calc(100vw - 32px))"
    append-to-body
    modal-class="privacy-notice-overlay"
    :lock-scroll="false"
  >
    <p class="privacy-notice-dialog__version">告知版本：{{ PRIVACY_NOTICE_VERSION }}</p>
    <p class="privacy-notice-dialog__summary">{{ PRIVACY_NOTICE_SUMMARY }}</p>
    <div class="privacy-notice-dialog__sections">
      <section v-for="section in PRIVACY_NOTICE_DETAILS" :key="section.title">
        <h3>{{ section.title }}</h3>
        <p>{{ section.content }}</p>
      </section>
    </div>
    <p class="privacy-notice-dialog__tip">
      请阅读后勾选“我已阅读并同意”，再{{ props.actionLabel }}。
    </p>
    <template #footer>
      <el-button type="primary" @click="confirmPrivacyNoticeRead">我已阅读</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
:global(.privacy-notice-dialog) {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 48px);
  margin: 0 auto;
  overflow: hidden;
}

:global(.privacy-notice-dialog .el-dialog__header),
:global(.privacy-notice-dialog .el-dialog__footer) {
  flex: 0 0 auto;
}

:global(.privacy-notice-dialog .el-dialog__body) {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
}

:global(.privacy-notice-dialog__sections) {
  display: grid;
  gap: 16px;
  margin-top: 20px;
}

:global(.privacy-notice-dialog__sections section) {
  margin: 0;
}

:global(.privacy-notice-dialog__sections h3) {
  margin: 0 0 5px;
  color: var(--ax-heading);
  font-size: 13px;
  line-height: 1.5;
}

:global(.privacy-notice-dialog__sections p),
:global(.privacy-notice-dialog__version),
:global(.privacy-notice-dialog__summary),
:global(.privacy-notice-dialog__tip) {
  margin: 0;
  color: var(--ax-content);
  font-size: 13px;
  line-height: 1.8;
}

:global(.privacy-notice-dialog__version) {
  color: var(--ax-muted);
  font-size: 12px;
}

:global(.privacy-notice-dialog__summary) {
  margin-top: 12px;
}

:global(.privacy-notice-dialog__tip) {
  margin-top: 16px;
  color: var(--ax-muted);
  font-size: 12px;
}

:global(.privacy-notice-overlay .el-overlay-dialog) {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: hidden;
}
</style>
