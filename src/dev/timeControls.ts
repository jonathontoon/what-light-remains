import "./timeControls.css";

const DAY_MINUTES = 24 * 60;

export type TimeControls = Readonly<{
  destroy: () => void;
}>;

function getLocalMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${remainder
    .toString()
    .padStart(2, "0")}`;
}

export function createTimeControls(
  onChange: (dayOverride: number | null) => void,
): TimeControls {
  const container = document.createElement("section");
  const label = document.createElement("label");
  const value = document.createElement("output");
  const input = document.createElement("input");
  const liveButton = document.createElement("button");

  container.className = "dev-time-controls";
  container.setAttribute("aria-label", "Development time controls");
  label.htmlFor = "dev-time-of-day";
  label.textContent = "Time of day";
  value.htmlFor = "dev-time-of-day";
  input.id = "dev-time-of-day";
  input.type = "range";
  input.min = "0";
  input.max = String(DAY_MINUTES - 1);
  input.step = "1";
  liveButton.type = "button";
  liveButton.textContent = "Live";

  const setLiveTime = (): void => {
    const minutes = getLocalMinutes(new Date());
    input.value = String(minutes);
    value.textContent = `Live · ${formatMinutes(minutes)}`;
    liveButton.disabled = true;
  };

  const handleInput = (): void => {
    const minutes = Number(input.value);
    value.textContent = formatMinutes(minutes);
    liveButton.disabled = false;
    onChange(minutes / DAY_MINUTES);
  };

  const handleLiveClick = (): void => {
    setLiveTime();
    onChange(null);
  };

  setLiveTime();
  input.addEventListener("input", handleInput);
  liveButton.addEventListener("click", handleLiveClick);
  const liveInterval = window.setInterval(() => {
    if (liveButton.disabled) {
      setLiveTime();
    }
  }, 30_000);

  container.append(label, value, input, liveButton);
  document.querySelector("main")?.append(container);

  const destroy = (): void => {
    window.clearInterval(liveInterval);
    input.removeEventListener("input", handleInput);
    liveButton.removeEventListener("click", handleLiveClick);
    container.remove();
  };

  return { destroy };
}
