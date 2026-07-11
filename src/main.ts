type ElementGuard<T extends Element> = (element: Element) => element is T;

type UniformLocations = Readonly<{
  resolution: WebGLUniformLocation;
  time: WebGLUniformLocation;
  day: WebGLUniformLocation;
  latitude: WebGLUniformLocation;
  daylight: WebGLUniformLocation;
}>;

const DAY_MINUTES = 24 * 60;
const DEFAULT_LATITUDE = 36.8;
const MAX_DEVICE_PIXEL_RATIO = 2;

const vertexSource = `attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }`;
const fragmentSource = `
precision highp float;
uniform vec2 resolution;
uniform float time;
uniform float day;
uniform float latitude;
uniform float daylight;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y); }
vec3 ramp(float t) {
  vec3 night = vec3(0.015,0.035,0.12);
  vec3 blue = vec3(0.075,0.22,0.46);
  vec3 dayBlue = vec3(0.31,0.70,0.86);
  vec3 gold = vec3(1.0,0.59,0.28);
  vec3 blush = vec3(0.92,0.34,0.35);
  vec3 dusk = vec3(0.28,0.10,0.32);
  float cycle = sin(t * 6.283185);
  float warm = smoothstep(-.15,.5,cycle) * smoothstep(.95,.25,cycle);
  vec3 sky = mix(night, blue, smoothstep(0.,.22,t));
  sky = mix(sky, dayBlue, smoothstep(.18,.42,t));
  sky = mix(sky, gold, smoothstep(.34,.54,t));
  sky = mix(sky, blush, smoothstep(.48,.64,t));
  sky = mix(sky, dusk, smoothstep(.60,.80,t));
  sky = mix(sky, night, smoothstep(.78,1.,t));
  return sky + warm * vec3(.12,.04,-.01);
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  float aspect = resolution.x / resolution.y;
  vec2 p = uv - .5; p.x *= aspect;
  float localTime = fract(day + time * .0000015);
  float drift = sin(time * .00007 + p.y * 3.0) * .012 + noise(uv * 2.3 + time*.000025) * .018;
  vec3 top = ramp(localTime + .02);
  vec3 bottom = ramp(localTime - .10);
  vec3 color = mix(top, bottom, smoothstep(.10,.92,uv.y) + drift);
  float latitudeMod = clamp(abs(latitude) / 90.0, 0.0, 1.0);
  color *= 1.0 - latitudeMod * .06;
  color *= mix(.90, 1.06, daylight);
  float warmthCycle = sin(localTime * 6.283185);
  float haze = exp(-abs(uv.y - .48) * 18.0);
  color += haze * vec3(1.0,.55,.22) * .035 * (1.0 - abs(warmthCycle));
  float vignette = 1.0 - smoothstep(.24,.82,length(p / vec2(aspect,.8)));
  color *= .88 + vignette * .12;
  gl_FragColor = vec4(pow(max(color,0.0), vec3(.92)), 1.0);
}`;

function getRequiredElement<T extends Element>(
  selector: string,
  expectedType: string,
  guard: ElementGuard<T>,
): T {
  const element = document.querySelector(selector);
  if (!element || !guard(element)) {
    throw new Error(`Expected ${expectedType} at ${selector}.`);
  }

  return element;
}

function getWebGLContext(canvas: HTMLCanvasElement): WebGLRenderingContext {
  const context = canvas.getContext("webgl", {
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!context) {
    document.body.innerHTML =
      '<p style="padding:2rem;font-family:system-ui">This installation needs a WebGL-capable browser.</p>';
    throw new Error("WebGL is unavailable.");
  }

  return context;
}

function createShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Unable to create WebGL shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(
      gl.getShaderInfoLog(shader) ?? "WebGL shader compilation failed.",
    );
  }

  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) {
    throw new Error("Unable to create WebGL program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(
      gl.getProgramInfoLog(program) ?? "WebGL program linking failed.",
    );
  }

  return program;
}

function getRequiredUniformLocation(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) {
    throw new Error(`WebGL uniform "${name}" is unavailable.`);
  }

  return location;
}

function getRequiredAttributeLocation(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  name: string,
): number {
  const location = gl.getAttribLocation(program, name);
  if (location === -1) {
    throw new Error(`WebGL attribute "${name}" is unavailable.`);
  }

  return location;
}

function getLocalMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function getLatitude(): number {
  const storedLatitude = localStorage.getItem("sky-latitude");
  if (storedLatitude === null) {
    return DEFAULT_LATITUDE;
  }

  const latitude = Number(storedLatitude);
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90
    ? latitude
    : DEFAULT_LATITUDE;
}

