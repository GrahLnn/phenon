export type Transform = {
  zoom: number;
  origin: Vec2;
};

export type MutRef<T> = { current: T };

export type Vec2 = { x: number; y: number };
export const DEFAULT_EDGE_LEN = 48;
export const EDGE_INSET = 6;
export const EDGE_ARROW_HEIGHT = 10;
export const SIM_ALPHA_DECAY_DEFAULT = 0.01;
export const NODE_DIAMETER = 16;
export const NODE_RADIUS = NODE_DIAMETER / 2;
export const EDGE_TAIL_OVERLAP_PX = -4;

export const getOrCreateRef = <T>(
  map: Map<string, MutRef<T>>,
  key: string,
  init: () => T
): MutRef<T> => {
  const existed = map.get(key);
  if (existed) return existed;
  const ref = { current: init() };
  map.set(key, ref);
  return ref;
};
