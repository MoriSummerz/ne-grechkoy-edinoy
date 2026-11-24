"""One-off: download Open Food Facts products (with label nutrition) for the brands used in the catalog.
Usage: python3 -I fetch_off_brands.py <out_dir>
Polite: one search request per brand, 12 s apart (OFF asks <=10 search req/min; it often answers 503 — rerun to fill gaps, existing files are skipped), generic UA, no account."""
import json, sys, time, urllib.parse, urllib.request, pathlib

BRANDS = ["Красная цена", "Global Village", "Селяночка", "Makfa", "Шебекинские", "Увелка", "Мистраль",
          "Националь", "Золотая семечка", "Слобода", "Любятово", "Юбилейное", "Посиделкино", "Mixbar",
          "Fish House", "Polar", "Borealis", "Мираторг", "Вязанка", "Папа может", "Русский продукт",
          "Baisad", "Barilla", "Maltagliati", "Агро-Альянс", "Сады Придонья", "ФрутоНяня", "Агуша",
          "Махеевъ", "Рот Фронт", "Алёнка", "Благо", "Altero", "ЭкоНива", "Азовская кондитерская фабрика",
          "Шарлиз", "Сарафаново", "Индилайт", "Золотой ярлык", "Красный Октябрь"]
# Free-text searches (Russia only) for generic items priced from Rosstat, to find a typical Russian label.
TERMS = ["говядина тушеная", "сайра натуральная", "сардина атлантическая натуральная с добавлением масла",
         "шпроты в масле", "творог 5%", "крабовые палочки", "пряники", "зефир ванильный", "конфеты молочные",
         "скумбрия натуральная с добавлением масла", "тушенка гастроном", "индейка тушеная", "горбуша натуральная"]
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
FIELDS = "code,product_name,product_name_ru,brands,quantity,nutriments,countries_tags"
JOBS = ([] if "--terms-only" in sys.argv else [("brand", b) for b in BRANDS]) + [("q", t) for t in TERMS]
for kind, b in JOBS:
    f = out / ((b if kind == "brand" else "q_" + b).replace(" ", "_").replace("%", "pct") + ".json")
    if f.exists():
        continue
    params = {"action": "process", "json": 1, "page_size": 200, "fields": FIELDS}
    params.update({"tagtype_0": "brands", "tag_contains_0": "contains", "tag_0": b} if kind == "brand" else
                  {"search_terms": b, "tagtype_0": "countries", "tag_contains_0": "contains", "tag_0": "russia"})
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request("https://world.openfoodfacts.org/cgi/search.pl?" + q,
                                 headers={"User-Agent": "nutrition-basket-snapshot/0.1 (one-off research)"})
    try:
        data = urllib.request.urlopen(req, timeout=90).read()
        json.loads(data)  # validate
        f.write_bytes(data)
        print(b, json.loads(data).get("count"))
    except Exception as e:
        print(b, "FAILED", e)
    time.sleep(12)
