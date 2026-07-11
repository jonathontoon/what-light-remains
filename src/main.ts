import type { TimeControls } from "./dev/timeControls";
import { createSkyRenderer, type SkyRenderer } from "./renderer/webglSky";

function getRequiredElement<T extends Element>(
  id: string,
  constructor: { new (): T },
): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) {
    throw new Error(`Expected an element with id "${id}".`);
  }

  return element;
}

const canvas = getRequiredElement("sky", HTMLCanvasElement);
const favicon = getRequiredElement("favicon", HTMLLinkElement);
const errorMessage = getRequiredElement("error", HTMLParagraphElement);

let renderer: SkyRenderer | null = null;
let timeControls: TimeControls | null = null;
let dayOverride: number | null = null;
let animationFrame = 0;

const stop = (): void => {
  window.cancelAnimationFrame(animationFrame);
  window.removeEventListener("resize", resize);
  timeControls?.destroy();
  timeControls = null;
  renderer?.destroy();
  renderer = null;
};

const resize = (): void => renderer?.resize();

const render = (milliseconds: number): void => {
  renderer?.render(milliseconds, dayOverride);
  animationFrame = window.requestAnimationFrame(render);
};

try {
  renderer = createSkyRenderer(canvas, favicon);
  renderer.resize();
  if (import.meta.env.DEV) {
    void import("./dev/timeControls").then(({ createTimeControls }) => {
      if (renderer) {
        timeControls = createTimeControls((override) => {
          dayOverride = override;
        });
      }
    });
  }
  window.addEventListener("resize", resize);
  window.addEventListener("pagehide", stop, { once: true });
  animationFrame = window.requestAnimationFrame(render);
} catch (error) {
  errorMessage.textContent =
    error instanceof Error
      ? error.message
      : "The sky renderer could not start.";
  errorMessage.hidden = false;
  stop();
}
