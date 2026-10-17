/**
 * The RK4 state of one body: its centre, velocity and angular velocity, plus the four energy
 * ledger terms, which are integrated as extra RK4 states (Phase 1 prompt, "Energy ledger").
 * Plain objects with named fields keep hot loops free of indexed reads (ADR-0006).
 */

export interface Dyn {
  x: number; // m
  y: number; // m
  z: number; // m
  vx: number; // m/s
  vy: number; // m/s
  vz: number; // m/s
  wx: number; // rad/s
  wy: number; // rad/s
  wz: number; // rad/s
  /** Work done by sliding friction (J). */
  eSlide: number;
  /** Work done by rolling resistance (J). */
  eRoll: number;
  /** Work done by spin friction (J). */
  eSpin: number;
  /** Work done by air drag (J). */
  eDrag: number;
}

export function newDyn(): Dyn {
  return {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    wx: 0,
    wy: 0,
    wz: 0,
    eSlide: 0,
    eRoll: 0,
    eSpin: 0,
    eDrag: 0,
  };
}

export function copyDyn(out: Dyn, a: Dyn): Dyn {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  out.vx = a.vx;
  out.vy = a.vy;
  out.vz = a.vz;
  out.wx = a.wx;
  out.wy = a.wy;
  out.wz = a.wz;
  out.eSlide = a.eSlide;
  out.eRoll = a.eRoll;
  out.eSpin = a.eSpin;
  out.eDrag = a.eDrag;
  return out;
}

/** out = a + h·k */
export function axpy(out: Dyn, a: Dyn, h: number, k: Dyn): Dyn {
  out.x = a.x + h * k.x;
  out.y = a.y + h * k.y;
  out.z = a.z + h * k.z;
  out.vx = a.vx + h * k.vx;
  out.vy = a.vy + h * k.vy;
  out.vz = a.vz + h * k.vz;
  out.wx = a.wx + h * k.wx;
  out.wy = a.wy + h * k.wy;
  out.wz = a.wz + h * k.wz;
  out.eSlide = a.eSlide + h * k.eSlide;
  out.eRoll = a.eRoll + h * k.eRoll;
  out.eSpin = a.eSpin + h * k.eSpin;
  out.eDrag = a.eDrag + h * k.eDrag;
  return out;
}

/** out = a + (h/6)·(k1 + 2·k2 + 2·k3 + k4): the classical RK4 combination. */
export function rk4Combine(out: Dyn, a: Dyn, h: number, k1: Dyn, k2: Dyn, k3: Dyn, k4: Dyn): Dyn {
  const s = h / 6;
  out.x = a.x + s * (k1.x + 2 * k2.x + 2 * k3.x + k4.x);
  out.y = a.y + s * (k1.y + 2 * k2.y + 2 * k3.y + k4.y);
  out.z = a.z + s * (k1.z + 2 * k2.z + 2 * k3.z + k4.z);
  out.vx = a.vx + s * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx);
  out.vy = a.vy + s * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy);
  out.vz = a.vz + s * (k1.vz + 2 * k2.vz + 2 * k3.vz + k4.vz);
  out.wx = a.wx + s * (k1.wx + 2 * k2.wx + 2 * k3.wx + k4.wx);
  out.wy = a.wy + s * (k1.wy + 2 * k2.wy + 2 * k3.wy + k4.wy);
  out.wz = a.wz + s * (k1.wz + 2 * k2.wz + 2 * k3.wz + k4.wz);
  out.eSlide = a.eSlide + s * (k1.eSlide + 2 * k2.eSlide + 2 * k3.eSlide + k4.eSlide);
  out.eRoll = a.eRoll + s * (k1.eRoll + 2 * k2.eRoll + 2 * k3.eRoll + k4.eRoll);
  out.eSpin = a.eSpin + s * (k1.eSpin + 2 * k2.eSpin + 2 * k3.eSpin + k4.eSpin);
  out.eDrag = a.eDrag + s * (k1.eDrag + 2 * k2.eDrag + 2 * k3.eDrag + k4.eDrag);
  return out;
}
