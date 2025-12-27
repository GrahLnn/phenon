import { Shape } from "./geometry";

export type Dict<T> = Record<string, T>;

export type SimulationOpt = {
  alpha?: number;
  alphaMin?: number;
  alphaDecay?: number;
  alphaTarget?: number;
  velocityDecay?: number;
  stability?: number;
  n?: number;
  t?: number;
  force?: (alpha: number) => void;
};

export type SimNode<T extends {} = {}> = T & {
  x: number;
  y: number;
  fx?: number;
  fy?: number;
  shape: Shape;
  r: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  hx: number;
  hy: number;
  _x: number;
  _y: number;
};

export interface SimLink<T> {
  l: number;
  s: number;
  source_id: string;
  target_id: string;
  padding: {
    source: number;
    target: number;
  };
  detail: T;
}

const RK1C = 1;
const RK10 = [1];
const RK11 = [1];

const RK2C = 2;
const RK20 = [0, 1];
const RK21 = [1, 1];

const RK3C = 9;
const RK30 = [0, 1 / 2, 3 / 4];
const RK31 = [2, 3, 4];

const RK4C = 6;
const RK40 = [0, 0.5, 0.5, 1];
const RK41 = [1, 2, 2, 1];

const RKC = [RK1C, RK2C, RK3C, RK4C];
const RK = [
  [RK10, RK11],
  [RK20, RK21],
  [RK30, RK31],
  [RK40, RK41],
] as const;

export class Simulation<N extends {} = {}, L extends {} = {}> {
  public _nodes: Dict<SimNode<N>> = {};
  public _links: Dict<SimLink<L>> = {};

  private _alpha = 1;
  private _alphaDecay: number;
  private _alphaMin: number;
  private _alphaTarget: number;
  private _stability = 1;
  private _velocityDecay: number;
  private _n = 1;
  private _t = 1;

  private _force: (alpha: number) => void;

  constructor({
    alpha = 0.25,
    alphaMin = 0.001,
    alphaTarget = 0,
    alphaDecay,
    velocityDecay = 0.2,
    n = 1,
    t = 1,
    stability = 1,
    force = () => {},
  }: SimulationOpt) {
    this._alphaDecay =
      alphaDecay === undefined ? 1 - Math.pow(alphaMin, 1 / 300) : alphaDecay;

    this._alpha = alpha;
    this._alphaMin = alphaMin;
    this._alphaTarget = alphaTarget;
    this._velocityDecay = velocityDecay;
    this._stability = stability;
    this._n = n;
    this._t = t;
    this._force = force;
  }

  public nodes(nodes?: Dict<SimNode<N>>): Dict<SimNode<N>> {
    if (nodes !== undefined) {
      this._nodes = nodes;
    }
    return this._nodes;
  }

  public links(links?: Dict<SimLink<L>>): Dict<SimLink<L>> {
    if (links !== undefined) {
      this._links = links;
    }
    return this._links;
  }

  public alphaDecay(alphaDecay?: number): number {
    if (alphaDecay !== undefined) {
      this._alphaDecay = alphaDecay;
    }
    return this._alphaDecay;
  }

  public alphaMin(alphaMin?: number): number {
    if (alphaMin !== undefined) {
      this._alphaMin = alphaMin;
    }
    return this._alphaMin;
  }

  public alpha(alpha?: number): number {
    if (alpha !== undefined) {
      this._alpha = alpha;
    }
    return this._alpha;
  }

  public velocityDecay(velocityDecay?: number): number {
    if (velocityDecay !== undefined) {
      this._velocityDecay = velocityDecay;
    }
    return this._velocityDecay;
  }

  public alphaTarget(alphaTarget?: number): number {
    if (alphaTarget !== undefined) {
      this._alphaTarget = alphaTarget;
    }
    return this._alphaTarget;
  }

  public stability(stability?: number): number {
    if (stability !== undefined) {
      if (stability < 1 || stability > 4) {
        throw new Error(
          "simulation stability must be between 1 and 4, inclusive"
        );
      }
      this._stability = stability;
    }
    return this._stability;
  }

  public n(n?: number): number {
    if (n !== undefined) this._n = n;
    return this._n;
  }

  public t(t?: number): number {
    if (t !== undefined) this._t = t;
    return this._t;
  }

  public force(force?: (alpha: number) => void): (alpha: number) => void {
    if (force !== undefined) this._force = force;
    return this._force;
  }

  /**
   * 执行一次 simulation tick。
   * - 返回 true 表示达到 alphaMin（已“结束”）
   * - 返回 false 表示仍在运行
   */
  public step(): boolean {
    this._alpha += (this._alphaTarget - this._alpha) * this._alphaDecay;

    if (this._alpha < this._alphaMin) {
      return true;
    }

    const rk: Dict<{
      _vx?: number;
      _vy?: number;
      _ax?: number;
      _ay?: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
    }> = {};

    // friction：unit 用常量 0.75；这里用 velocityDecay 近似表达可调阻尼
    const F = 1 - this._velocityDecay;
    const T = this._t;

    const order = this._stability;
    const order_1 = order - 1;

    const RKOC = RKC[order_1];
    const RKO = RK[order_1];

    const RKO0 = RKO[0];
    const RKO1 = RKO[1];

    let delta = 0;

    for (let i = 0; i < this._n; i++) {
      for (let j = 0; j < order; j++) {
        this._force(this._alpha);

        const k0 = RKO0[j] * T;
        const k1 = (RKO1[j] * T) / RKOC;

        for (const node_id in this._nodes) {
          const node = this._nodes[node_id];

          if (j === 0) {
            const { x, y, vx, vy, ax, ay } = node;
            rk[node_id] = { x, y, vx, vy, _vx: vx, _vy: vy, _ax: ax, _ay: ay };
          }

          const { ax, ay, fx, fy } = node;
          const _rk = rk[node_id];
          const { x, y, vx, vy, _vx, _vy, _ax, _ay } = _rk;

          if (fx === undefined) {
            const __x = x + (_vx ?? 0) * k0;
            const __vx = vx + (_ax ?? 0) * k0;
            const __ax = ax - F * __vx;

            _rk._vx = __vx;
            _rk._ax = __ax;

            const dx = __vx * k1;

            node._x = __x;
            delta += Math.abs(dx);

            node.x += dx;
            node.vx += __ax * k1;
          } else {
            delta += Math.abs(fx - node.x);
            node.x = fx;
            node.vx = 0;
          }

          if (j === order_1) {
            node._x = node.x;
          }

          node.ax = 0;

          if (fy === undefined) {
            const __y = y + (_vy ?? 0) * k0;
            const __vy = vy + (_ay ?? 0) * k0;
            const __ay = ay - F * __vy;

            _rk._vy = __vy;
            _rk._ay = __ay;

            node._y = __y;

            const dy = __vy * k1;
            delta += Math.abs(dy);

            node.y += dy;
            node.vy += __ay * k1;
          } else {
            delta += Math.abs(fy - node.y);
            node.y = fy;
            node.vy = 0;
          }

          if (j === order_1) {
            node._y = node.y;
          }

          node.ay = 0;
        }
      }
    }

    if (delta < 1) {
      this._alpha = 0.1;
    }

    return false;
  }
}
