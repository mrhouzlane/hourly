# Side by side: reference (left) and ours (right), same width, labelled.
import sys
from PIL import Image, ImageDraw
REF = ['home', 'trade', 'lock', 'access', 'index', 'house', 'docs', 'm-home']
d = '/home/mehdi_quantum3labs_com/hourly-v3/design/'
for pg in (sys.argv[1].split(',') if len(sys.argv) > 1 else REF):
    a = Image.open(f'{d}clean-shots/{pg}.png').convert('RGB')
    b = Image.open(f'{d}compare/ours/{pg}.png').convert('RGB')
    w = a.width
    if b.width != w: b = b.resize((w, round(b.height * w / b.width)))
    H = max(a.height, b.height) + 40
    c = Image.new('RGB', (w * 2 + 20, H), (20, 20, 20))
    c.paste(a, (0, 40)); c.paste(b, (w + 20, 40))
    dr = ImageDraw.Draw(c); dr.text((10, 12), f'REFERENCE clean-shots/{pg}.png', fill=(255, 255, 255)); dr.text((w + 30, 12), 'OURS hourly-v3 preview', fill=(255, 255, 255))
    c.save(f'{d}compare/clean-{pg}.png')
    print(pg, a.size, b.size)
