"""The pictures on Duck Cards, as SVG symbol bodies on a 48 by 48 grid.

Every symbol is drawn by build_cards.py inside one group that sets the stroke:
no fill, round caps and joins, and `currentColor`, so a card's category colour
is the only colour a picture has. Shapes that are solid say so themselves with
`fill="currentColor" stroke="none"`.

THESE ARE ORIGINAL DRAWINGS. Nothing here is traced from Pollen Robotics' art,
their stickers or their photographs; the duck is an ellipse, a circle, a beak,
an eye and two sticks for legs. Keep it that way: the cards are CC BY 4.0, and a
teacher printing them has to be able to rely on that.
"""

import math

SOLID = 'fill="currentColor" stroke="none"'

# A duck sitting down, facing right, for Sit or stand.
DUCK = (
    '<ellipse cx="26" cy="33" rx="12" ry="7"/>'
    '<path d="M33 23.5c-.8 1.6-1.3 2.8-1.6 3.8"/>'
    '<circle cx="35" cy="18" r="6"/>'
    '<path d="M40.6 16.4 46 18l-5.4 1.6"/>'
    f'<circle cx="36.6" cy="16.6" r="1.3" {SOLID}/>'
)

BUBBLE = ('<path d="M10 9h28a5 5 0 0 1 5 5v15a5 5 0 0 1-5 5H22l-8 7v-7h-4a5 5 0 0 1-5-5V14'
          'a5 5 0 0 1 5-5z"/>')

EYE = '<path d="M5 24c5.5-8 12-12 19-12s13.5 4 19 12c-5.5 8-12 12-19 12S10.5 32 5 24z"/>'

GAUGE = '<path d="M8 33a16 16 0 0 1 32 0"/><path d="M8 38h32"/>'
HUB = f'<circle cx="24" cy="33" r="3" {SOLID}/>'


def dial(lo: float, hi: float, needle: float) -> str:
    """The gauge, a shaded wedge from `lo` to `hi` degrees, and the needle."""
    def at(angle: float, r: float) -> str:
        return (f"{24 + r * math.cos(math.radians(angle)):.2f} "
                f"{33 - r * math.sin(math.radians(angle)):.2f}")
    return (GAUGE
            + f'<path d="M24 33L{at(hi, 13)}A13 13 0 0 1 {at(lo, 13)}z" '
              'fill="currentColor" fill-opacity=".28" stroke="none"/>'
            + f'<path d="M24 33L{at(needle, 12.5)}"/>' + HUB)


# A head facing right: circle, beak, eye.
def head(cx: float, cy: float, r: float = 5) -> str:
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}"/>'
            f'<path d="M{cx + r - .3:.1f} {cy - 1.5:.1f} {cx + r + 4.5:.1f} {cy:.1f}l-4.8 1.5"/>'
            f'<circle cx="{cx + 1.3:.1f}" cy="{cy - 1.2:.1f}" r="1.2" {SOLID}/>')


# A duck facing right, kicking a ball on its right. Kick, left is the same
# picture mirrored, so the ball is always on the side the card names.
KICK = ('<ellipse cx="17" cy="20" rx="10" ry="6.2"/>'
        '<path d="M23.6 15.6c.6-1.3 1-2.4 1.2-3.4"/>'
        + head(26.5, 7.5)
        + '<path d="M14 26v13.5M10.5 40H17"/>'
          '<path d="M20 25.5 29 31"/><path d="M27.6 28.4l3 4.4"/>'
          '<circle cx="37.5" cy="35.5" r="6"/>'
          f'<path d="M37.5 32.6l2.7 2-1 3.2h-3.4l-1-3.2z" {SOLID}/>'
          '<path d="M45.6 30.6l1.9-1.6M46.2 36.2h2.4"/>')

