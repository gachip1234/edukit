export const UNIT_STEP = 50; // 50 pixels per 1 mathematical coordinate unit
export const GRID_SUBDIV = 25; // 25 pixels per minor grid cell

export interface MathPoint {
  x: number;
  y: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export function getCanvasOrigin(width: number, height: number): ScreenPoint {
  const ox = Math.round(width / 2 / UNIT_STEP) * UNIT_STEP;
  const oy = Math.round(height / 2 / UNIT_STEP) * UNIT_STEP;
  return { x: ox, y: oy };
}

/**
 * Converts mathematical coordinate (mathX, mathY) to Canvas screen coordinate (px, py)
 * Note: Cartesian Y points upwards, while Screen Y points downwards.
 */
export function mathToScreen(
  mathX: number,
  mathY: number,
  origin: ScreenPoint,
  unitStep: number = UNIT_STEP
): ScreenPoint {
  return {
    x: origin.x + mathX * unitStep,
    y: origin.y - mathY * unitStep,
  };
}

/**
 * Converts Canvas screen coordinate (px, py) to mathematical coordinate (mathX, mathY)
 */
export function screenToMath(
  screenX: number,
  screenY: number,
  origin: ScreenPoint,
  unitStep: number = UNIT_STEP
): MathPoint {
  const mx = (screenX - origin.x) / unitStep;
  const my = (origin.y - screenY) / unitStep;
  return {
    x: Number(mx.toFixed(2)),
    y: Number(my.toFixed(2)),
  };
}
