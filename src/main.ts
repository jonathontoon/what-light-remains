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

const params = new URLSearchParams(window.location.search);
const canvas = getRequiredElement("sky", HTMLCanvasElement);
const favicon = getRequiredElement("favicon", HTMLLinkElement);
const errorMessage = getRequiredElement("error", HTMLParagraphElement);
const artworkDetails = document.querySelector<HTMLElement>("aside");

let renderer: SkyRenderer | null = null;
let animationFrame = 0;

const DAY_MINUTES = 24 * 60;

function parseTimeOverride(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return (hours * 60 + minutes) / DAY_MINUTES;
}

const timeOverride = params.has("time")
  ? parseTimeOverride(params.get("time")!)
  : null;

const stop = (): void => {
  window.cancelAnimationFrame(animationFrame);
  window.removeEventListener("resize", resize);
  renderer?.destroy();
  renderer = null;
};

const resize = (): void => renderer?.resize();

const render = (milliseconds: number): void => {
  renderer?.render(milliseconds, timeOverride);
  animationFrame = window.requestAnimationFrame(render);
};

try {
  renderer = createSkyRenderer(canvas, favicon);
  renderer.resize();

  window.addEventListener("resize", resize);
  window.addEventListener("pagehide", stop, { once: true });
  window.addEventListener("click", () => {
    artworkDetails?.classList.toggle("hidden");
  });
  if (params.has("hide_text") || params.get("hidden") === "true") {
    artworkDetails?.classList.add("hidden");
  }
  animationFrame = window.requestAnimationFrame(render);
} catch (error) {
  errorMessage.textContent =
    error instanceof Error
      ? error.message
      : "The sky renderer could not start.";
  errorMessage.hidden = false;
  stop();
}