ART = {
    "walk-forward": '<path d="M24 39V9"/><path d="M13 20 24 9l11 11"/>',
    "walk-back": '<path d="M24 9v30"/><path d="M13 28l11 11 11-11"/>',
    "turn-left": '<path d="M31 40V24c0-6.6-5.4-12-12-12h-6.5"/><path d="M19 5l-7 7 7 7"/>',
    "turn-right": '<path d="M17 40V24c0-6.6 5.4-12 12-12h6.5"/><path d="M29 5l7 7-7 7"/>',
    "stop": (f'<rect x="13" y="11" width="7.5" height="26" rx="2" {SOLID}/>'
             f'<rect x="27.5" y="11" width="7.5" height="26" rx="2" {SOLID}/>'),

    "speed-slow": dial(130, 180, 155),
    "speed-normal": dial(65, 115, 90),
    "speed-fast": dial(0, 50, 25),

    "look-left": EYE + f'<circle cx="14" cy="24" r="5.5" {SOLID}/>',
    "look-right": EYE + f'<circle cx="34" cy="24" r="5.5" {SOLID}/>',
    "look-up": EYE + f'<circle cx="24" cy="18" r="5.5" {SOLID}/>',
    "look-down": EYE + f'<circle cx="24" cy="30" r="5.5" {SOLID}/>',
    "look-straight": EYE + f'<circle cx="24" cy="24" r="5.5" {SOLID}/>'
                     + '<circle cx="24" cy="24" r="9.5"/>',

    "kick-left": f'<g transform="matrix(-1 0 0 1 48 0)">{KICK}</g>',
    "kick-right": KICK,
    "sit-stand": DUCK + '<path d="M8 10v28"/><path d="M4 14l4-4 4 4M4 34l4 4 4-4"/>',
    "roll": ('<path d="M24 10a14 14 0 1 1-12.1 7"/>'
             '<path d="M12.4 24.2 11.9 17l-6.5 3.2"/>'),
    "peck": ('<path d="M4 42h40"/>'
             '<ellipse cx="17" cy="21" rx="10" ry="6.2" transform="rotate(-18 17 21)"/>'
             '<path d="M26 22.5c2 2.2 3.4 4.6 4.2 7"/>'
             '<circle cx="32.5" cy="32.5" r="4.6"/>'
             '<path d="M34.6 36.6 36.4 41.4l2.6-4.6"/>'
             f'<circle cx="34.2" cy="31.4" r="1.15" {SOLID}/>'
             '<path d="M14 27.5V42"/>'
             f'<circle cx="42" cy="39.6" r="1.7" {SOLID}/>'),

    "sound-hello": (BUBBLE + f'<circle cx="19" cy="17" r="1.8" {SOLID}/>'
                    f'<circle cx="29" cy="17" r="1.8" {SOLID}/>'
                    '<path d="M18 22.5c3.5 3.5 8.5 3.5 12 0"/>'),
    "sound-chirp": (BUBBLE + f'<ellipse cx="20.6" cy="26" rx="3.6" ry="2.8" {SOLID}/>'
                    '<path d="M24 25.5V13c3 1 6 3 5.5 7"/>'),
    "sound-coo": (BUBBLE + '<path d="M24 29c-7-4.5-10-8.5-10-12.3 0-2.7 2.1-4.7 4.6-4.7 2.2 0 '
                  '3.9 1.3 5.4 3.2 1.5-1.9 3.2-3.2 5.4-3.2 2.5 0 4.6 2 4.6 4.7 0 3.8-3 '
                  f'7.8-10 12.3z" {SOLID}/>'),
    "sound-alarm": BUBBLE + '<path d="M24 14v9"/>' + f'<circle cx="24" cy="28" r="1.9" {SOLID}/>',
    "sound-wheee": BUBBLE + '<path d="M13 22c2.5-5 5-5 7.5 0s5 5 7.5 0 5-5 7.5 0"/>',
    "sound-inquire": (BUBBLE + '<path d="M19.5 16.5a4.5 4.5 0 1 1 6 4.2c-1.3.5-1.5 1.3-1.5 2.6v.7"/>'
                      f'<circle cx="24" cy="28.5" r="1.8" {SOLID}/>'),
    "sound-peck": (BUBBLE + f'<circle cx="17" cy="21.5" r="2" {SOLID}/>'
                   f'<circle cx="24" cy="21.5" r="2" {SOLID}/>'
                   f'<circle cx="31" cy="21.5" r="2" {SOLID}/>'),

    "start": '<circle cx="24" cy="24" r="17"/>' + f'<path d="M20 15.5v17l13-8.5z" {SOLID}/>',
    "end": ('<circle cx="24" cy="24" r="17"/>'
            f'<rect x="17" y="17" width="14" height="14" rx="2" {SOLID}/>'),
    "repeat": ('<path d="M14 9H9v30h5"/>'
               '<path d="M29 15a9 9 0 1 1-7.8 4.5"/>'
               '<path d="M21.6 24.9l-.4-5.4-4.8 2.4"/>'),
    "end-repeat": ('<path d="M34 9h5v30h-5"/>'
                   '<path d="M19 15a9 9 0 1 1-7.8 4.5"/>'
                   '<path d="M11.6 24.9l-.4-5.4-4.8 2.4"/>'),
    # On its back, feet in the air.
    "fall": ('<path d="M4 42h40"/>'
             '<ellipse cx="25" cy="34" rx="11" ry="6"/>'
             '<circle cx="10" cy="35.5" r="4.6"/>'
             '<path d="M7.6 31.4 5 27.4l4.9 1.2"/>'
             '<path d="M21 28.5 18.5 18M15.8 17.2l5.4-1.6"/>'
             '<path d="M29 28.5 32 18.5M29.4 16.8l5.4 2.6"/>'
             '<path d="M38 12l2.4-3.6M42 18h4.2M33.8 9.4V5"/>'),
}
