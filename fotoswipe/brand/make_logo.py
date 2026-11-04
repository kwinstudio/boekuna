"""Fotoswipe logo set: mark, horizontal and stacked lockups, light/dark/mono. Text is outlined (no font needed)."""
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

INK, BRAND, PAPER = '#17151F', '#5B3DF5', '#F6F4F1'

def text_path(text, ttf, size, tracking=-0.025):
    font = TTFont(ttf); gs = font.getGlyphSet(); upem = font['head'].unitsPerEm
    blob = hb.Blob.from_file_path(ttf); face = hb.Face(blob); hbf = hb.Font(face)
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(hbf, buf, {"kern": True, "liga": True})
    names = font.getGlyphOrder(); s = size / upem; x = 0; d = []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        pen = SVGPathPen(gs)
        gs[names[info.codepoint]].draw(TransformPen(pen, (s, 0, 0, -s, x + pos.x_offset * s, 0)))
        d.append(pen.getCommands()); x += pos.x_advance * s + tracking * size
    width = x - tracking * size
    asc = font['OS/2'].sCapHeight * s
    return d, width, asc

def word(parts, colors, x, y):
    """'Foto' and 'swipe' as two paths, so they can take two colours."""
    a, b = ' '.join(parts[:4]), ' '.join(parts[4:])
    return (f'<path d="{a}" fill="{colors[0]}" transform="translate({x} {y})"/>'
            f'<path d="{b}" fill="{colors[1]}" transform="translate({x} {y})"/>')

MARK_DEFS = '''<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7B5CFF"/><stop offset="1" stop-color="#3B22C9"/></linearGradient>
<linearGradient id="ph" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B9A8FF"/><stop offset="1" stop-color="#7B5CFF"/></linearGradient>
<linearGradient id="hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A2FE0"/><stop offset="1" stop-color="#2E1A9E"/></linearGradient>
<clipPath id="win"><rect width="380" height="330" rx="44"/></clipPath>
<filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="22" stdDeviation="26" flood-color="#160A5C" flood-opacity="0.40"/></filter>'''

def card(tx, ty, rot, opacity=1, shadow=True, mono=None):
    if mono:  # one colour, like an SF Symbol: framed card, sun and hills inside
        frame = ('M72 0H388A72 72 0 0 1 460 72V508A72 72 0 0 1 388 580H72A72 72 0 0 1 0 508V72A72 72 0 0 1 72 0Z '
                 'M90 50A40 40 0 0 0 50 90V490A40 40 0 0 0 90 530H370A40 40 0 0 0 410 490V90A40 40 0 0 0 370 50Z')
        inner = ('' if opacity < 1 else
                 f'<circle cx="320" cy="160" r="46" fill="{mono}"/>'
                 f'<path fill="{mono}" d="M50 470 L170 300 L262 410 L322 345 L410 455 V490 A40 40 0 0 1 370 530 H90 A40 40 0 0 1 50 490Z"/>')
        return f'''<g transform="translate({tx} {ty}) rotate({rot} 230 290)" opacity="{opacity}">
<path fill="{mono}" fill-rule="evenodd" d="{frame}"/>{inner}</g>'''
    f = ' filter="url(#sh)"' if shadow else ''
    return f'''<g transform="translate({tx} {ty}) rotate({rot} 230 290)" opacity="{opacity}"{f}>
<rect width="460" height="580" rx="72" fill="#fff"/>
<g transform="translate(40 40)" clip-path="url(#win)"><rect width="380" height="330" fill="url(#ph)"/>
<circle cx="290" cy="90" r="42" fill="#FFF4D6"/><path d="M-10 340 L120 170 L210 270 L280 200 L400 340 Z" fill="url(#hl)"/></g>
<rect x="40" y="410" width="230" height="30" rx="15" fill="#E4DEFF"/><rect x="40" y="462" width="150" height="30" rx="15" fill="#EEEAFF"/></g>'''

def mark(x, y, size, mono=None):
    """The app icon as a vector mark (1024 grid scaled to size)."""
    s = size / 1024
    if mono:
        knock = ('<mask id="knock"><rect width="1024" height="1024" fill="#fff"/>'
                 '<g transform="translate(300 212) rotate(7 230 290)"><rect x="-26" y="-26" width="512" height="632" rx="96" fill="#000"/></g></mask>')
        body = (knock + f'<g mask="url(#knock)">{card(250, 232, -11, opacity=0.45, mono=mono)}</g>'
                + card(300, 212, 7, mono=mono))
        return f'<g transform="translate({x} {y}) scale({s})">{body}</g>'
    body = (f'<rect width="1024" height="1024" rx="230" fill="url(#bg)"/>'
            + card(250, 232, -11, opacity=0.55, shadow=False) + card(300, 212, 7))
    return f'<g transform="translate({x} {y}) scale({s})">{body}</g>'

def svg(w, h, body, bg=None):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><defs>{MARK_DEFS}</defs>{rect}{body}</svg>'

WORD = 'Fotoswipe'
out = {}
# Horizontal lockup
M = 160; pad = 40
d, tw, cap = text_path(WORD, 'inter-700.ttf', 120, -0.03)
W = pad + M + 36 + tw + pad; H = pad * 2 + M
base = pad + M / 2 + cap / 2
for name, cols, bg in [('horizontal', (INK, BRAND), None), ('horizontal-dark', ('#FFFFFF', '#A897FF'), INK), ('horizontal-on-paper', (INK, BRAND), PAPER)]:
    out[name] = svg(round(W), H, mark(pad, pad, M) + word(d, cols, pad + M + 36, base), bg)
out['horizontal-mono'] = svg(round(W), H, mark(pad - M * 0.2, pad - M * 0.2, M * 1.4, mono=INK) + word(d, (INK, INK), pad + M * 1.06, base))
out['horizontal-mono-white'] = svg(round(W), H, mark(pad - M * 0.2, pad - M * 0.2, M * 1.4, mono='#FFFFFF') + word(d, ('#FFFFFF', '#FFFFFF'), pad + M * 1.06, base), BRAND)
# Stacked lockup
M2 = 280; d2, tw2, cap2 = text_path(WORD, 'inter-700.ttf', 110, -0.03)
W2 = max(M2, tw2) + pad * 2; H2 = pad + M2 + 50 + cap2 + pad + 10
for name, cols, bg in [('stacked', (INK, BRAND), None), ('stacked-dark', ('#FFFFFF', '#A897FF'), INK)]:
    out[name] = svg(round(W2), round(H2), mark((W2 - M2) / 2, pad, M2) + word(d2, cols, (W2 - tw2) / 2, pad + M2 + 50 + cap2), bg)
# Mark alone
out['mark'] = svg(1024, 1024, mark(0, 0, 1024))
out['mark-mono'] = svg(1024, 1024, mark(0, 0, 1024, mono=INK))
for name, s in out.items():
    open(f'Fotoswipe-logo-{name}.svg', 'w').write(s)
print(sorted(out))
