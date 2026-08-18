<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { RefreshRight, ZoomIn } from "@element-plus/icons-vue";

const props = defineProps<{
  modelValue: boolean;
  imageUrl: string;
}>();

const emit = defineEmits<{
  confirm: [value: string];
  "update:modelValue": [value: boolean];
}>();

const VIEWPORT_SIZE = 320;
const OUTPUT_SIZE = 256;
const imageElement = ref<HTMLImageElement>();
const naturalWidth = ref(1);
const naturalHeight = ref(1);
const zoom = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const dragging = ref(false);
let dragStartX = 0;
let dragStartY = 0;
let dragOffsetX = 0;
let dragOffsetY = 0;

const baseScale = computed(() =>
  Math.max(VIEWPORT_SIZE / naturalWidth.value, VIEWPORT_SIZE / naturalHeight.value),
);
const renderedWidth = computed(() => naturalWidth.value * baseScale.value * zoom.value);
const renderedHeight = computed(() => naturalHeight.value * baseScale.value * zoom.value);
const imageStyle = computed(() => ({
  height: `${renderedHeight.value}px`,
  left: `${offsetX.value}px`,
  top: `${offsetY.value}px`,
  width: `${renderedWidth.value}px`,
}));

watch(
  () => props.modelValue,
  async (visible) => {
    if (visible) {
      zoom.value = 1;
      await nextTick();
      centerImage();
    }
  },
);

watch(zoom, (value, oldValue) => {
  if (!oldValue || value === oldValue) return;
  const ratio = value / oldValue;
  offsetX.value = VIEWPORT_SIZE / 2 - (VIEWPORT_SIZE / 2 - offsetX.value) * ratio;
  offsetY.value = VIEWPORT_SIZE / 2 - (VIEWPORT_SIZE / 2 - offsetY.value) * ratio;
  clampOffsets();
});

function handleImageLoad(event: Event) {
  const image = event.currentTarget as HTMLImageElement;
  naturalWidth.value = image.naturalWidth || 1;
  naturalHeight.value = image.naturalHeight || 1;
  centerImage();
}

function centerImage() {
  offsetX.value = (VIEWPORT_SIZE - renderedWidth.value) / 2;
  offsetY.value = (VIEWPORT_SIZE - renderedHeight.value) / 2;
  clampOffsets();
}

function clampOffsets() {
  offsetX.value = Math.min(0, Math.max(VIEWPORT_SIZE - renderedWidth.value, offsetX.value));
  offsetY.value = Math.min(0, Math.max(VIEWPORT_SIZE - renderedHeight.value, offsetY.value));
}

function startDrag(event: PointerEvent) {
  dragging.value = true;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragOffsetX = offsetX.value;
  dragOffsetY = offsetY.value;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function moveDrag(event: PointerEvent) {
  if (!dragging.value) return;
  offsetX.value = dragOffsetX + event.clientX - dragStartX;
  offsetY.value = dragOffsetY + event.clientY - dragStartY;
  clampOffsets();
}

function stopDrag() {
  dragging.value = false;
}

function confirmCrop() {
  const image = imageElement.value;
  if (!image?.complete || !image.naturalWidth) {
    ElMessage.warning("图片仍在加载，请稍后再试");
    return;
  }

  const scale = baseScale.value * zoom.value;
  const sourceX = -offsetX.value / scale;
  const sourceY = -offsetY.value / scale;
  const sourceSize = VIEWPORT_SIZE / scale;
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    ElMessage.error("当前浏览器无法处理头像图片");
    return;
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );
  emit("confirm", canvas.toDataURL("image/png"));
  close();
}

function close() {
  emit("update:modelValue", false);
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    width="min(520px, calc(100vw - 32px))"
    class="avatar-crop-dialog"
    title="裁剪头像"
    append-to-body
    @close="close"
  >
    <div class="crop-dialog__body">
      <p>拖动图片调整位置，使用滑块放大后选择合适的头像区域。</p>
      <div
        class="crop-viewport"
        :class="{ 'is-dragging': dragging }"
        @pointerdown="startDrag"
        @pointermove="moveDrag"
        @pointerup="stopDrag"
        @pointercancel="stopDrag"
      >
        <img
          ref="imageElement"
          :src="imageUrl"
          :style="imageStyle"
          alt="待裁剪头像"
          draggable="false"
          @load="handleImageLoad"
        />
        <div class="crop-mask"></div>
      </div>
      <div class="crop-tools">
        <el-icon><ZoomIn /></el-icon>
        <el-slider v-model="zoom" :min="1" :max="3" :step="0.01" :show-tooltip="false" />
        <el-button text type="primary" @click="centerImage">
          <el-icon><RefreshRight /></el-icon>重新居中
        </el-button>
      </div>
    </div>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" @click="confirmCrop">使用此头像</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.crop-dialog__body > p {
  margin: -4px 0 18px;
  color: var(--ax-muted);
  font-size: 12px;
  line-height: 1.6;
}

.crop-viewport {
  position: relative;
  width: 320px;
  height: 320px;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 14px;
  cursor: grab;
  touch-action: none;
  background:
    linear-gradient(45deg, var(--ax-surface-soft) 25%, transparent 25%) 0 0 / 18px 18px,
    linear-gradient(-45deg, var(--ax-surface-soft) 25%, transparent 25%) 0 9px / 18px 18px,
    var(--ax-surface);
}

.crop-viewport.is-dragging {
  cursor: grabbing;
}

.crop-viewport img {
  position: absolute;
  max-width: none;
  user-select: none;
  pointer-events: none;
}

.crop-mask {
  position: absolute;
  inset: 0;
  border: 2px solid rgb(255 255 255 / 88%);
  border-radius: 50%;
  box-shadow: 0 0 0 120px rgb(10 14 28 / 54%);
  pointer-events: none;
}

.crop-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  color: var(--ax-muted);
}

.crop-tools :deep(.el-slider) {
  flex: 1;
}
</style>
