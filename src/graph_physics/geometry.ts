export type Point = { x: number; y: number };

export type Shape = "circle" | "rect";

export type Thing = {
  shape: Shape;
  x: number;
  y: number;
  r: number;
  width: number;
  height: number;
};

export const TWO_PI = 2 * Math.PI;

export function randomInRange(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function norm(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function distance(
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  return norm(ax - bx, ay - by);
}

export function normalize(point: Point): Point {
  const d = norm(point.x, point.y);
  return { x: point.x / d, y: point.y / d };
}

export function randomUnitVector(): Point {
  return normalize({ x: 0.5 - Math.random(), y: 0.5 - Math.random() });
}

export function unitVector(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Point {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = norm(dx, dy);
  if (d === 0) {
    return randomUnitVector();
  }
  return { x: dx / d, y: dy / d };
}

export function radBetween(
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  let a = Math.atan2(by, bx) - Math.atan2(ay, ax);
  if (a < 0) {
    a += TWO_PI;
  }
  return a;
}

export function rectangleRegion(
  x: number,
  y: number,
  w: number,
  h: number,
  u: Point
): "left" | "top" | "right" | "bottom" {
  const { x: ux, y: uy } = u;
  const { x: ax, y: ay } = unitVector(x, y, x - w / 2, y - h / 2);
  const { x: bx, y: by } = unitVector(x, y, x + w / 2, y - h / 2);
  const alpha = radBetween(ax, ay, bx, by);
  const beta = radBetween(ux, uy, bx, by);
  if (beta <= alpha) {
    return "top";
  } else if (beta <= Math.PI) {
    return "left";
  } else if (beta <= Math.PI + alpha) {
    return "bottom";
  } else {
    return "right";
  }
}

export function _centerToSurfaceDistance(
  shape: Shape,
  x: number,
  y: number,
  r: number,
  width: number,
  height: number,
  u: Point
): number {
  if (shape === "circle") {
    return r;
  }

  const tan = u.x / u.y;
  const region = rectangleRegion(x, y, width, height, u);
  if (region === "left" || region === "right") {
    return norm(width / 2, width / 2 / tan);
  }

  return norm((height / 2) * tan, height / 2);
}

export function centerToSurfaceDistance(node: Thing, u: Point): number {
  const { shape, x, y, r, width, height } = node;
  return _centerToSurfaceDistance(shape, x, y, r, width, height, u);
}

export function _surfaceDistance(
  a_shape: Shape,
  a_x: number,
  a_y: number,
  a_r: number,
  a_width: number,
  a_height: number,
  b_shape: Shape,
  b_x: number,
  b_y: number,
  b_r: number,
  b_width: number,
  b_height: number
): { l: number; d: number; u: Point } {
  const d = distance(a_x, a_y, b_x, b_y);
  const u = unitVector(a_x, a_y, b_x, b_y);

  const a_d = _centerToSurfaceDistance(
    a_shape,
    a_x,
    a_y,
    a_r,
    a_width,
    a_height,
    u
  );
  const b_d = _centerToSurfaceDistance(
    b_shape,
    b_x,
    b_y,
    b_r,
    b_width,
    b_height,
    u
  );

  const d_sum = b_d + a_d;
  const l = d - d_sum;

  return {
    d,
    l,
    u,
  };
}

export function surfaceDistance(
  a: Thing,
  b: Thing
): { l: number; d: number; u: Point } {
  return _surfaceDistance(
    a.shape,
    a.x,
    a.y,
    a.r,
    a.width,
    a.height,
    b.shape,
    b.x,
    b.y,
    b.r,
    b.width,
    b.height
  );
}

export function randomInRadius(cX: number, cY: number, R: number): Point {
  const angle = Math.random() * TWO_PI;
  return {
    x: cX + R * Math.cos(angle),
    y: cY + R * Math.sin(angle),
  };
}

export function jigglePoint(point: Point, intensity: number = 1): Point {
  const r = randomUnitVector();
  return {
    x: point.x + intensity * r.x,
    y: point.y + intensity * r.y,
  };
}
