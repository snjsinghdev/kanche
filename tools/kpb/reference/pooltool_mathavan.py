"""KPB v1 test 14's reference values: pooltool's frictional_mathavan ball-ball collision.

    python3 tools/kpb/reference/pooltool_mathavan.py [--wheel <pooltool wheel>] [--n <steps>]

Runs pooltool 0.6.0's `_collide_balls` (Mathavan, Jackson and Parkin 2014; vendored in
_pooltool_frictional_mathavan.py) on equal-size glass marbles on cement, with Kanche's v1
parameters, and writes the inputs and post-impact velocities and spins to
packages/testkit/golden/pooltool-mathavan.json. packages/physics/test/kpb/reference.test.ts
compares Kanche's impact solve against them.

Two variants are written:

- "pooltool": the function exactly as pooltool ships it.
- "corrected": the same function with one sign convention fixed. Its ball-table slip is
  (v_x + R w_y, v_y - R w_x) in its local frame, while pooltool's own rel_velocity, the
  function's ball-ball slip and its torque updates all use the right-handed v + w x (-R z),
  which is (v_x - R w_y, v_y + R w_x). The corrected variant replaces those four lines only
  (see CORRECTION) and is otherwise the vendored source.

The step size is pooltool's own (0.5 (1 + e) M |v| / N); N defaults to 20,000 so that the
reference is converged, and the values at pooltool's default N = 1,000 are written too.
Needs only numpy. Nothing here runs in CI: the JSON it writes is committed (ADR-0007).
"""

import argparse
import hashlib
import inspect
import json
import math
import pathlib
import zipfile

import numpy as np

import _pooltool_frictional_mathavan as vendored

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "packages" / "testkit" / "golden" / "pooltool-mathavan.json"
WHEEL_FILE = "pooltool/physics/resolve/ball_ball/frictional_mathavan/__init__.py"
WHEEL_SHA256 = "c47a46aeeeac6eea645e5c1610211ce0f0ae350e4b77909b8dd55b66e77b3bd5"

# Kanche physics v1 (packages/physics/src/params/v1): an r80 glass marble on cement.
R = 0.008  # m
M = 2500 * (4 / 3) * math.pi * R**3  # kg
U_S = 0.35  # cement sliding friction
U_B = 0.08  # glass-glass friction
E_B = 0.93  # glass-glass restitution

CORRECTION = [
    (
        "u_iR_x, u_iR_y = v_ix + R * w_iy, v_iy - R * w_ix",
        "u_iR_x, u_iR_y = v_ix - R * w_iy, v_iy + R * w_ix",
    ),
    (
        "u_jR_x, u_jR_y = v_jx + R * w_jy, v_jy - R * w_jx",
        "u_jR_x, u_jR_y = v_jx - R * w_jy, v_jy + R * w_jx",
    ),
]


def corrected_function():
    source = inspect.getsource(vendored._collide_balls)
    for old, new in CORRECTION:
        if source.count(old) != 2:
            raise SystemExit(f"expected the slip line twice: {old}")
        source = source.replace(old, new)
    namespace = dict(vars(vendored))
    exec(compile(source, "<corrected _collide_balls>", "exec"), namespace)
    return namespace["_collide_balls"]


def check_wheel(path):
    data = pathlib.Path(path).read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != WHEEL_SHA256:
        raise SystemExit(f"wheel sha256 {digest} is not pooltool-billiards 0.6.0's")
    with zipfile.ZipFile(path) as z:
        upstream = z.read(WHEEL_FILE).decode()
    ours = inspect.getsource(vendored._collide_balls)
    start = upstream.index("def _collide_balls(")
    end = upstream.index(ours.splitlines()[-1], start) + len(ours.splitlines()[-1])
    if upstream[start:end] != ours.rstrip("\n"):
        raise SystemExit("the vendored _collide_balls differs from the wheel")
    if "@jit(nopython=True, cache=const.use_numba_cache)\ndef _collide_balls(" not in upstream:
        raise SystemExit("the wheel's decorator line changed")
    print(f"vendored _collide_balls matches {WHEEL_FILE} in the wheel ({digest})")


def cases():
    """Equal r80 marbles on flat ground: the striker i moves along +x into j."""
    out = []
    spins = {
        "stun": lambda v: (0.0, 0.0, 0.0),
        "roll": lambda v: (0.0, v / R, 0.0),
        "draw": lambda v: (0.0, -v / R, 0.0),
        "roll-side": lambda v: (0.0, v / R, v / R),
        "stun-side": lambda v: (0.0, 0.0, -v / R),
    }
    for v in (0.3, 1.0, 3.0):
        for cut in (0, 15, 30, 45, 60):
            phi = math.radians(cut)
            for name, spin in spins.items():
                out.append(
                    {
                        "name": f"v{v} cut{cut} {name}",
                        "i": {"r": [0.0, 0.0, R], "v": [v, 0.0, 0.0], "w": list(spin(v))},
                        "j": {
                            "r": [2 * R * math.cos(phi), 2 * R * math.sin(phi), R],
                            "v": [0.0, 0.0, 0.0],
                            "w": [0.0, 0.0, 0.0],
                        },
                    }
                )
        # Head on into a marble rolling the other way, rolling or stunned.
        for name, wi in (("roll", (0.0, v / R, 0.0)), ("stun", (0.0, 0.0, 0.0))):
            out.append(
                {
                    "name": f"v{v} head-on {name} into rolling",
                    "i": {"r": [0.0, 0.0, R], "v": [v, 0.0, 0.0], "w": list(wi)},
                    "j": {
                        "r": [2 * R, 0.0, R],
                        "v": [-v / 2, 0.0, 0.0],
                        "w": [0.0, -v / (2 * R), 0.0],
                    },
                }
            )
    return out


def run(fn, case, n):
    a = {k: np.array(x, dtype=np.float64) for k, x in case["i"].items()}
    b = {k: np.array(x, dtype=np.float64) for k, x in case["j"].items()}
    vi, wi, vj, wj = fn(a["r"], a["v"], a["w"], b["r"], b["v"], b["w"], R, M, U_S, U_S, U_B, E_B, None, n)
    return {"vi": vi.tolist(), "wi": wi.tolist(), "vj": vj.tolist(), "wj": wj.tolist()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wheel", help="pooltool_billiards-0.6.0-py3-none-any.whl to check against")
    parser.add_argument("--n", type=int, default=20000, help="impulse steps for the reference")
    args = parser.parse_args()
    if args.wheel:
        check_wheel(args.wheel)
    fixed = corrected_function()
    rows = []
    for case in cases():
        rows.append(
            {
                **case,
                "pooltool": run(vendored._collide_balls, case, args.n),
                "corrected": run(fixed, case, args.n),
                "pooltoolDefaultN": run(vendored._collide_balls, case, 1000),
            }
        )
    doc = {
        "generator": "tools/kpb/reference/pooltool_mathavan.py",
        "reference": {
            "package": "pooltool-billiards",
            "version": "0.6.0",
            "license": "Apache-2.0",
            "file": WHEEL_FILE,
            "function": "_collide_balls",
            "wheelSha256": WHEEL_SHA256,
            "model": "Mathavan, Jackson and Parkin (2014), Sports Engineering 17, 227-237",
        },
        "numpy": np.__version__,
        "params": {"R": R, "M": M, "u_s": U_S, "u_b": U_B, "e_b": E_B},
        "n": args.n,
        "correction": [{"from": a, "to": b} for a, b in CORRECTION],
        "cases": rows,
    }
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    print(f"wrote {len(rows)} cases to {OUT}")


if __name__ == "__main__":
    main()