function isDaylightSavingTime(date: Date): boolean {
  const januaryOffset = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
  const julyOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  return (
    januaryOffset !== julyOffset &&
    date.getTimezoneOffset() === Math.min(januaryOffset, julyOffset)
  );
}

function updateFaviconFromFrame(
  gl: WebGLRenderingContext,
  canvas: HTMLCanvasElement,
  favicon: HTMLLinkElement,
): void {
  const pixel = new Uint8Array(4);
  const sample = (y: number): string => {
    gl.readPixels(
      Math.floor(canvas.width / 2),
      y,
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixel,
    );
    return `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
  };

  const top = sample(canvas.height - 1);
  const middle = sample(Math.floor(canvas.height * 0.5));
  const bottom = sample(0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${top}"/><stop offset=".56" stop-color="${middle}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#g)"/></svg>`;
  favicon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const canvas = getRequiredElement(
  "#sky",
  "an HTMLCanvasElement",
  (element): element is HTMLCanvasElement =>
    element instanceof HTMLCanvasElement,
);
const favicon = getRequiredElement(
  "#favicon",
  "an HTMLLinkElement",
  (element): element is HTMLLinkElement => element instanceof HTMLLinkElement,
);
const infoTrigger = getRequiredElement(
  "#info-trigger",
  "an HTMLButtonElement",
  (element): element is HTMLButtonElement =>
    element instanceof HTMLButtonElement,
);
const infoPanel = getRequiredElement(
  "#info-panel",
  "an HTMLElement",
  (element): element is HTMLElement => element instanceof HTMLElement,
);
const infoClose = getRequiredElement(
  "#info-close",
  "an HTMLButtonElement",
  (element): element is HTMLButtonElement =>
    element instanceof HTMLButtonElement,
);
const gl = getWebGLContext(canvas);
const program = createProgram(
  gl,
  createShader(gl, gl.VERTEX_SHADER, vertexSource),
  createShader(gl, gl.FRAGMENT_SHADER, fragmentSource),
);
const buffer = gl.createBuffer();
if (!buffer) {
  throw new Error("Unable to create WebGL vertex buffer.");
}

gl.useProgram(program);
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
  gl.STATIC_DRAW,
);

const position = getRequiredAttributeLocation(gl, program, "position");
gl.enableVertexAttribArray(position);
gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

const uniforms: UniformLocations = {
  resolution: getRequiredUniformLocation(gl, program, "resolution"),
  time: getRequiredUniformLocation(gl, program, "time"),
  day: getRequiredUniformLocation(gl, program, "day"),
  latitude: getRequiredUniformLocation(gl, program, "latitude"),
  daylight: getRequiredUniformLocation(gl, program, "daylight"),
};

const now = new Date();
const latitude = getLatitude();
const daylightSaving = isDaylightSavingTime(now) ? 1 : 0;
const renderState = { lastFaviconSecond: -1 };

function setInfoOpen(open: boolean): void {
  infoTrigger.setAttribute("aria-expanded", String(open));
  infoPanel.setAttribute("aria-hidden", String(!open));
  infoPanel.classList.toggle("pointer-events-none", !open);
  infoPanel.classList.toggle("opacity-0", !open);
  infoPanel.classList.toggle("translate-y-[-8px]", !open);
  infoPanel.classList.toggle("opacity-100", open);
  infoPanel.classList.toggle("translate-y-0", open);
}

function resize(): void {
  const devicePixelRatio = Math.min(
    window.devicePixelRatio,
    MAX_DEVICE_PIXEL_RATIO,
  );
  canvas.width = Math.round(window.innerWidth * devicePixelRatio);
  canvas.height = Math.round(window.innerHeight * devicePixelRatio);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
}

function tick(milliseconds: number): void {
  const currentMinutes = getLocalMinutes(new Date());
  gl.uniform1f(uniforms.time, milliseconds);
  gl.uniform1f(uniforms.day, currentMinutes / DAY_MINUTES);
  gl.uniform1f(uniforms.latitude, latitude);
  gl.uniform1f(uniforms.daylight, daylightSaving);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  const second = Math.floor(milliseconds / 1000);
  if (second !== renderState.lastFaviconSecond) {
    renderState.lastFaviconSecond = second;
    updateFaviconFromFrame(gl, canvas, favicon);
  }

  window.requestAnimationFrame(tick);
}

infoTrigger.addEventListener("click", () => {
  setInfoOpen(infoTrigger.getAttribute("aria-expanded") !== "true");
});
infoClose.addEventListener("click", () => setInfoOpen(false));
window.addEventListener("resize", resize);

resize();
window.requestAnimationFrame(tick);
