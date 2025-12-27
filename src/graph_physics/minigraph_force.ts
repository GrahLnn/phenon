import { surfaceDistance } from "./geometry";
import type { SimNode } from "./simulation";

const SUBGRAPH_MAX_D = 6 * 24;
const LINK_DISTANCE = 24;

export type LinkLike = {
  source_id: string;
  target_id: string;
  distance?: number;
  centerDistance?: number;
};

export function applyMinigraphForce<N extends {}>(
  nodes: Record<string, SimNode<N>>,
  links: readonly LinkLike[],
  alpha: number,
  opt?: { linkDistance?: number; maxD?: number; axisLockY?: boolean }
) {
  const linkDistance = opt?.linkDistance ?? LINK_DISTANCE;
  const maxD = opt?.maxD ?? SUBGRAPH_MAX_D;
  const axisLockY = opt?.axisLockY ?? false;

  const nodeEntries = Object.entries(nodes);
  const nodeN = nodeEntries.length;

  for (let i = 0; i < nodeN; i++) {
    const [, a] = nodeEntries[i];

    for (let j = i + 1; j < nodeN; j++) {
      const [, b] = nodeEntries[j];

      const { u } = surfaceDistance(a, b);
      let { l } = surfaceDistance(a, b);
      l = Math.max(l, 1);

      if (l < maxD) {
        const k = (-90 * alpha) / l;
        b.vx -= u.x * k;
        b.vy -= u.y * k;
        a.vx += u.x * k;
        a.vy += u.y * k;
      }
    }

    if (axisLockY) {
      a.y -= (a.y * alpha) / 6;
    }
  }

  for (let i = 0; i < links.length; i++) {
    const { source_id, target_id, distance, centerDistance } = links[i];
    const a = nodes[source_id];
    const b = nodes[target_id];
    if (!a || !b) continue;

    let { l, d } = surfaceDistance(b, a);
    l = Math.max(l, 1);
    d = Math.max(d, 1);

    const tl =
      centerDistance !== undefined
        ? Math.max(0, centerDistance - (d - l))
        : distance ?? linkDistance;

    const ax = a.x;
    const bx = b.x;
    const ay = a.y;
    const by = b.y;

    const k = alpha / d;
    const ll = (l - tl) * k;

    const x = (bx - ax) * ll;
    const y = (by - ay) * ll;

    b.vx -= x;
    b.vy -= y;
    a.vx += x;
    a.vy += y;

    const my = (ay + by) / 2;

    b.vy += ((my - by) * alpha) / 3;
    a.vy += ((my - ay) * alpha) / 3;
  }
}

export const constants = {
  LINK_DISTANCE,
  SUBGRAPH_MAX_D,
};
