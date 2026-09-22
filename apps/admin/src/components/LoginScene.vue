<template>
  <div ref="container" class="login-scene" aria-hidden="true"></div>
</template>

<script setup lang="ts">
// Custom login scene inspired by the source-owned component approach in Vue Bits.
// Uses OGL directly so the visual stays local to this project and can be tuned here.
import { Mesh, Program, Renderer, Triangle, Vec2 } from "ogl";
import { onBeforeUnmount, onMounted, ref } from "vue";

const container = ref<HTMLDivElement | null>(null);

const vertex = `
  precision highp float;
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragment = `
  precision highp float;

  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uPointer;
  uniform vec4 uClicks[4];
  varying vec2 vUv;

  #define TAU 6.28318530718

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float glowLine(float distanceToLine, float width) {
    return exp(-abs(distanceToLine) * width);
  }

  float softGlow(vec2 point, vec2 center, vec2 scale) {
    vec2 delta = (point - center) / scale;
    return exp(-dot(delta, delta) * 1.8);
  }

  void main() {
    float aspect = uResolution.x / uResolution.y;
    vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / uResolution.y;
    vec2 pointer = uPointer;
    pointer.x *= aspect;

    float time = uTime * 0.34;
    vec2 field = uv;
    float pointerDistance = distance(field, pointer);
    float pointerInfluence = exp(-pointerDistance * 1.7);
    field.y += sin(field.x * 1.5 + time) * 0.035 * pointerInfluence;
    field.x += cos(field.y * 1.8 - time) * 0.025 * pointerInfluence;

    vec3 color = vec3(0.011, 0.015, 0.046);
    color += vec3(0.025, 0.032, 0.11) * (1.0 - smoothstep(0.2, 1.8, length(uv)));

    for (int i = 0; i < 6; i++) {
      float index = float(i);
      float offset = (index - 2.5) * 0.22;
      float wave = sin(field.x * (1.25 + index * 0.12) + time * (0.8 + index * 0.07) + index * 1.7) * (0.12 + index * 0.012);
      wave += sin(field.x * 3.4 - time * 0.7 + index) * 0.035;
      wave += (field.x * 0.055) * sin(index * 1.4);
      float distanceToLine = field.y - offset - wave;
      float line = glowLine(distanceToLine, 36.0 + index * 3.0);
      float haze = glowLine(distanceToLine, 7.0 + index);
      vec3 lineColor = mix(vec3(0.31, 0.18, 0.95), vec3(0.08, 0.82, 0.89), 0.5 + 0.5 * sin(index + time * 0.8));
      color += lineColor * line * (0.14 + index * 0.014);
      color += lineColor * haze * 0.034;
    }

    float diagonal = abs(field.y - field.x * 0.26 - sin(time * 0.8) * 0.26);
    color += vec3(0.08, 0.13, 0.34) * exp(-diagonal * 5.0) * 0.055;

    vec2 leftCloud = vec2(-0.72 + sin(time * 0.42) * 0.12, 0.16 + cos(time * 0.3) * 0.1);
    vec2 rightCloud = vec2(0.74 + cos(time * 0.35) * 0.1, -0.18 + sin(time * 0.26) * 0.12);
    vec2 lowerCloud = vec2(sin(time * 0.22) * 0.25, 0.76 + cos(time * 0.2) * 0.08);
    color += vec3(0.035, 0.045, 0.16) * softGlow(uv, leftCloud, vec2(0.72, 0.64));
    color += vec3(0.02, 0.1, 0.17) * softGlow(uv, rightCloud, vec2(0.78, 0.58));
    color += vec3(0.018, 0.025, 0.11) * softGlow(uv, lowerCloud, vec2(0.95, 0.42));

    float haze = noise(uv * 1.7 + vec2(time * 0.12, -time * 0.08));
    color += vec3(0.008, 0.012, 0.035) * haze;

    vec2 pointerDelta = uv - pointer;
    float pointerGlow = exp(-dot(pointerDelta, pointerDelta) * 2.8);
    color += mix(vec3(0.28, 0.17, 0.9), vec3(0.12, 0.86, 0.86), 0.5 + 0.5 * sin(time)) * pointerGlow * 0.075;

    float grain = noise(uv * 4.0 + time * 0.4) - 0.5;
    color += grain * 0.008;

    for (int i = 0; i < 4; i++) {
      vec4 pulse = uClicks[i];
      float clickAge = uTime - pulse.z;
      if (pulse.w > 0.0 && clickAge > 0.0 && clickAge < 2.4) {
        vec2 clickPoint = pulse.xy;
        clickPoint.x *= aspect;
        float radius = clickAge * 0.75;
        float fade = 1.0 - clickAge / 2.4;
        float ring = exp(-abs(distance(uv, clickPoint) - radius) * 42.0) * fade;
        float halo = exp(-abs(distance(uv, clickPoint) - radius) * 10.0) * fade;
        vec3 pulseColor = mix(vec3(0.36, 0.48, 1.0), vec3(0.20, 0.88, 0.82), 0.5 + 0.5 * sin(float(i) * 1.7));
        color += pulseColor * (ring * 0.22 + halo * 0.025);
      }
    }

    float vignette = smoothstep(1.9, 0.35, length(uv * vec2(0.82, 1.0)));
    color *= 0.74 + vignette * 0.46;
    gl_FragColor = vec4(color, 1.0);
  }
`;

let renderer: Renderer | null = null;
let resizeObserver: ResizeObserver | null = null;
let frame = 0;
let removePointerListeners: (() => void) | null = null;

onMounted(() => {
  const target = container.value;
  if (!target) return;

  try {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer = new Renderer({
      alpha: false,
      antialias: false,
      dpr: Math.min(window.devicePixelRatio || 1, 1.5),
    });
    const gl = renderer.gl;
    const geometry = new Triangle(gl);
    const pointer = new Vec2(0, 0);
    const clicks = Array.from({ length: 4 }, () => [0, 0, -10, 0]);
    let clickSlot = 0;
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new Vec2(1, 1) },
        uPointer: { value: pointer },
        uClicks: { value: clicks },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    target.appendChild(gl.canvas);

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer?.setSize(width, height);
      program.uniforms.uResolution.value.set(gl.canvas.width, gl.canvas.height);
    };

    const onPointerMove = (event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = 1 - (event.clientY / window.innerHeight) * 2;
      pointer.x += (x - pointer.x) * 0.13;
      pointer.y += (y - pointer.y) * 0.13;
      program.uniforms.uPointer.value = pointer;
    };
    const onPointerDown = (event: PointerEvent) => {
      const slot = clicks[clickSlot];
      slot[0] = (event.clientX / window.innerWidth) * 2 - 1;
      slot[1] = 1 - (event.clientY / window.innerHeight) * 2;
      slot[2] = performance.now() * 0.001;
      slot[3] = 1;
      clickSlot = (clickSlot + 1) % clicks.length;
    };
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    removePointerListeners = () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(document.documentElement);
    resize();

    const draw = (timestamp: number) => {
      frame = requestAnimationFrame(draw);
      if (document.hidden || !renderer) return;
      const time = timestamp * 0.001;
      program.uniforms.uTime.value = prefersReducedMotion ? 0.4 : time;
      renderer.render({ scene: mesh });
    };
    frame = requestAnimationFrame(draw);
  } catch {
    renderer = null;
  }
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  resizeObserver?.disconnect();
  removePointerListeners?.();
  renderer?.gl.canvas.remove();
  renderer?.gl.getExtension("WEBGL_lose_context")?.loseContext();
  renderer = null;
});
</script>

<style scoped>
.login-scene {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}
</style>
