"""Remove short out-and-back artifacts without changing rail path endpoints."""
import math


def _short_reversal(a, b, c, max_spur_m):
    scale = math.cos(math.radians((a[1] + b[1] + c[1]) / 3))
    ux, uy = (b[0] - a[0]) * scale * 111195, (b[1] - a[1]) * 111195
    vx, vy = (c[0] - b[0]) * scale * 111195, (c[1] - b[1]) * 111195
    incoming, outgoing = math.hypot(ux, uy), math.hypot(vx, vy)
    if min(incoming, outgoing) < .001 or max(incoming, outgoing) > max_spur_m:
        return False
    direction = (ux * vx + uy * vy) / (incoming * outgoing)
    returned = math.hypot(ux + vx, uy + vy)
    return direction <= math.cos(math.radians(175)) and returned <= max(1.5, min(incoming, outgoing) / 2)


def clean_rail_path(coordinates, max_spur_m=150):
    cleaned = []
    for point in coordinates:
        if cleaned and point == cleaned[-1]:
            continue
        while len(cleaned) >= 2 and _short_reversal(cleaned[-2], cleaned[-1], point, max_spur_m):
            cleaned.pop()
        if not cleaned or point != cleaned[-1]:
            cleaned.append(point)
    return cleaned
