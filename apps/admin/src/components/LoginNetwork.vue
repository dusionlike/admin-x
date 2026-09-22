<template>
  <div class="network" aria-label="系统动态背景">
    <div class="network__grid" aria-hidden="true"></div>
    <div class="network__halo" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.network {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.network__grid {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background-image:
    linear-gradient(rgb(122 140 222 / 10%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(122 140 222 / 10%) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse at center, #000 0%, transparent 76%);
}

.network__halo {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(620px, 72vw);
  height: min(430px, 58vh);
  pointer-events: none;
  background: radial-gradient(ellipse, rgb(34 79 178 / 15%), transparent 69%);
  filter: blur(24px);
  transform: translate(-50%, -50%);
}

@media (max-width: 760px) {
  .network__grid {
    opacity: 0.13;
  }

  .network__halo {
    width: 100vw;
    height: 52vh;
  }
}
</style>
