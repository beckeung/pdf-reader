export const MIN_ZOOM = 25;
export const MAX_ZOOM = 400;
export const ZOOM_STEPS = [
  25, 33, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400,
] as const;

export function clampZoomPercent(percent: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(percent)));
}

export function nextZoomStep(current: number, direction: 1 | -1): number {
  const p = clampZoomPercent(current);
  if (direction > 0) {
    const found = ZOOM_STEPS.find((step) => step > p);
    return found ?? MAX_ZOOM;
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i -= 1) {
    if (ZOOM_STEPS[i] < p) return ZOOM_STEPS[i];
  }
  return MIN_ZOOM;
}
