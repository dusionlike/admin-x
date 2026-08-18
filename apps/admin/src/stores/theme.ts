import { computed, nextTick, ref } from "vue";
import { defineStore } from "pinia";

const THEME_KEY = "admin-x:theme";
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

type ThemeMode = "light" | "dark";

interface ThemeViewTransition {
  finished: Promise<void>;
  ready: Promise<void>;
  skipTransition(): void;
}

type ThemeDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => ThemeViewTransition;
};

let transitionInProgress = false;
let systemMediaQuery: MediaQueryList | null = null;

export const useThemeStore = defineStore("theme", () => {
  const mode = ref<ThemeMode>("light");
  const isDark = computed(() => mode.value === "dark");

  function getSystemMode(): ThemeMode {
    return window.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
  }

  function applySystemMode(event?: MediaQueryListEvent) {
    mode.value = event?.matches ? "dark" : getSystemMode();
    applyTheme();
  }

  function stopFollowingSystem() {
    systemMediaQuery?.removeEventListener("change", applySystemMode);
    systemMediaQuery = null;
  }

  function followSystem() {
    stopFollowingSystem();
    systemMediaQuery = window.matchMedia(SYSTEM_THEME_QUERY);
    systemMediaQuery.addEventListener("change", applySystemMode);
  }

  function restore() {
    const savedMode = localStorage.getItem(THEME_KEY);
    if (savedMode === "dark" || savedMode === "light") {
      stopFollowingSystem();
      mode.value = savedMode;
    } else {
      applySystemMode();
      followSystem();
    }
    applyTheme();
  }

  function setMode(nextMode: ThemeMode) {
    stopFollowingSystem();
    mode.value = nextMode;
    localStorage.setItem(THEME_KEY, nextMode);
    applyTheme();
  }

  function toggle(event?: MouseEvent) {
    const nextMode: ThemeMode = isDark.value ? "light" : "dark";
    const transitionDocument = document as ThemeDocument;
    const canAnimate =
      Boolean(transitionDocument.startViewTransition) &&
      Boolean(event) &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (transitionInProgress) {
      return;
    }

    if (!canAnimate || !event) {
      setMode(nextMode);
      return;
    }

    const { clientX, clientY } = event;
    const endRadius = Math.hypot(
      Math.max(clientX, window.innerWidth - clientX),
      Math.max(clientY, window.innerHeight - clientY),
    );
    const transition = transitionDocument.startViewTransition(async () => {
      setMode(nextMode);
      await nextTick();
    });
    transitionInProgress = true;

    void transition.finished.then(
      () => {
        transitionInProgress = false;
      },
      () => {
        transitionInProgress = false;
      },
    );

    void transition.ready.then(
      () => {
        const clipPath = [
          `circle(0px at ${clientX}px ${clientY}px)`,
          `circle(${endRadius}px at ${clientX}px ${clientY}px)`,
        ];
        const animation = document.documentElement.animate(
          {
            clipPath: nextMode === "dark" ? clipPath.slice().reverse() : clipPath,
          },
          {
            duration: 450,
            easing: "ease-in",
            pseudoElement:
              nextMode === "dark" ? "::view-transition-old(root)" : "::view-transition-new(root)",
          } as KeyframeAnimationOptions & { pseudoElement: string },
        );
        animation.onfinish = () => transition.skipTransition();
      },
      () => {
        transitionInProgress = false;
      },
    );
  }

  function applyTheme() {
    document.documentElement.classList.toggle("dark", isDark.value);
    document.documentElement.style.colorScheme = isDark.value ? "dark" : "light";
  }

  return {
    isDark,
    mode,
    restore,
    setMode,
    toggle,
  };
});
