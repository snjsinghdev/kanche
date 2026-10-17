/**
 * The shot loop (ADR-0006). Time runs on the fixed dt grid. Inside each step every moving marble
 * (or group of held marbles) makes a trial advance to the grid line. The earliest event among
 * their internal events and their contacts splits the step: only the marbles it involves are
 * committed to that time, the event is resolved, and those marbles make a new trial from there.
 * Every other marble keeps its trial, so its integration never depends on events it takes no part
 * in. At the grid line every marble commits to the end of its trial. Simultaneous events resolve
 * one at a time in the order (time, kind, lower id, higher id).
 */

import { Fnv64 } from '../det/hash.ts';
import { defined, expectKind, PhysicsError } from '../errors.ts';
import type {
  EnergyLedger,
  Keyframe,
  MarbleTimeline,
  PhysicsEvent,
  ShotMetrics,
  TransitionKind,
} from '../events.ts';
import { makeTable, segmentAt, tableValue } from '../params/table.ts';
import type { ContactPair } from '../params/types.ts';
import { MOTION_CODE, type MarbleState } from '../state.ts';
import {
  advanceGroup,
  commitGroup,
  holdNeedNow,
  restTrack,
  locateCell,
  newTrack,
  PROBE,
  slopeAt,
  supportLevel,
  type InternalEvent,
  type Track,
  type World,
} from './advance.ts';
import {
  BASE,
  FLOOR,
  isPlane,
  kineticEnergy,
  potentialEnergy,
  RIM,
  type Body,
  type Support,
} from './body.ts';
import { pairContact, pieceAt, staticContact, type StaticHit } from './contacts.ts';
import {
  curvedGeometry,
  newCtx,
  newGeo,
  rollingFrictionNeeded,
  supportNormalForce,
  type Ctx,
} from './derivative.ts';
import { canSupport, featureGap, holeRadial, newGap, type StaticFeature } from './features.ts';
import { copyDyn, newDyn, type Dyn } from './dyn.ts';
import { extendBox, positionAt } from './hermite.ts';
import { newImpactOutput, resolveImpact, type ImpactSide } from './impact.ts';
import { canHold, holdGeometry, newHoldGeo, type Hold, type HoldGeo } from './holds.ts';
import { MAX_EXACT, solveLcp } from './lcp.ts';

/** Bookkeeping events that change nothing visible get no keyframes. */
const SILENT = new Set<number>([
  PROBE.segUp,
  PROBE.segDown,
  PROBE.cellXLo,
  PROBE.cellXHi,
  PROBE.cellYLo,
  PROBE.cellYHi,
]);

const trueA = newDyn();
const trueB = newDyn();

/** A contact event whose surfaces are further apart than this at commit is stale (m). */
const CONTACT_SLACK = 1e-9;

/** Contacts closer than this count as touching when contacts are relaxed after an impact (m). */
const TOUCH = 1e-9;
/** Gauss–Seidel sweeps when relaxing contacts after an impact (–). */
const RELAX_SWEEPS = 64;
/** Settle-and-stop passes when relaxing contacts after an impact (–). */
const RELAX_PASSES = 4;
/** Rank of an event kind for simultaneous events: impacts first, then internal events. */
const RANK_PAIR = 0;
const RANK_STATIC = 1;
const RANK_INTERNAL = 2;

interface Next {
  t: number;
  rank: number;
  a: Body;
  b: Body | null;
  feature: StaticFeature | null;
  internal: InternalEvent | null;
}

interface Group {
  readonly bodies: Body[];
  readonly tracks: Track[];
  readonly holds: Hold[];
}

interface Box {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

export class Sim {
  readonly world: World;
  readonly bodies: readonly Body[];
  private readonly tracks: readonly Track[];
  private readonly boxes: readonly Box[];
  readonly events: PhysicsEvent[] = [];
  /** Resting contacts currently held (MECHANICS-REVIEW finding 8). */
  readonly holds: Hold[] = [];
  readonly timelines: { id: number; keyframes: Keyframe[] }[] | null;
  /** Absolute time of the current step's start (s). */
  private stepStart = 0;
  /** Time inside the current step (s). */
  private tau = 0;
  private impactLoss = 0;
  private removed = 0;
  private forced = 0;
  private readonly initialKinetic: number;
  private readonly initialPotential: number;
  private readonly hit: StaticHit = { t: Infinity, feature: null };
  /** The ground itself (base, block tops, the hole's floor and wall) as an impact pair. */
  private readonly groundPair: ContactPair;

  constructor(world: World, bodies: readonly Body[], recordTimeline: boolean) {
    this.world = world;
    this.bodies = bodies;
    this.tracks = bodies.map(() => newTrack());
    this.boxes = bodies.map(() => ({ xMin: 0, xMax: 0, yMin: 0, yMax: 0, zMin: 0, zMax: 0 }));
    this.order = bodies.map((_, i) => i);
    bodies.forEach((b, i) => this.slots.set(b, i));
    this.best = {
      t: 0,
      rank: 0,
      a: defined(bodies[0], 'body'),
      b: null,
      feature: null,
      internal: null,
    };
    this.singletons = bodies.map((b, i) => ({
      bodies: [b],
      tracks: [defined(this.tracks[i], 'track')],
      holds: [],
    }));
    this.timelines = recordTimeline ? bodies.map((b) => ({ id: b.id, keyframes: [] })) : null;
    this.groundPair = {
      e: world.surface.e,
      mu: makeTable({ x: [0], y: [world.surface.muS] }, 'ground impact friction'),
    };
    for (const b of bodies) this.settle(b);
    let ke = 0;
    let pe = 0;
    for (const b of bodies) {
      ke += kineticEnergy(b);
      pe += potentialEnergy(b, world.params.g);
    }
    this.initialKinetic = ke;
    this.initialPotential = pe;
    for (const b of bodies) this.keyframe(b);
  }

  private now(): number {
    return this.stepStart + this.tau;
  }

  private moving(): boolean {
    for (const b of this.bodies) if (!b.done && b.motion !== 'resting') return true;
    return false;
  }

