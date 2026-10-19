# Vendored from pooltool-billiards 0.6.0 (https://github.com/ekiefl/pooltool), file
# pooltool/physics/resolve/ball_ball/frictional_mathavan/__init__.py, by Evan Kiefl and the
# pooltool contributors, under the Apache License 2.0 (LICENSE.pooltool.txt, alongside).
#
# Modification: the function below is copied verbatim except that its numba decorator,
# `@jit(nopython=True, cache=const.use_numba_cache)`, is removed so that it runs on plain numpy
# (pooltool 0.6.0 itself needs a development build of panda3d on Linux). The module-level names
# it uses (INF, Z_LOC and the numpy imports) are copied from the same file.
# pooltool_mathavan.py --wheel <wheel> checks that the function still matches the wheel.

import numpy as np
from numpy import array, dot, sqrt
from numpy.typing import NDArray

INF = float("inf")
Z_LOC = array([0, 0, 1], dtype=np.float64)


def _collide_balls(
    r_i: NDArray[np.float64],
    v_i: NDArray[np.float64],
    w_i: NDArray[np.float64],
    r_j: NDArray[np.float64],
    v_j: NDArray[np.float64],
    w_j: NDArray[np.float64],
    R: float,
    M: float,
    u_s1: float = 0.21,
    u_s2: float = 0.21,
    u_b: float = 0.05,
    e_b: float = 0.89,
    deltaP: float | None = None,
    N: int = 1000,
) -> tuple[
    NDArray[np.float64], NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]
]:
    """The numba-compiled delegate for :func:`collide_balls`.

    Returns:
        Tuple[NDArray[np.float64], NDArray[np.float64]]:
            A tuple containing:

            - Updated velocity vector of ball 1 after collision in global coordinates.
            - Updated angular velocity vector of ball 1 after collision in global
              coordinates.
            - Updated velocity vector of ball 2 after collision in global coordinates.
            - Updated angular velocity vector of ball 2 after collision in global
              coordinates.
    """

    r_ij = r_j - r_i
    r_ij_mag_sqrd = dot(r_ij, r_ij)
    r_ij_mag = sqrt(r_ij_mag_sqrd)
    y_loc = r_ij / r_ij_mag
    x_loc = np.cross(y_loc, Z_LOC)
    G = np.vstack((x_loc, y_loc, Z_LOC))
    v_ix, v_iy = dot(v_i, x_loc), dot(v_i, y_loc)
    v_jx, v_jy = dot(v_j, x_loc), dot(v_j, y_loc)
    w_ix, w_iy, w_iz = dot(G, w_i)
    w_jx, w_jy, w_jz = dot(G, w_j)
    u_iR_x, u_iR_y = v_ix + R * w_iy, v_iy - R * w_ix
    u_jR_x, u_jR_y = v_jx + R * w_jy, v_jy - R * w_jx
    u_iR_xy_mag = sqrt(u_iR_x**2 + u_iR_y**2)
    u_jR_xy_mag = sqrt(u_jR_x**2 + u_jR_y**2)
    u_ijC_x = v_ix - v_jx - R * (w_iz + w_jz)
    u_ijC_z = R * (w_ix + w_jx)
    u_ijC_xz_mag = sqrt(u_ijC_x**2 + u_ijC_z**2)
    v_ijy = v_jy - v_iy
    if deltaP is None:
        deltaP = 0.5 * (1 + e_b) * M * abs(v_ijy) / N
    assert deltaP is not None
    C = 5 / (2 * M * R)
    W_f = INF
    W_c = None
    W = 0
    niters = 0
    while v_ijy < 0 or W < W_f:
        # determine impulse deltas:
        if u_ijC_xz_mag < 1e-16:
            deltaP_1 = deltaP_2 = 0
            deltaP_ix = deltaP_iy = deltaP_jx = deltaP_jy = 0
        else:
            deltaP_1 = -u_b * deltaP * u_ijC_x / u_ijC_xz_mag
            if abs(u_ijC_z) < 1e-16:
                deltaP_2 = 0
                deltaP_ix = deltaP_iy = deltaP_jx = deltaP_jy = 0
            else:
                deltaP_2 = -u_b * deltaP * u_ijC_z / u_ijC_xz_mag
                if deltaP_2 > 0:
                    deltaP_ix = deltaP_iy = 0
                    if u_jR_xy_mag == 0:
                        deltaP_jx = deltaP_jy = 0
                    else:
                        deltaP_jx = -u_s2 * (u_jR_x / u_jR_xy_mag) * deltaP_2
                        deltaP_jy = -u_s2 * (u_jR_y / u_jR_xy_mag) * deltaP_2
                else:
                    deltaP_jx = deltaP_jy = 0
                    if u_iR_xy_mag == 0:
                        deltaP_ix = deltaP_iy = 0
                    else:
                        deltaP_ix = u_s1 * (u_iR_x / u_iR_xy_mag) * deltaP_2
                        deltaP_iy = u_s1 * (u_iR_y / u_iR_xy_mag) * deltaP_2
        # calc velocity changes:
        deltaV_ix = (deltaP_1 + deltaP_ix) / M
        deltaV_iy = (-deltaP + deltaP_iy) / M
        deltaV_jx = (-deltaP_1 + deltaP_jx) / M
        deltaV_jy = (deltaP + deltaP_jy) / M
        # calc angular velocity changes:
        deltaOm_ix = C * (deltaP_2 + deltaP_iy)
        deltaOm_iy = C * (-deltaP_ix)
        deltaOm_iz = C * (-deltaP_1)
        deltaOm_j = C * array([(deltaP_2 + deltaP_jy), (-deltaP_jx), (-deltaP_1)])
        # update velocities:
        v_ix += deltaV_ix
        v_jx += deltaV_jx
        v_iy += deltaV_iy
        v_jy += deltaV_jy
        # update angular velocities:
        w_ix += deltaOm_ix
        w_iy += deltaOm_iy
        w_iz += deltaOm_iz
        w_jx += deltaOm_j[0]
        w_jy += deltaOm_j[1]
        w_jz += deltaOm_j[2]
        # update ball-table slips:
        u_iR_x, u_iR_y = v_ix + R * w_iy, v_iy - R * w_ix
        u_jR_x, u_jR_y = v_jx + R * w_jy, v_jy - R * w_jx
        u_iR_xy_mag = sqrt(u_iR_x**2 + u_iR_y**2)
        u_jR_xy_mag = sqrt(u_jR_x**2 + u_jR_y**2)
        # update ball-ball slip:
        u_ijC_x = v_ix - v_jx - R * (w_iz + w_jz)
        u_ijC_z = R * (w_ix + w_jx)
        u_ijC_xz_mag = sqrt(u_ijC_x**2 + u_ijC_z**2)
        # increment work:
        v_ijy0 = v_ijy
        v_ijy = v_jy - v_iy
        W += 0.5 * deltaP * abs(v_ijy0 + v_ijy)
        niters += 1
        if W_c is None and v_ijy > 0:
            W_c = W
            W_f = (1 + e_b**2) * W_c
            # niters_c = niters
            # _logger.debug('''
            # END OF COMPRESSION PHASE
            # W_c = %s
            # W_f = %s
            # niters_c = %s
            # ''', W_c, W_f, niters_c)
    # _logger.debug('''
    # END OF RESTITUTION PHASE
    # niters = %d
    # ''', niters)
    v_i = array((v_ix, v_iy, 0))
    v_j = array((v_jx, v_jy, 0))
    w_i = array((w_ix, w_iy, w_iz))
    w_j = array((w_jx, w_jy, w_jz))
    G_T = G.T
    return dot(G_T, v_i), dot(G_T, w_i), dot(G_T, v_j), dot(G_T, w_j)
