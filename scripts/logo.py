# Generates docs/logo.svg: python3 scripts/logo.py docs/logo.svg
import sys
# A gantry crane lifting a kanban card toward the next column.
# Members are split into a lit and a shaded facet, Obsidian-style.
lit, mid, dark = "#ffc24d", "#f5a623", "#c9780c"
def poly(pts, fill): return f'<polygon points="{" ".join(f"{x:g},{y:g}" for x,y in pts)}" fill="{fill}"/>'
P = []
# girder: overhangs both legs; top facet lit, bottom facet shaded
gl, gr, gt, gh = 64, 448, 116, 52
P += [poly([(gl,gt),(gr,gt),(gr,gt+gh/2),(gl,gt+gh/2)], lit),
      poly([(gl,gt+gh/2),(gr,gt+gh/2),(gr,gt+gh),(gl,gt+gh)], dark)]
# legs: splayed outward; each split down its length into lit (outer) and shaded (inner) halves
top, bot, w = gt+gh, 400, 54
def leg(xt, xb, outer_left):
    a, b = (xt, top), (xt+w, top)
    c, d = (xb+w, bot), (xb, bot)
    mt, mb = (xt+w/2, top), (xb+w/2, bot)
    l = poly([a, mt, mb, d], lit if outer_left else dark)
    r = poly([mt, b, c, mb], dark if outer_left else lit)
    return [l, r]
P += leg(118, 82, True) + leg(340, 376, False)
# feet
P += [poly([(66,bot),(152,bot),(152,bot+18),(66,bot+18)], mid),
      poly([(360,bot),(446,bot),(446,bot+18),(360,bot+18)], mid)]
# trolley on the girder, right of centre: the card is in transit
tx, tw = 250, 76
P += [poly([(tx,gt+gh),(tx+tw,gt+gh),(tx+tw-8,gt+gh+18),(tx+8,gt+gh+18)], dark)]
# hoist cables and the card (white face, orange label stripe, grey edge)
cx = tx + tw/2
cw, ch, cy = 136, 84, 248
cl = cx - cw/2
P += [f'<path d="M{cx-14:g} {gt+gh+18}V{cy}M{cx+14:g} {gt+gh+18}V{cy}" stroke="#d9dee2" stroke-width="8"/>',
      poly([(cl,cy),(cl+cw,cy),(cl+cw,cy+ch),(cl,cy+ch)], "#eef1f3"),
      poly([(cl,cy+ch-12),(cl+cw,cy+ch-12),(cl+cw,cy+ch),(cl,cy+ch)], "#b8c1c8"),
      poly([(cl+16,cy+18),(cl+64,cy+18),(cl+64,cy+32),(cl+16,cy+32)], mid),
      poly([(cl+16,cy+44),(cl+cw-16,cy+44),(cl+cw-16,cy+52),(cl+16,cy+52)], "#c3cbd1")]
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Gantry">
  <rect width="512" height="512" rx="112" fill="#3b434b"/>
  <g transform="translate(0 -11)">{"".join(P)}</g>
</svg>
'''
open(sys.argv[1], "w").write(svg)
