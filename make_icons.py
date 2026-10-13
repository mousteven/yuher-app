# -*- coding: utf-8 -*-
"""產生 App 圖示。暫時版：品牌深青底 + 白色「羽禾」。

之後拿到公司 logo 就把這支換掉，尺寸與檔名保持一樣，
manifest 不用動。
"""
import os
from PIL import Image, ImageDraw, ImageFont

BRAND = (27, 59, 111)          # --brand #1B3B6F（海軍藍）
OUT = os.path.dirname(os.path.abspath(__file__))

# Windows 內建的黑體，字重夠、中文不會缺字
FONT_CANDIDATES = [
    r'C:\Windows\Fonts\msjhbd.ttc',   # 微軟正黑體 Bold
    r'C:\Windows\Fonts\msjh.ttc',
    r'C:\Windows\Fonts\mingliu.ttc',
]


def font_for(px):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return ImageFont.truetype(p, px)
    return ImageFont.load_default()


def draw_icon(size, pad_ratio, radius_ratio, out_name):
    """pad_ratio: 四周留白比例。Android 的 maskable 圖示會被裁成圓形，
    留白不夠字就會被切掉。"""
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BRAND)

    inner = size * (1 - pad_ratio * 2)
    fs = int(inner * 0.46)
    f = font_for(fs)
    txt = '羽禾'
    bb = d.textbbox((0, 0), txt, font=f)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    d.text(((size - w) / 2 - bb[0], (size - h) / 2 - bb[1]), txt,
           font=f, fill=(255, 255, 255, 255))
    im.save(os.path.join(OUT, out_name))
    print(out_name, size)


# 一般圖示：圓角方形，字可以大一點
draw_icon(192, 0.10, 0.22, 'icon-192.png')
draw_icon(512, 0.10, 0.22, 'icon-512.png')
# iPhone 的 apple-touch-icon 會自己套圓角，要給滿版直角
draw_icon(180, 0.10, 0.0, 'apple-touch-icon.png')
# Android maskable：會被裁圓，安全區只有中間 80%
draw_icon(512, 0.20, 0.0, 'icon-maskable-512.png')
