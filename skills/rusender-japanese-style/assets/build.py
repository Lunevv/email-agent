# -*- coding: utf-8 -*-
"""Собирает письмо из шаблона. Модель пишет только текст; вёрстку и цвета не трогает.

  python3 build.py weather.json content.json OUT_DIR

content.json: {"weather_text": "…", "haiku": ["…","…","…"], "preheader": "…"(необязательно)}
Результат в OUT_DIR: letter.html (письмо), letter.txt (текстовая версия), preview.html (для артефакта).
Код 2 — текст не прошёл проверку, в stderr список причин.
"""
import json, sys, os, re, html, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
FORBIDDEN = ["прогноз", "градус", "метео", "осадк", "синоптик", "по данным", "°", "%"]

def _lum(h):
    h = h.lstrip("#"); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

def _cr(a, b):
    la, lb = sorted((_lum(a), _lum(b)), reverse=True); return (la + 0.05) / (lb + 0.05)

def soft_color(ink, bg, target=3.2):
    """Текст хайку: цвет текста, разбавленный к фону сезона, пока контраст не опустится до target."""
    a = [int(ink.lstrip("#")[i:i+2], 16) for i in (0, 2, 4)]
    b = [int(bg.lstrip("#")[i:i+2], 16) for i in (0, 2, 4)]
    best = ink
    for t in range(0, 101):
        c = "#%02x%02x%02x" % tuple(round(a[j] + (b[j] - a[j]) * t / 100) for j in range(3))
        if _cr(c, bg) < target: break
        best = c
    return best

def fail(errors):
    sys.stderr.write("Текст не прошёл проверку:\n" + "\n".join(f"  — {e}" for e in errors) + "\n"); sys.exit(2)

def main():
    wpath, cpath, outdir = sys.argv[1:4]
    w = json.load(open(wpath, encoding="utf-8")); c = json.load(open(cpath, encoding="utf-8"))
    pal = json.load(open(os.path.join(HERE, "seasons.json"), encoding="utf-8"))
    s = w["season"]
    text = (c.get("weather_text") or "").strip()
    haiku = [l.strip() for l in (c.get("haiku") or [])]
    errors = []

    # погодная фраза
    if not text: errors.append("нет погодной фразы")
    if re.search(r"\d", text): errors.append("в погодной фразе цифры — письмо не метеосводка")
    for word in FORBIDDEN:
        if word in text.lower(): errors.append(f"в погодной фразе «{word}»")
    ends = len(re.findall(r"[.!?…]+(?=\s|$)", text))
    if ends > 2: errors.append(f"в погодной фразе {ends} предложения, нужно одно-два")
    if len(text) > 260: errors.append(f"погодная фраза длиной {len(text)} символов, предел 260")
    if len(text) < 30: errors.append("погодная фраза слишком короткая")

    # хайку
    if len(haiku) != 3 or not all(haiku): errors.append("хайку — ровно три непустые строки")
    for i, l in enumerate(haiku, 1):
        if re.search(r"\d", l): errors.append(f"в строке хайку {i} цифры")
        if len(l) > 42: errors.append(f"строка хайку {i} длиннее 42 символов")
        if l.lower() in text.lower(): errors.append(f"строка хайку {i} повторяет погодную фразу")
    if errors: fail(errors)

    date = datetime.date.fromisoformat(w["send_date"])
    pre = (c.get("preheader") or text).strip()
    values = {
        "TITLE": f"{s['jp']} · {s['label']}", "PREHEADER": pre[:140],
        "BG": s["bg"], "LINE": s["line"], "ACCENT": s["accent"], "INK": pal["ink"], "MUTED": pal["muted"],
        "JP": s["jp"], "LABEL": s["label"], "MOTTO": s["motto"], "WEATHER": text,
        "SOFT": soft_color(pal["ink"], s["bg"]),
        "HAIKU_1": haiku[0], "HAIKU_2": haiku[1], "HAIKU_3": haiku[2]}
    raw = {"BG","LINE","ACCENT","INK","MUTED","SOFT"}
    tpl = open(os.path.join(HERE, "letter-template.html"), encoding="utf-8").read()
    for k, v in values.items():
        tpl = tpl.replace(f"%%{k}%%", v if k in raw else html.escape(v, quote=False))
    left = re.findall(r"%%[A-Z_0-9]+%%", tpl)
    if left: fail([f"в шаблоне остались незаполненные метки: {', '.join(sorted(set(left)))}"])
    if tpl.count("{{unsubscribe_url}}") != 1: fail(["ссылка отписки {{unsubscribe_url}} должна быть в письме ровно один раз"])

    os.makedirs(outdir, exist_ok=True)
    open(os.path.join(outdir, "letter.html"), "w", encoding="utf-8").write(tpl)
    txt = (f"{s['label'].capitalize()} — {s['motto']}\n\n{text}\n\n"
           f"{haiku[0]}\n{haiku[1]}\n{haiku[2]}\n\n—\nОтписаться от рассылки: {{{{unsubscribe_url}}}}\n")
    open(os.path.join(outdir, "letter.txt"), "w", encoding="utf-8").write(txt)
    body = tpl.split("<body", 1)[1].split(">", 1)[1].rsplit("</body>", 1)[0]
    style = re.search(r"<style>.*?</style>", tpl, re.S).group(0)
    open(os.path.join(outdir, "preview.html"), "w", encoding="utf-8").write(
        f"<title>{html.escape(s['jp'])} · {html.escape(w['place'])}</title>\n{style}\n"
        f"<style>body{{margin:0;background:{s['bg']}}}</style>\n{body}")

    print(json.dumps({
        "letter_html": os.path.join(outdir, "letter.html"), "letter_txt": os.path.join(outdir, "letter.txt"),
        "preview_html": os.path.join(outdir, "preview.html"),
        "template_name": f"Кисэцу · {s['label']} · {w['place']} · {date.strftime('%d.%m.%Y')}",
        "season": f"{s['jp']} ({s['reading']}) · {s['label']} — {s['motto']}",
        "weather_used": (w.get("forecast") or {}).get("description") or "нет прогноза — по сезону"},
        ensure_ascii=False, indent=1))

main()
