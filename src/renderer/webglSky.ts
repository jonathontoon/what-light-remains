import { FRAGMENT_SOURCE, VERTEX_SOURCE } from "./shaders";

type UniformLocations = Readonly<{
  resolution: WebGLUniformLocation;
  time: WebGLUniformLocation;
  day: WebGLUniformLocation;
  dateSeed: WebGLUniformLocation;
}>;

export type SkyRenderer = Readonly<{
  resize: () => void;
  render: (milliseconds: number) => void;
  destroy: () => void;
}>;

const DAY_MINUTES = 24 * 60;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const MAX_DEVICE_PIXEL_RATIO = 2;

function getWebGLContext(canvas: HTMLCanvasElement): WebGLRenderingContext {
  const context = canvas.getContext("webgl", {
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!context) {
    throw new Error("This installation needs a WebGL-capable browser.");
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

function getLocalDateSeed(date: Date): number {
  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) /
    DAY_MILLISECONDS
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

export function createSkyRenderer(
  canvas: HTMLCanvasElement,
  favicon: HTMLLinkElement,
): SkyRenderer {
  const gl = getWebGLContext(canvas);
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  const program = createProgram(gl, vertexShader, fragmentShader);
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
    dateSeed: getRequiredUniformLocation(gl, program, "dateSeed"),
  };

  const resize = (): void => {
    const devicePixelRatio = Math.min(
      window.devicePixelRatio,
      MAX_DEVICE_PIXEL_RATIO,
    );
    const { width: cssWidth, height: cssHeight } =
      canvas.getBoundingClientRect();
    canvas.width = Math.round(cssWidth * devicePixelRatio);
    canvas.height = Math.round(cssHeight * devicePixelRatio);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
  };

  let lastFaviconSecond = -1;
  const render = (milliseconds: number): void => {
    const currentDate = new Date();
    const currentMinutes = getLocalMinutes(currentDate);
    gl.uniform1f(uniforms.time, milliseconds);
    gl.uniform1f(uniforms.day, currentMinutes / DAY_MINUTES);
    gl.uniform1f(uniforms.dateSeed, getLocalDateSeed(currentDate));
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const frameSecond = Math.floor(milliseconds / 1000);
    if (frameSecond !== lastFaviconSecond) {
      lastFaviconSecond = frameSecond;
      updateFaviconFromFrame(gl, canvas, favicon);
    }
  };

  const destroy = (): void => {
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
  };

  return { resize, render, destroy };
}