  run(): void {
    const { dt, tMax, solver } = this.world.params;
    const metrics = this.world.metrics;
    for (let k = 0; ; k += 1) {
      this.stepStart = k * dt;
      this.tau = 0;
      if (!this.moving()) return;
      if (this.stepStart >= tMax) {
        metrics.forcedRest = true;
        this.forceRest();
        return;
      }
      metrics.steps += 1;
      const { bodies, movedThisStep } = this;
      for (let i = 0; i < bodies.length; i += 1) {
        const b = defined(bodies[i], 'body');
        movedThisStep[i] = !b.done && b.motion !== 'resting';
      }
      for (const group of this.groups()) {
        // A constant trial (nothing in the group moves) holds for the next step too.
        let keep = true;
        for (const tr of group.tracks) if (!tr.fresh) keep = false;
        for (const tr of group.tracks) {
          tr.start = 0;
          if (!keep) tr.fresh = false;
          else {
            const p = defined(tr.pieces[0], 'piece');
            p.t0 = 0;
            p.t1 = dt;
          }
        }
      }
      let eventsInStep = 0;
      while (this.tau < dt) {
        const next = this.findNext();
        if (next === null) break;
        this.commitInvolved(next);
        this.tau = Math.min(next.t, dt);
        this.apply(next);
        for (const b of this.bodies) this.tidySpin(b);
        this.checkPockets();
        eventsInStep += 1;
        if (this.events.length > solver.eventsPerShot) {
          metrics.shotCapHit = true;
          this.commitEveryone();
          this.forceRest();
          return;
        }
        if (eventsInStep > solver.eventsPerStep) {
          metrics.stepCapHits += 1;
          this.stepCapFallback(next);
          eventsInStep = 0;
        }
      }
      this.tau = dt;
      this.commitEveryone();
      for (const b of this.bodies) this.tidySpin(b);
      this.checkPockets();
      if (this.timelines !== null) {
        for (let i = 0; i < bodies.length; i += 1) {
          if (movedThisStep[i] === true) this.keyframe(defined(bodies[i], 'body'));
        }
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  // Finding the next event

  /**
   * The next event from now to the grid line. Groups whose trial is still fresh keep it (and its
   * internal event); the rest make a new trial from now.
   */
  private findNext(): Next | null {
    const { bodies, tracks, world } = this;
    const now = this.tau;
    const end = world.params.dt;
    // The candidates are offered into one reused object (`best`); nothing keeps a Next past apply.
    const best = this.best;
    let found = false;
    for (const group of this.groups()) {
      const lead = defined(group.tracks[0], 'track');
      let ev: InternalEvent | null = null;
      if (lead.fresh) {
        for (const tr of group.tracks) if (tr.event !== null) ev = tr.event;
      } else {
        for (const tr of group.tracks) {
          if (tr.start !== now) throw new PhysicsError('internal', 'a stale trial is behind');
          tr.fresh = true;
        }
        const lone = group.bodies.length === 1 ? group.bodies[0] : undefined;
        if (lone !== undefined && (lone.done || lone.motion === 'resting')) {
          restTrack(lone, lead, now, end);
        } else {
          ev = advanceGroup(world, group.bodies, group.tracks, group.holds, now, end);
        }
        for (const b of group.bodies) this.boxOf(b);
      }
      if (ev !== null) {
        const a = defined(ev.body, 'event marble');
        found = offer(best, found, ev.t, RANK_INTERNAL + ev.code, a, null, null, ev);
      }
    }
    const limit = found ? best.t : end;
    // Static features, for the marbles that move.
    for (let i = 0; i < bodies.length; i += 1) {
      const b = defined(bodies[i], 'body');
      const track = defined(tracks[i], 'track');
      if (b.done || !track.moving) continue;
      const feats = this.featuresFor(b);
      if (feats.length === 0) continue;
      const hit = staticContact(world, b, track, feats, now, limit, this.hit);
      if (hit.feature !== null && hit.t <= limit) {
        found = offer(best, found, hit.t, RANK_STATIC, b, null, hit.feature, null);
      }
    }
    // Marble pairs, through the prompt's sort-and-sweep broadphase: the trials' boxes in order of
    // their lower x, ties broken by id. A pair is searched when its boxes overlap and one of its
    // marbles moves, always the lower index first; the earliest event does not depend on order.
    const order = this.sweepOrder();
    for (let oi = 0; oi < order.length; oi += 1) {
      const i = defined(order[oi], 'order');
      const bi = defined(this.boxes[i], 'box');
      for (let oj = oi + 1; oj < order.length; oj += 1) {
        const j = defined(order[oj], 'order');
        const bj = defined(this.boxes[j], 'box');
        if (bj.xMin > bi.xMax) break;
        if (bj.yMin > bi.yMax || bi.yMin > bj.yMax || bj.zMin > bi.zMax || bi.zMin > bj.zMax) {
          continue;
        }
        const lo = Math.min(i, j);
        const hi = Math.max(i, j);
        const ta = defined(tracks[lo], 'track');
        const tb = defined(tracks[hi], 'track');
        if (!ta.moving && !tb.moving) continue;
        const A = defined(bodies[lo], 'body');
        const B = defined(bodies[hi], 'body');
        if (this.holds.length > 0 && this.heldPair(A, B)) continue;
        const t = pairContact(world, A, ta, B, tb, now, limit);
        if (t <= limit) {
          const first = A.id < B.id ? A : B;
          const second = A.id < B.id ? B : A;
          found = offer(best, found, t, RANK_PAIR, first, second, null, null);
        }
      }
    }
    return found ? best : null;
  }

  private readonly best: Next;
  /** The live marbles' indices in broadphase order, kept between searches (nearly sorted). */
  private readonly order: number[];
  private readonly movedThisStep: boolean[] = [];
  private readonly slots = new Map<Body, number>();

  /**
   * The live marbles in broadphase order: by the box's lower x, then by id, a strict total order.
   * The last search's order is nearly sorted, so an insertion sort brings it up to date cheaply,
   * and any correct sort gives the same order.
   */
  private sweepOrder(): number[] {
    const { order, bodies } = this;
    let live = 0;
    for (const i of order) {
      if (!defined(bodies[i], 'body').done) {
        order[live] = i;
        live += 1;
      }
    }
    // Setting an array's length is slow in V8 even when it doesn't change, so only when it does.
    if (order.length !== live) order.length = live;
    for (let k = 1; k < live; k += 1) {
      const i = defined(order[k], 'order');
      let m = k - 1;
      while (m >= 0 && this.byBox(defined(order[m], 'order'), i) > 0) {
        order[m + 1] = defined(order[m], 'order');
        m -= 1;
      }
      order[m + 1] = i;
    }
    return order;
  }

  /** Broadphase order: by the box's lower x, then by id. */
  private byBox(i: number, j: number): number {
    const d = defined(this.boxes[i], 'box').xMin - defined(this.boxes[j], 'box').xMin;
    return d !== 0 ? d : defined(this.bodies[i], 'body').id - defined(this.bodies[j], 'body').id;
  }
  /** Every marble on its own: the groups whenever nothing is held. */
  private readonly singletons: Group[];
  /** The groups while the holds stay as they are (null once they change). */
  private grouped: Group[] | null = null;

  /** The box around a marble's whole trial (its curves' bounds grown by its radius). */
  private boxOf(b: Body): void {
    const i = defined(this.slots.get(b), 'slot');
    const track = defined(this.tracks[i], 'track');
    const box = defined(this.boxes[i], 'box');
    box.xMin = Infinity;
    box.xMax = -Infinity;
    box.yMin = Infinity;
    box.yMax = -Infinity;
    box.zMin = Infinity;
    box.zMax = -Infinity;
    for (let p = 0; p < track.count; p += 1) extendBox(defined(track.pieces[p], 'piece'), box);
    box.xMin -= b.r;
    box.xMax += b.r;
    box.yMin -= b.r;
    box.yMax += b.r;
    box.zMin -= b.r;
    box.zMax += b.r;
  }

  /** Marbles joined by holds advance together; every other marble is a group of its own. */
  private groups(): Group[] {
    const { bodies, tracks, holds } = this;
    if (holds.length === 0) return this.singletons;
    if (this.grouped !== null) return this.grouped;
    const parent = bodies.map((_, i) => i);
    const root = (i: number): number => {
      let r = i;
      while (defined(parent[r], 'group parent') !== r) r = defined(parent[r], 'group parent');
      return r;
    };
    for (const h of holds) {
      if (h.b === null) continue;
      const ra = root(bodies.indexOf(h.a));
      const rb = root(bodies.indexOf(h.b));
      if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
    }
    const out: Group[] = [];
    const at = new Map<number, number>();
    bodies.forEach((b, i) => {
      const r = root(i);
      let g = at.get(r);
      if (g === undefined) {
        g = out.length;
        at.set(r, g);
        out.push({ bodies: [], tracks: [], holds: [] });
      }
      const group = defined(out[g], 'group');
      group.bodies.push(b);
      group.tracks.push(defined(tracks[i], 'track'));
    });
    for (const h of holds) {
      const g = defined(at.get(root(bodies.indexOf(h.a))), 'hold group');
      defined(out[g], 'group').holds.push(h);
    }
    // Holds change only at events, whose marbles are committed to now: a group never mixes a
    // fresh trial with a committed state.
    for (const g of out) {
      const lead = defined(g.tracks[0], 'track');
      if (g.tracks.some((tr) => tr.fresh !== lead.fresh || tr.start !== lead.start)) {
        throw new PhysicsError('internal', 'a hold joined marbles at different times');
      }
    }
    this.grouped = out;
    return out;
  }

  /** The holds changed: regroup at the next search. */
  private regroup(): void {
    this.grouped = null;
  }

  private heldPair(a: Body, b: Body): boolean {
    return this.holds.some((h) => (h.a === a && h.b === b) || (h.a === b && h.b === a));
  }

  /** The static features a marble can strike, given what supports and holds it. */
  private featuresFor(b: Body): readonly StaticFeature[] {
    const base = this.supportFeatures(b.support);
    if (this.holds.length === 0) return base;
    const held = this.holds.filter((h) => h.a === b && h.feature !== null).map((h) => h.feature);
    return held.length === 0 ? base : base.filter((f) => !held.includes(f));
  }

  private readonly featureCache = new Map<string, readonly StaticFeature[]>();
  private lastSupport: Support | null = null;
  private lastFeatures: readonly StaticFeature[] = [];

  /** The features a marble on this support could strike (cached per support). */
  private supportFeatures(sup: Support | null): readonly StaticFeature[] {
    const all = this.world.features;
    if (sup === null) return all;
    // Most marbles share one support object (the base), so the last answer usually holds.
    if (sup === this.lastSupport) return this.lastFeatures;
    const list = this.featuresOn(sup, all);
    this.lastSupport = sup;
    this.lastFeatures = list;
    return list;
  }

  private featuresOn(sup: Support, all: readonly StaticFeature[]): readonly StaticFeature[] {
    const block =
      sup.kind === 'edge'
        ? sup.edge.block
        : sup.kind === 'corner'
          ? sup.corner.block
          : sup.kind === 'top'
            ? sup.block.index
            : -1;
    const key = `${sup.kind}:${String(block)}`;
    const cached = this.featureCache.get(key);
    if (cached !== undefined) return cached;
    let list: readonly StaticFeature[];
    switch (sup.kind) {
      case 'base':
        list = all.filter(
          (f) => f.kind === 'wall' || f.kind === 'top' || f.kind === 'edge' || f.kind === 'corner',
        );
        break;
      case 'top':
      case 'rim':
        list = all.filter((f) => f.kind === 'wall');
        break;
      case 'floor':
        list = all.filter((f) => f.kind === 'pit-wall');
        break;
      case 'edge':
      case 'corner':
        list = all.filter(
          (f) =>
            f.kind === 'wall' ||
            f.kind === 'base' ||
            ((f.kind === 'edge' || f.kind === 'corner' || f.kind === 'top') &&
              (f.kind === 'edge'
                ? f.edge.block
                : f.kind === 'corner'
                  ? f.corner.block
                  : f.block.index) !== block),
        );
        break;
    }
    this.featureCache.set(key, list);
    return list;
  }

  // -------------------------------------------------------------------------------------------
  // Committing time

  /**
   * Commit every group still on its trial to now (the grid line, or a forced stop). A constant
   * trial (nothing in the group moves) stays fresh.
   */
  private commitEveryone(): void {
    for (const group of this.groups()) {
      const lead = defined(group.tracks[0], 'track');
      if (!lead.fresh) continue;
      let moving = false;
      for (const tr of group.tracks) if (tr.moving) moving = true;
      if (moving) this.commitGroupTo(group, this.tau);
    }
  }

  /** Commit the groups an event involves to its time; they make a new trial from there. */
  private commitInvolved(next: Next): void {
    for (const group of this.groups()) {
      if (group.bodies.includes(next.a) || (next.b !== null && group.bodies.includes(next.b))) {
        this.commitGroupTo(group, next.t);
      }
    }
  }

  private commitGroupTo(group: Group, t: number): void {
    commitGroup(this.world, group.bodies, group.tracks, group.holds, t);
    for (let i = 0; i < group.bodies.length; i += 1) {
      const b = defined(group.bodies[i], 'body');
      const track = defined(group.tracks[i], 'track');
      if (track.moving) copyKinematics(b, track.end);
      track.start = t;
      track.fresh = false;
    }
  }

  /** A marble left spinning with no spin (it ran out inside a span) is at rest. */
  private tidySpin(b: Body): void {
    if (b.motion === 'spinning' && b.s.wz === 0) {
      b.motion = 'resting';
      this.emit('spin-rest', b);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Resolving events

  private apply(next: Next): void {
    // A contact is resolved from the committed (re-integrated) states. The trial curves it was
    // found on can be off by a hair where forces are not smooth (a held contact letting go), so
    // a contact whose surfaces are in fact apart is not one; the search resumes from here.
    if (next.internal === null && this.apart(next)) {
      this.world.metrics.staleContacts += 1;
      return;
    }
    const quiet = next.internal !== null && SILENT.has(next.internal.code);
    if (!quiet) {
      this.keyframe(next.a);
      if (next.b !== null) this.keyframe(next.b);
    }
    if (next.internal !== null) this.transition(next.a, next.internal);
    else this.impact(next.a, next.b, next.feature);
    if (!quiet) {
      this.keyframe(next.a);
      if (next.b !== null) this.keyframe(next.b);
    }
  }

  private transition(b: Body, ev: InternalEvent): void {
    const s = b.s;
    const world = this.world;
    const court = world.court;
    switch (ev.code) {
      case PROBE.slideStop:
      case PROBE.slaveStop:
      case PROBE.rollStop:
      case PROBE.stopReached:
      case PROBE.substepCap: {
        const was = b.motion;
        this.settle(b, true);
        if (was === 'sliding' && b.motion !== 'sliding') this.emit('slide-roll', b);
        else if (was === 'rolling' && b.motion !== 'rolling') this.emit('roll-rest', b);
        return;
      }
      case PROBE.spinStop: {
        s.wz = 0;
        if (b.motion === 'spinning') {
          b.motion = 'resting';
          this.emit('spin-rest', b);
        }
        return;
      }
      case PROBE.segUp:
      case PROBE.segDown:
        world.metrics.tableCrossings += 1;
        b.rollSeg += ev.code === PROBE.segUp ? 1 : -1;
        return;
      case PROBE.cellXLo:
        b.cellI -= 1;
        world.metrics.cellCrossings += 1;
        return;
      case PROBE.cellXHi:
        b.cellI += 1;
        world.metrics.cellCrossings += 1;
        return;
      case PROBE.cellYLo:
        b.cellJ -= 1;
        world.metrics.cellCrossings += 1;
        return;
      case PROBE.cellYHi:
        b.cellJ += 1;
        world.metrics.cellCrossings += 1;
        return;
      case PROBE.outXMin:
      case PROBE.outXMax:
      case PROBE.outYMin:
      case PROBE.outYMax:
        this.retire(b, 'out');
        return;
      case PROBE.holeEnter:
        b.support = RIM;
        this.alongSupport(b);
        this.emit('hole-enter', b);
        return;
      case PROBE.topLeave: {
        const sup = expectKind(b.support, 'top', 'support');
        b.support = { kind: 'edge', edge: defined(sup.block.edges[ev.arg], 'edge') };
        this.alongSupport(b);
        this.emit('support', b);
        return;
      }
      case PROBE.rimOut:
        b.support = BASE;
        locateCell(world, b);
        this.toPlane(b);
        this.emit('hole-leave', b);
        return;
      case PROBE.edgeA:
      case PROBE.edgeB: {
        const sup = expectKind(b.support, 'edge', 'support');
        const block = defined(court.blocks[sup.edge.block], 'block');
        const k = block.edges.indexOf(sup.edge);
        const n = block.edges.length;
        const corner = defined(block.corners[ev.code === PROBE.edgeA ? k : (k + 1) % n], 'corner');
        b.support = { kind: 'corner', corner };
        this.alongSupport(b);
        this.emit('support', b);
        return;
      }
      case PROBE.edgeTop: {
        const sup = expectKind(b.support, 'edge', 'support');
        b.support = { kind: 'top', block: defined(court.blocks[sup.edge.block], 'block') };
        this.toPlane(b);
        this.emit('support', b);
        return;
      }
      case PROBE.corner1:
      case PROBE.corner2: {
        const sup = expectKind(b.support, 'corner', 'support');
        const block = defined(court.blocks[sup.corner.block], 'block');
        const k = block.corners.indexOf(sup.corner);
        const n = block.edges.length;
        const edge = defined(block.edges[ev.code === PROBE.corner1 ? (k + n - 1) % n : k], 'edge');
        b.support = { kind: 'edge', edge };
        this.alongSupport(b);
        this.emit('support', b);
        return;
      }
      case PROBE.rimDown:
      case PROBE.edgeDown:
      case PROBE.cornerDown:
      case PROBE.takeOff:
        b.support = null;
        b.motion = 'airborne';
        this.emit('take-off', b);
        return;
      case PROBE.release: {
        const h = defined(ev.hold, 'released hold');
        this.holds.splice(this.holds.indexOf(h), 1);
        this.regroup();
        return;
      }
      case PROBE.rollSlip:
        b.motion = 'sliding';
        this.emit('roll-slide', b);
        return;
      default:
        throw new PhysicsError('internal', `event code ${String(ev.code)}`);
    }
  }

  /** Whether the surfaces of a contact event are more than CONTACT_SLACK apart now. */
  private apart(next: Next): boolean {
    const a = next.a;
    if (next.b !== null) {
      const b = next.b;
      const dx = a.s.x - b.s.x;
      const dy = a.s.y - b.s.y;
      const dz = a.s.z - b.s.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) - a.r - b.r > CONTACT_SLACK;
    }
    const f = defined(next.feature, 'feature');
    const g = featureGap(this.world.court, f, a.r, a.s.x, a.s.y, a.s.z, newGap());
    return !g.valid || g.gap > CONTACT_SLACK;
  }

  /**
   * At a hand-over between supports the velocity must lie in the new support's tangent plane:
   * the constraint keeps v·n at zero only if it starts there, and the normal force does work on
   * any v·n it inherits. The hand-over is smooth, so what is removed is rounding-sized; it is
   * booked as impact loss.
   */
  private alongSupport(b: Body): void {
    const sup = b.support;
    if (sup === null) return;
    const n = this.supportNormal(b, sup);
    const vn = b.s.vx * n.x + b.s.vy * n.y + b.s.vz * n.z;
    if (vn !== 0) this.removeNormal(b, n.x, n.y, n.z);
  }

  /** On a plane the centre sits at ground level + r and the vertical velocity is not modelled. */
  private toPlane(b: Body): void {
    const s = b.s;
    const g = this.world.params.g;
    const before = kineticEnergy(b) + potentialEnergy(b, g);
    s.z = supportLevel(this.world, b, s.x, s.y) + b.r;
    s.vz = 0;
    // The snap is at most a rounding-sized move; its energy is booked so the ledger stays exact.
    this.impactLoss += before - kineticEnergy(b) - potentialEnergy(b, g);
  }

  private impact(a: Body, other: Body | null, feature: StaticFeature | null): void {
    const world = this.world;
    const params = world.params;
    let nx: number;
    let ny: number;
    let nz: number;
    let pair = params.glass;
    if (other !== null) {
      const dx = a.s.x - other.s.x;
      const dy = a.s.y - other.s.y;
      const dz = a.s.z - other.s.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      nx = dx / d;
      ny = dy / d;
      nz = dz / d;
    } else {
      const f = defined(feature, 'feature');
      const fg = featureGap(world.court, f, a.r, a.s.x, a.s.y, a.s.z, newGap());
      if (!fg.valid) throw new PhysicsError('internal', 'impact with an invalid feature');
      nx = fg.nx;
      ny = fg.ny;
      nz = fg.nz;
      pair = this.pairFor(f);
    }
    const sideA = this.side(a);
    const sideB = other === null ? null : this.side(other);
    // Approach speed sets the coefficients; below vRest the contact is perfectly inelastic.
    const approach = approachSpeed(a, other, nx, ny, nz);
    const e = approach < params.thresholds.vRest ? 0 : tableValue(pair.e, approach);
    const mu = tableValue(pair.mu, approach);
    const out = resolveImpact(
      {
        a: sideA,
        b: sideB,
        nx,
        ny,
        nz,
        e,
        mu,
        steps: params.solver.impactSteps,
        maxSteps: params.solver.impactMaxSteps,
      },
      newImpactOutput(),
    );
    const metrics = world.metrics;
    metrics.impacts += 1;
    metrics.impactSteps = Math.max(metrics.impactSteps, out.stepsTaken);
    if (out.capped) metrics.impactCapHits += 1;
    this.impactLoss += out.loss;
    a.wear += out.impulse;
    if (other !== null) other.wear += out.impulse;
    this.events.push({
      kind: 'impact',
      t: this.now(),
      a: a.id,
      b: other === null ? null : other.id,
      feature: feature === null ? null : feature.kind,
      impulse: out.impulse,
      speed: out.approach,
      x: a.s.x - a.r * nx,
      y: a.s.y - a.r * ny,
      z: a.s.z - a.r * nz,
      nx,
      ny,
      nz,
      loss: out.loss,
    });
    this.afterImpact(a, feature, nx, ny, nz);
    if (other !== null) this.afterImpact(other, null, -nx, -ny, -nz);
    this.relaxContacts(other === null ? [a] : [a, other]);
    // A contact slower than vRest is held from now on, if it is pressed (finding 8).
    if (approach < params.thresholds.vRest && !a.done && (other === null || !other.done)) {
      if (other !== null && !this.heldPair(a, other)) {
        this.hold({ a, b: other, feature: null });
      } else if (feature !== null && canHold(feature)) {
        this.hold({ a, b: null, feature });
      }
    }
  }

  private hold(h: Hold): void {
    // The component of held marbles the new hold joins, and its holds.
    const bodies = new Set<Body>(h.b === null ? [h.a] : [h.a, h.b]);
    for (let grew = true; grew;) {
      grew = false;
      for (const x of this.holds) {
        if (x.b === null || bodies.has(x.a) === bodies.has(x.b)) continue;
        bodies.add(x.a);
        bodies.add(x.b);
        grew = true;
      }
    }
    const list = [...bodies].sort((p, q) => p.id - q.id);
    const holds = this.holds.filter((x) => bodies.has(x.a));
    if (holdNeedNow(this.world, h, list, holds) > 0) {
      this.holds.push(h);
      this.regroup();
    }
  }

  /**
   * After an impact, the involved marbles' contacts are relaxed together: held contacts that now
   * separate faster than vRest are released, and every held or touching contact that now closes
   * is stopped inelastically by projected Gauss–Seidel sweeps. Resolving them one at a time would
   * let a chain (a wall, a marble, a marble pressed against it) hand the closing back and forth
   * forever at the same instant.
   */
  private relaxContacts(seeds: readonly Body[]): void {
    const world = this.world;
    const vRest = world.params.thresholds.vRest;
    const bodies = new Set<Body>(seeds);
    // Marbles joined by holds move as one.
    for (let grew = true; grew;) {
      grew = false;
      for (const h of this.holds) {
        if (h.b === null) continue;
        if (bodies.has(h.a) !== bodies.has(h.b)) {
          bodies.add(h.a);
          bodies.add(h.b);
          grew = true;
        }
      }
    }
    for (let i = this.holds.length - 1; i >= 0; i -= 1) {
      const h = defined(this.holds[i], 'hold');
      if (!bodies.has(h.a) || this.closing(h) <= vRest) continue;
      this.holds.splice(i, 1);
      this.regroup();
    }
    const constraints: Hold[] = this.holds.filter((h) => bodies.has(h.a));
    // Touching marbles (the pair just resolved among them) block closing too.
    const list = [...bodies].sort((x, y) => x.id - y.id);
    list.forEach((p, i) => {
      for (const q of list.slice(i + 1)) {
        if (p.done || q.done || this.heldPair(p, q)) continue;
        const dx = p.s.x - q.s.x;
        const dy = p.s.y - q.s.y;
        const dz = p.s.z - q.s.z;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) - p.r - q.r <= TOUCH) {
          constraints.push({ a: p, b: q, feature: null });
        }
      }
    });
    // Holdable features a marble is touching but not held against also block closing.
    const fg = newGap();
    for (const b of bodies) {
      if (b.done) continue;
      for (const f of world.features) {
        if (!canHold(f) || constraints.some((h) => h.a === b && h.feature === f)) continue;
        const g = featureGap(world.court, f, b.r, b.s.x, b.s.y, b.s.z, fg);
        if (g.valid && g.gap <= TOUCH) constraints.push({ a: b, b: null, feature: f });
      }
    }
    if (constraints.length === 0) {
      for (const b of bodies) this.settle(b);
      return;
    }
    let before = 0;
    for (const b of bodies) before += kineticEnergy(b);
    // Settling can bring a marble to rest and leave its partner closing on it again, so settle
    // and stop closing in turn until nothing closes (resting marbles count as fixed).
    for (let pass = 0; pass < RELAX_PASSES; pass += 1) {
      this.stopClosing(constraints, bodies);
      for (const b of bodies) this.settleMotion(b, false);
      if (!constraints.some((h) => this.closing(h) > 0)) break;
    }
    let after = 0;
    for (const b of bodies) after += kineticEnergy(b);
    this.impactLoss += before - after;
    for (const b of bodies) this.settle(b);
  }

  /**
   * Stop every closing contact inelastically: find impulses λ ≥ 0 along the contact normals with
   * every contact left non-closing and λ = 0 wherever a contact opens (a small linear
   * complementarity problem). The Delassus matrix A (closing change per unit impulse) is measured
   * by applying unit impulses. Up to MAX_EXACT contacts the active sets are tried in a fixed
   * order and solved exactly; Gauss–Seidel sweeps (which converge slowly when two contacts
   * squeeze a marble from opposite sides) handle anything larger.
   */
  private stopClosing(constraints: readonly Hold[], bodies: ReadonlySet<Body>): void {
    const n = constraints.length;
    const geos = constraints.map((h) => this.geometry(h, newHoldGeo()));
    const closingAll = (): number[] =>
      constraints.map((h, i) =>
        defined(geos[i], 'geo').valid ? this.closing(h, defined(geos[i], 'geo')) : 0,
      );
    const snapshot = [...bodies].map((b) => ({ b, vx: b.s.vx, vy: b.s.vy, vz: b.s.vz }));
    const restore = (): void => {
      for (const v of snapshot) {
        v.b.s.vx = v.vx;
        v.b.s.vy = v.vy;
        v.b.s.vz = v.vz;
      }
    };
    const apply = (i: number, j: number): void => {
      const h = defined(constraints[i], 'constraint');
      const geo = defined(geos[i], 'geo');
      if (!geo.valid) return;
      this.pushAlong(h.a, j, geo);
      if (h.b !== null) this.pushAlong(h.b, -j, geo);
    };
    const c0 = closingAll();
    if (c0.every((c) => !(c > 0))) return;
    if (n <= MAX_EXACT) {
      // A[i][j]: how much a unit impulse at contact j reduces the closing at contact i.
      const a = constraints.map(() => new Array<number>(n).fill(0));
      for (let j = 0; j < n; j += 1) {
        apply(j, 1);
        const c1 = closingAll();
        restore();
        for (let i = 0; i < n; i += 1) {
          defined(a[i], 'row')[j] = defined(c0[i], 'c0') - defined(c1[i], 'c1');
        }
      }
      // w = −closing after = −c0 + A·λ ≥ 0.
      const lambda = solveLcp(
        a,
        c0.map((c) => -c),
        1e-15,
      );
      if (lambda !== null) {
        lambda.forEach((l, i) => {
          if (l > 0) apply(i, l);
        });
        return;
      }
    }
    for (let sweep = 0; sweep < RELAX_SWEEPS; sweep += 1) {
      let worst = 0;
      constraints.forEach((h, i) => {
        const geo = defined(geos[i], 'geo');
        if (!geo.valid) return;
        const closing = this.closing(h, geo);
        if (!(closing > 0)) return;
        const ia = this.inverseMassAlong(h.a, geo);
        const ib = h.b === null ? 0 : this.inverseMassAlong(h.b, geo);
        if (ia + ib === 0) return;
        worst = Math.max(worst, closing);
        apply(i, closing / (ia + ib));
      });
      if (worst === 0) break;
    }
  }

  /** Hold geometry from the marbles' true kinematics (a plane marble moves vertically by ∇h·v). */
  private geometry(h: Hold, geo: HoldGeo): HoldGeo {
    return holdGeometry(
      this.world,
      h,
      this.trueState(h.a, trueA),
      h.b === null ? null : this.trueState(h.b, trueB),
      geo,
    );
  }

  private trueState(b: Body, out: Dyn): Dyn {
    copyDyn(out, b.s);
    const g = this.gradient(b);
    if (g !== null) out.vz = g.x * b.s.vx + g.y * b.s.vy;
    return out;
  }

  /** ∇h under a marble on a plane (0 on flat planes), or null when it isn't on one. */
  private gradient(b: Body): { x: number; y: number } | null {
    const sup = b.support;
    if (sup === null || !isPlane(sup)) return null;
    const a = slopeAt(this.world, b, b.s.x, b.s.y);
    const g = this.world.params.g;
    return { x: -a.x / g, y: -a.y / g };
  }

  /** How fast a marble's centre moves along n per unit impulse along n (1/kg). */
  private inverseMassAlong(b: Body, n: HoldGeo): number {
    if (b.done || b.motion === 'resting' || b.motion === 'spinning') return 0;
    const g = this.gradient(b);
    if (g === null) return 1 / b.m;
    // On a plane an impulse acts through its generalised part n_h + n_z·∇h (see holds.ts).
    const qx = n.nx + n.nz * g.x;
    const qy = n.ny + n.nz * g.y;
    return (qx * qx + qy * qy) / b.m;
  }

  private pushAlong(b: Body, j: number, n: HoldGeo): void {
    if (b.done || b.motion === 'resting' || b.motion === 'spinning') return;
    const g = this.gradient(b);
    if (g === null) {
      b.s.vx += (j * n.nx) / b.m;
      b.s.vy += (j * n.ny) / b.m;
      b.s.vz += (j * n.nz) / b.m;
      return;
    }
    b.s.vx += (j * (n.nx + n.nz * g.x)) / b.m;
    b.s.vy += (j * (n.ny + n.nz * g.y)) / b.m;
  }

  /** Closing speed of a hold or contact: positive when the gap is shrinking (m/s). */
  private closing(h: Hold, geo: HoldGeo = this.geometry(h, newHoldGeo())): number {
    const ta = this.trueState(h.a, trueA);
    let vn = ta.vx * geo.nx + ta.vy * geo.ny + ta.vz * geo.nz;
    if (h.b !== null) {
      const tb = this.trueState(h.b, trueB);
      vn -= tb.vx * geo.nx + tb.vy * geo.ny + tb.vz * geo.nz;
    }
    return -vn;
  }

  private pairFor(f: StaticFeature): ContactPair {
    const params = this.world.params;
    switch (f.kind) {
      case 'wall':
        return params.wall;
      case 'edge':
      case 'corner':
      case 'rim':
        return params.edge;
      default:
        return this.groundPair;
    }
  }

  private side(b: Body): ImpactSide {
    const sup = b.support;
    let normal: { nx: number; ny: number; nz: number } | null = null;
    if (sup !== null) {
      if (isPlane(sup)) normal = { nx: 0, ny: 0, nz: 1 };
      else {
        const gm = curvedGeometry(this.ctxFor(b), b.s, newGeo());
        normal = { nx: gm.nx, ny: gm.ny, nz: gm.nz };
      }
    }
    return { body: b, s: b.s, support: normal, supportMu: this.world.surface.muS };
  }

  /** A context with the marble's physical constants and support, for geometry and forces. */
  private ctxFor(b: Body): Ctx {
    const ctx = newCtx();
    ctx.support = b.support;
    ctx.hole = this.world.court.hole;
    ctx.r = b.r;
    ctx.m = b.m;
    ctx.inertia = b.inertia;
    ctx.dragK = b.dragK;
    ctx.g = this.world.params.g;
    ctx.muS = this.world.surface.muS;
    return ctx;
  }

  /** After an impact: lift off a support that the marble now leaves, or land on the feature. */
  private afterImpact(
    b: Body,
    feature: StaticFeature | null,
    nx: number,
    ny: number,
    nz: number,
  ): void {
    const vHop = this.world.params.thresholds.vHop;
    const s = b.s;
    const sup = b.support;
    let left = false;
    if (sup !== null) {
      const n = this.supportNormal(b, sup);
      const vn = s.vx * n.x + s.vy * n.y + s.vz * n.z;
      if (vn > vHop) {
        b.support = null;
        b.motion = 'airborne';
        left = true;
      } else if (vn !== 0) {
        this.removeNormal(b, n.x, n.y, n.z);
      }
    }
    if (feature !== null && canSupport(feature)) {
      if (b.support === null) {
        const sn = s.vx * nx + s.vy * ny + s.vz * nz;
        if (sn <= vHop) {
          b.support = toSupport(feature);
          if (b.support.kind === 'base') locateCell(this.world, b);
          this.removeNormal(b, nx, ny, nz);
          if (isPlane(b.support)) this.toPlane(b);
          // Straight from one support to another (onto an edge, say) is a hand-over, not a flight.
          if (left) this.emit('support', b);
          left = false;
        }
      } else {
        this.removeSeparation(b, nx, ny, nz, vHop);
      }
    }
    if (left) this.emit('take-off', b);
    this.settle(b);
  }

  private supportNormal(b: Body, sup: Support): { x: number; y: number; z: number } {
    if (isPlane(sup)) return { x: 0, y: 0, z: 1 };
    const gm = curvedGeometry(this.ctxFor(b), b.s, newGeo());
    return { x: gm.nx, y: gm.ny, z: gm.nz };
  }

  /**
   * A supported marble separating from a feature slower than vHop stays against it: the
   * separation is removed. On a plane the marble's vertical velocity is not modelled (it follows
   * the ground), so the separation is the plane's part of the normal speed, v_h·(n_h + n_z·∇h),
   * and it is removed along that direction, never through a vertical velocity the next substep
   * would drop unbooked.
   */
  private removeSeparation(b: Body, nx: number, ny: number, nz: number, vHop: number): void {
    const s = b.s;
    const g = this.gradient(b);
    if (g === null) {
      const sn = s.vx * nx + s.vy * ny + s.vz * nz;
      if (sn > 0 && sn <= vHop) this.removeNormal(b, nx, ny, nz);
      return;
    }
    const qx = nx + nz * g.x;
    const qy = ny + nz * g.y;
    const q = Math.sqrt(qx * qx + qy * qy);
    const sn = s.vx * qx + s.vy * qy;
    if (q === 0 || !(sn > 0 && sn <= vHop)) return;
    this.removeNormal(b, qx / q, qy / q, 0);
  }

  /** Remove the velocity component along n (a tiny separation), booking the energy as impact loss. */
  private removeNormal(b: Body, nx: number, ny: number, nz: number): void {
    const s = b.s;
    const before = kineticEnergy(b);
    const vn = s.vx * nx + s.vy * ny + s.vz * nz;
    s.vx -= vn * nx;
    s.vy -= vn * ny;
    s.vz -= vn * nz;
    this.impactLoss += before - kineticEnergy(b);
  }

  // -------------------------------------------------------------------------------------------
  // Motion states

  /**
   * Make the motion state agree with the kinematics. With `stop`, the marble reached a Coulomb
   * stop (or the substep cap): its residual slip, or for a rolling marble its residual speed, is
   * removed by the exact friction impulse, and the energy is booked to the ledger.
   */
  settle(b: Body, stop = false): void {
    this.settleMotion(b, stop);
    if (!this.projecting && this.holds.some((h) => h.a === b || h.b === b)) {
      this.projecting = true;
      try {
        this.projectHolds(b);
      } finally {
        this.projecting = false;
      }
    }
  }

  private projecting = false;

  /**
   * A discrete change to a held marble's velocity (a stop, a rest, a finishing impulse) must not
   * leave its holds closing: holds keep the gap's acceleration at zero, not its rate. The closing
   * is removed inelastically; a resting partner counts as fixed, as it does in the derivative.
   */
  private projectHolds(seed: Body): void {
    const bodies = new Set<Body>([seed]);
    for (let grew = true; grew;) {
      grew = false;
      for (const h of this.holds) {
        if (h.b === null || bodies.has(h.a) === bodies.has(h.b)) continue;
        bodies.add(h.a);
        bodies.add(h.b);
        grew = true;
      }
    }
    const constraints = this.holds.filter((h) => bodies.has(h.a));
    let before = 0;
    for (const b of bodies) before += kineticEnergy(b);
    this.stopClosing(constraints, bodies);
    let after = 0;
    for (const b of bodies) after += kineticEnergy(b);
    this.impactLoss += before - after;
    for (const b of bodies) this.settleMotion(b, false);
  }

  private settleMotion(b: Body, stop: boolean): void {
    if (b.done) return;
    const sup = b.support;
    if (sup === null) {
      b.motion = 'airborne';
      return;
    }
    const s = b.s;
    const world = this.world;
    const th = world.params.thresholds;
    const n = this.supportNormal(b, sup);
    // Tangential slip at the contact point −r·n.
    let ux = s.vx - b.r * (s.wy * n.z - s.wz * n.y);
    let uy = s.vy - b.r * (s.wz * n.x - s.wx * n.z);
    let uz = s.vz - b.r * (s.wx * n.y - s.wy * n.x);
    const un = ux * n.x + uy * n.y + uz * n.z;
    ux -= un * n.x;
    uy -= un * n.y;
    uz -= un * n.z;
    const u2 = ux * ux + uy * uy + uz * uz;
    const forcedSlide = stop && b.motion === 'sliding';
    if (u2 >= th.uStop * th.uStop && !forcedSlide) {
      b.motion = 'sliding';
      return;
    }
    if (u2 > 0) {
      // The friction impulse that ends the slip: P = −(2/7)·m·u at the contact point.
      const before = kineticEnergy(b);
      const k = -(2 / 7) * b.m;
      applyContactImpulse(b, -b.r * n.x, -b.r * n.y, -b.r * n.z, k * ux, k * uy, k * uz);
      s.eSlide += before - kineticEnergy(b);
    }
    const speed2 = s.vx * s.vx + s.vy * s.vy + s.vz * s.vz;
    const forcedRoll = stop && b.motion === 'rolling';
    if (!isPlane(sup) && speed2 >= th.vStop * th.vStop && !forcedRoll) {
      // On a curved support rolling needs friction; if the support cannot grip that hard, the
      // slip passes through zero and keeps sliding (a margin keeps the choice from chattering).
      const ctx = this.ctxFor(b);
      const need = rollingFrictionNeeded(ctx, s);
      if (need >= ctx.muS * supportNormalForce(ctx, s) * (1 - 1e-9)) {
        b.motion = 'sliding';
        return;
      }
    }
    if (speed2 >= th.vStop * th.vStop && !forcedRoll) {
      b.motion = 'rolling';
      b.rollSeg = segmentAt(world.surface.muR, Math.sqrt(speed2)).index;
      return;
    }
    // At rest: no translation and no rolling spin. On a plane the spin about the vertical stays.
    const before = kineticEnergy(b);
    const plane = isPlane(sup);
    s.vx = 0;
    s.vy = 0;
    s.vz = 0;
    s.wx = 0;
    s.wy = 0;
    if (!plane) s.wz = 0;
    s.eRoll += before - kineticEnergy(b);
    b.rollSeg = segmentAt(world.surface.muR, 0).index;
    if (this.steep(b, sup)) {
      b.motion = 'rolling';
      this.emit('roll-start', b);
      return;
    }
    b.motion = s.wz !== 0 ? 'spinning' : 'resting';
  }

  /** Whether a marble at rest on its support starts rolling: (5/7)·|a_t| > muR(0)·N/m. */
  private steep(b: Body, sup: Support): boolean {
    const muR0 = tableValue(this.world.surface.muR, 0);
    const g = this.world.params.g;
    let ax: number;
    let ay: number;
    let az: number;
    let limit: number;
    if (isPlane(sup)) {
      const a = slopeAt(this.world, b, b.s.x, b.s.y);
      ax = a.x;
      ay = a.y;
      az = 0;
      limit = muR0 * g;
    } else {
      // Tangential gravity on the curved support.
      const n = this.supportNormal(b, sup);
      ax = g * n.z * n.x;
      ay = g * n.z * n.y;
      az = g * n.z * n.z - g;
      limit = muR0 * g * Math.max(0, n.z);
    }
    // Whatever the marble touches (held or not) takes the part of the push that drives the
    // marble into it: a marble pinned against a wall, an edge or another marble stays put.
    const normals = this.touchingNormals(b);
    for (let sweep = 0; sweep < 4; sweep += 1) {
      for (const n of normals) {
        const into = ax * n.x + ay * n.y + az * n.z;
        if (into < 0) {
          ax -= into * n.x;
          ay -= into * n.y;
          az -= into * n.z;
        }
      }
    }
    return (5 / 7) * Math.sqrt(ax * ax + ay * ay + az * az) > limit;
  }

  /** Unit normals (pointing at b) of the walls, edges, corners and marbles b is touching. */
  private touchingNormals(b: Body): { x: number; y: number; z: number }[] {
    const out: { x: number; y: number; z: number }[] = [];
    const fg = newGap();
    for (const f of this.world.features) {
      if (!canHold(f)) continue;
      const g = featureGap(this.world.court, f, b.r, b.s.x, b.s.y, b.s.z, fg);
      if (g.valid && g.gap <= TOUCH) out.push({ x: g.nx, y: g.ny, z: g.nz });
    }
    const p = { x: 0, y: 0, z: 0 };
    this.bodies.forEach((o, i) => {
      if (o === b || o.done) return;
      // A marble still on its trial is read where its trial has it now.
      const tr = defined(this.tracks[i], 'track');
      if (tr.fresh && tr.moving && tr.start < this.tau)
        positionAt(pieceAt(tr, this.tau), this.tau, p);
      else {
        p.x = o.s.x;
        p.y = o.s.y;
        p.z = o.s.z;
      }
      const dx = b.s.x - p.x;
      const dy = b.s.y - p.y;
      const dz = b.s.z - p.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d - b.r - o.r <= TOUCH) out.push({ x: dx / d, y: dy / d, z: dz / d });
    });
    return out;
  }

  private retire(b: Body, how: 'pocketed' | 'out'): void {
    const before = kineticEnergy(b);
    const s = b.s;
    s.vx = 0;
    s.vy = 0;
    s.vz = 0;
    s.wx = 0;
    s.wy = 0;
    s.wz = 0;
    this.removed += before;
    b.done = true;
    b.motion = how;
    b.support = null;
    this.dropHolds(b);
    this.emit(how, b);
    this.keyframe(b);
  }

  private dropHolds(b: Body): void {
    for (let i = this.holds.length - 1; i >= 0; i -= 1) {
      const h = defined(this.holds[i], 'hold');
      if (h.a === b || h.b === b) {
        this.holds.splice(i, 1);
        this.regroup();
      }
    }
  }

  /** A marble below ground level in the hole that can no longer climb out is pocketed. */
  private checkPockets(): void {
    const hole = this.world.court.hole;
    if (hole === undefined) return;
    const g = this.world.params.g;
    for (const b of this.bodies) {
      if (b.done) continue;
      const s = b.s;
      if (s.z >= hole.zTop || holeRadial(hole, s.x, s.y) >= hole.rc) continue;
      if (kineticEnergy(b) + b.m * g * s.z < b.m * g * (hole.zTop + b.r))
        this.retire(b, 'pocketed');
    }
  }

  private forceRest(): void {
    for (const b of this.bodies) {
      if (b.done || b.motion === 'resting') continue;
      const before = kineticEnergy(b);
      const s = b.s;
      s.vx = 0;
      s.vy = 0;
      s.vz = 0;
      s.wx = 0;
      s.wy = 0;
      s.wz = 0;
      this.forced += before;
      if (b.support !== null) b.motion = 'resting';
      this.keyframe(b);
    }
  }

  /**
   * Past the per-step event cap (a run of events that is not converging): the marbles of the
   * last event are stopped where they are, their kinetic energy booked as forced. Everything
   * else carries on.
   */
  private stepCapFallback(next: Next): void {
    for (const b of next.b === null ? [next.a] : [next.a, next.b]) {
      if (b.done) continue;
      const before = kineticEnergy(b);
      const s = b.s;
      s.vx = 0;
      s.vy = 0;
      s.vz = 0;
      s.wx = 0;
      s.wy = 0;
      s.wz = 0;
      this.forced += before;
      this.settle(b);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Output

  private emit(kind: TransitionKind, b: Body): void {
    this.events.push({ kind, t: this.now(), id: b.id, x: b.s.x, y: b.s.y, z: b.s.z });
  }

  private keyframe(b: Body): void {
    if (this.timelines === null) return;
    const tl = this.timelines.find((x) => x.id === b.id);
    if (tl === undefined) return;
    const s = b.s;
    tl.keyframes.push({
      t: this.now(),
      x: s.x,
      y: s.y,
      z: s.z,
      vx: s.vx,
      vy: s.vy,
      vz: s.vz,
      wx: s.wx,
      wy: s.wy,
      wz: s.wz,
      motion: b.motion,
    });
  }

  /** When the shot ended: its last event, or tMax if it had to be forced to rest (s). */
  duration(): number {
    if (this.world.metrics.forcedRest) return this.now();
    const last = this.events.at(-1);
    return last === undefined ? 0 : last.t;
  }

  finalStates(): MarbleState[] {
    return this.bodies.map((b) => ({
      id: b.id,
      size: b.size,
      x: b.s.x,
      y: b.s.y,
      z: b.s.z,
      vx: b.s.vx,
      vy: b.s.vy,
      vz: b.s.vz,
      wx: b.s.wx,
      wy: b.s.wy,
      wz: b.s.wz,
      motion: b.motion,
      wear: b.wear,
    }));
  }

  ledger(): EnergyLedger {
    const g = this.world.params.g;
    let ke = 0;
    let pe = 0;
    let slide = 0;
    let roll = 0;
    let spin = 0;
    let drag = 0;
    for (const b of this.bodies) {
      ke += kineticEnergy(b);
      pe += potentialEnergy(b, g);
      slide += b.s.eSlide;
      roll += b.s.eRoll;
      spin += b.s.eSpin;
      drag += b.s.eDrag;
    }
    const dissipated = slide + roll + spin + drag + this.impactLoss + this.removed + this.forced;
    return {
      initialKinetic: this.initialKinetic,
      initialPotential: this.initialPotential,
      finalKinetic: ke,
      finalPotential: pe,
      slide,
      roll,
      spin,
      drag,
      impact: this.impactLoss,
      removed: this.removed,
      forced: this.forced,
      residual: this.initialKinetic + this.initialPotential - ke - pe - dissipated,
    };
  }

  timeline(): MarbleTimeline[] | null {
    return this.timelines;
  }

  hash(): string {
    const h = new Fnv64();
    for (const b of this.bodies) {
      const s = b.s;
      h.addUint32(b.id);
      h.addFloat64(s.x).addFloat64(s.y).addFloat64(s.z);
      h.addFloat64(s.vx).addFloat64(s.vy).addFloat64(s.vz);
      h.addFloat64(s.wx).addFloat64(s.wy).addFloat64(s.wz);
      h.addUint32(MOTION_CODE[b.motion]);
    }
    h.addUint32(this.events.length);
    return h.digest();
  }

  metricsOut(): ShotMetrics {
    const m = this.world.metrics;
    return {
      steps: m.steps,
      substeps: m.substeps,
      events: this.events.length,
      impacts: m.impacts,
      impactSteps: m.impactSteps,
      impactCapHits: m.impactCapHits,
      substepCapHits: m.substepCapHits,
      stepCapHits: m.stepCapHits,
      shotCapHit: m.shotCapHit,
      forcedRest: m.forcedRest,
      cellCrossings: m.cellCrossings,
      tableCrossings: m.tableCrossings,
      staleContacts: m.staleContacts,
    };
  }
}

/** Earlier event first; ties by kind rank, then lower id, then higher id. */
/**
 * Offer a candidate event to a search. It replaces `best` when nothing was found yet or it comes
 * first in the order (time, kind, lower id, higher id); a tie keeps the earlier candidate.
 * Returns that something is now found.
 */
function offer(
  best: Next,
  found: boolean,
  t: number,
  rank: number,
  a: Body,
  b: Body | null,
  feature: StaticFeature | null,
  internal: InternalEvent | null,
): boolean {
  if (found && !precedes(t, rank, a, b, best)) return true;
  best.t = t;
  best.rank = rank;
  best.a = a;
  best.b = b;
  best.feature = feature;
  best.internal = internal;
  return true;
}

function precedes(t: number, rank: number, a: Body, b: Body | null, than: Next): boolean {
  if (t !== than.t) return t < than.t;
  if (rank !== than.rank) return rank < than.rank;
  if (a.id !== than.a.id) return a.id < than.a.id;
  const ab = b === null ? -1 : b.id;
  const bb = than.b === null ? -1 : than.b.id;
  return ab < bb;
}

function copyKinematics(b: Body, from: Dyn): void {
  const s = b.s;
  s.x = from.x;
  s.y = from.y;
  s.z = from.z;
  s.vx = from.vx;
  s.vy = from.vy;
  s.vz = from.vz;
  s.wx = from.wx;
  s.wy = from.wy;
  s.wz = from.wz;
  s.eSlide = from.eSlide;
  s.eRoll = from.eRoll;
  s.eSpin = from.eSpin;
  s.eDrag = from.eDrag;
}

function approachSpeed(a: Body, b: Body | null, nx: number, ny: number, nz: number): number {
  const s = a.s;
  // Contact-point velocity of a at −r·n: v + ω × (−r·n).
  let vx = s.vx - a.r * (s.wy * nz - s.wz * ny);
  let vy = s.vy - a.r * (s.wz * nx - s.wx * nz);
  let vz = s.vz - a.r * (s.wx * ny - s.wy * nx);
  if (b !== null) {
    const t = b.s;
    vx -= t.vx + b.r * (t.wy * nz - t.wz * ny);
    vy -= t.vy + b.r * (t.wz * nx - t.wx * nz);
    vz -= t.vz + b.r * (t.wx * ny - t.wy * nx);
  }
  return Math.max(0, -(vx * nx + vy * ny + vz * nz));
}

/** Apply an impulse (jx, jy, jz) at offset (rx, ry, rz) from a marble's centre. */
function applyContactImpulse(
  b: Body,
  rx: number,
  ry: number,
  rz: number,
  jx: number,
  jy: number,
  jz: number,
): void {
  const s = b.s;
  s.vx += jx / b.m;
  s.vy += jy / b.m;
  s.vz += jz / b.m;
  s.wx += (ry * jz - rz * jy) / b.inertia;
  s.wy += (rz * jx - rx * jz) / b.inertia;
  s.wz += (rx * jy - ry * jx) / b.inertia;
}

function toSupport(f: StaticFeature): Support {
  switch (f.kind) {
    case 'base':
      return BASE;
    case 'top':
      return { kind: 'top', block: f.block };
    case 'floor':
      return FLOOR;
    case 'rim':
      return RIM;
    case 'edge':
      return { kind: 'edge', edge: f.edge };
    case 'corner':
      return { kind: 'corner', corner: f.corner };
    default:
      throw new PhysicsError('internal', `${f.kind} cannot support a marble`);
  }
}
