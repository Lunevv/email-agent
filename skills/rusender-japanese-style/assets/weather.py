# -*- coding: utf-8 -*-
"""Погода и сезон для письма. Источник — Open-Meteo, без ключа.

  python3 weather.py "Казань" --date 2026-09-17
  python3 weather.py "Буэнос-Айрес" --country AR --capital --date 2026-09-17

Выход — JSON в stdout. Коды завершения:
  0 — готово (forecast может быть null, если дата вне прогноза);
  3 — пользователь назвал СТРАНУ: в JSON country_code, нужен повторный вызов со столицей;
  4 — место не найдено или столица не подтвердилась: спроси пользователя;
  5 — сервис недоступен.
Ничего не выдумывает: если данных нет, так и пишет.
"""
import json, sys, os, argparse, urllib.parse, urllib.request, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
WMO = {
 0:"ясно", 1:"преимущественно ясно", 2:"переменная облачность", 3:"пасмурно",
 45:"туман", 48:"туман с изморозью",
 51:"слабая морось", 53:"морось", 55:"сильная морось", 56:"ледяная морось", 57:"сильная ледяная морось",
 61:"небольшой дождь", 63:"дождь", 65:"сильный дождь", 66:"ледяной дождь", 67:"сильный ледяной дождь",
 71:"небольшой снег", 73:"снег", 75:"сильный снег", 77:"снежная крупа",
 80:"кратковременный дождь", 81:"ливень", 82:"сильный ливень", 85:"снегопад", 86:"сильный снегопад",
 95:"гроза", 96:"гроза с градом", 99:"сильная гроза с градом"}

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "kisetsu-skill"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)

def out(obj, code=0):
    print(json.dumps(obj, ensure_ascii=False, indent=1)); sys.exit(code)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("place"); ap.add_argument("--date", default=datetime.date.today().isoformat())
    ap.add_argument("--country", help="ISO-код страны для проверки"); ap.add_argument("--capital", action="store_true")
    a = ap.parse_args()
    try:
        send = datetime.date.fromisoformat(a.date)
    except ValueError:
        out({"error": f"дата не в формате ГГГГ-ММ-ДД: {a.date}"}, 4)

    q = {"name": a.place, "count": 10, "language": "ru", "format": "json"}
    if a.country: q["countryCode"] = a.country.upper()
    try:
        res = get("https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode(q)).get("results") or []
    except Exception as e:
        out({"error": f"геокодер недоступен: {e}"}, 5)
    if not res:
        out({"error": f"место не найдено: {a.place}"}, 4)

    top = res[0]
    if str(top.get("feature_code", "")).startswith("PCL") and not a.capital:
        out({"kind": "country", "country": top.get("name"), "country_code": top.get("country_code"),
             "next": "назови столицу этой страны и вызови ещё раз с --country КОД --capital"}, 3)

    if a.capital:
        caps = [r for r in res if r.get("feature_code") == "PPLC"]
        if not caps:
            out({"error": f"«{a.place}» не подтвердилась как столица {a.country}"}, 4)
        pick = caps[0]
    else:
        places = [r for r in res if str(r.get("feature_code", "")).startswith("PPL")] or res
        pick = max(places, key=lambda r: r.get("population") or 0)
    others = list(dict.fromkeys(f"{r['name']} ({r.get('admin1') or r.get('country')})" for r in res
              if r is not pick and str(r.get("feature_code","")).startswith("PPL")))[:3]

    lat = pick["latitude"]
    seasons = json.load(open(os.path.join(HERE, "seasons.json"), encoding="utf-8"))
    month = send.month if lat >= 0 else (send.month + 5) % 12 + 1
    key = seasons["months_north"][str(month)]
    season = dict(seasons["seasons"][key], key=key)

    forecast, note = None, None
    days_ahead = (send - datetime.date.today()).days
    if days_ahead < 0:
        note = "дата в прошлом — прогноза нет"
    elif days_ahead > 15:
        note = "дата дальше 16 дней — прогноза ещё нет, письмо пишется по сезону"
    else:
        try:
            f = get("https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode({
                "latitude": lat, "longitude": pick["longitude"], "timezone": "auto", "forecast_days": 16,
                "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max"}))
            dd = f["daily"]; i = dd["time"].index(send.isoformat())
            code = dd["weather_code"][i]
            forecast = {"date": send.isoformat(), "code": code, "description": WMO.get(code, f"код {code}"),
                        "t_min": dd["temperature_2m_min"][i], "t_max": dd["temperature_2m_max"][i],
                        "precipitation_mm": dd["precipitation_sum"][i], "wind_max_kmh": dd["wind_speed_10m_max"][i]}
        except Exception as e:
            note = f"прогноз недоступен: {e}"

    out({"kind": "place", "place": pick["name"], "region": pick.get("admin1"), "country": pick.get("country"),
         "country_code": pick.get("country_code"), "latitude": lat, "longitude": pick["longitude"],
         "timezone": pick.get("timezone"), "hemisphere": "северное" if lat >= 0 else "южное",
         "tropics": abs(lat) < 23.44, "also_found": others,
         "send_date": send.isoformat(), "season": season, "forecast": forecast, "note": note})

main()
