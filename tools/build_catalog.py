"""Build data/catalog.json from the raw one-off downloads.

Usage:
  python3 -I tools/build_catalog.py <raw_root> <out_catalog.json>

<raw_root> must contain (see data/SOURCES.md for how each was fetched):
  raw_yango_1/union_msk.json            Пятёрочка shelf prices (Yandex Maps price lists, source Edadeal)
  raw_wayback_rosstat/Nedel_sred_cen_20260927.xlsx   Rosstat weekly average prices 2026 (RF)
  raw_wayback_rosstat/sred_potreb_cen_2025.xlsx      Rosstat monthly average prices 2025 (RF row, December)
  raw_usda_1/sr_compact.json            USDA FDC SR Legacy macros (from FoodData_Central_sr_legacy_food_csv_2018-04)
  raw_usda_sr28/refuse_by_fdc.json      USDA SR28 refuse % (inedible share) by FDC id
  raw_off_1/*.json                      Open Food Facts search results (label nutrition, crowd-sourced)
Needs openpyxl (run with the scratchpad venv python).
"""
import collections, glob, json, os, sys

RAW, OUT = sys.argv[1], sys.argv[2]
U = json.load(open(f"{RAW}/raw_yango_1/union_msk.json", encoding="utf-8"))
SR = json.load(open(f"{RAW}/raw_usda_1/sr_compact.json", encoding="utf-8"))
REF = json.load(open(f"{RAW}/raw_usda_sr28/refuse_by_fdc.json", encoding="utf-8"))
OFF = {}
for f in glob.glob(f"{RAW}/raw_off_1/*.json"):
    for p in json.load(open(f, encoding="utf-8")).get("products", []):
        OFF[p["code"]] = p

CHUPR = "17620177076"  # д. Чупряково (Одинцовский г.о., Московская обл.) — the only sampled store whose list reached «Консервы»
STORE_ADDR = {
    "1353028124": "Москва, ул. Академика Анохина, 26к5", "63407936719": "Москва, Уральская ул., 8",
    "100081334671": "Москва, Локомотивный пр., 21", "1004159660": "Москва, Миллионная ул., 11к2",
    "101065500890": "Москва, Грайвороновская ул., 19", "1017270002": "Москва, Нахимовский пр., 20А",
    "1017509125": "Москва, Коломенская ул., 17", "1023233601": "Москва, Молодёжная ул., 2/64",
    CHUPR: "д. Чупряково, Одинцовский г.о., Московская обл.", "200518261999": "д. Давыдово, Заводская ул., 14А, Орехово-Зуевский г.о., Московская обл.",
}


def rosstat_tables():
    import openpyxl
    wk = openpyxl.load_workbook(f"{RAW}/raw_wayback_rosstat/Nedel_sred_cen_20260927.xlsx", read_only=True, data_only=True)
    rows = list(wk["2026"].iter_rows(values_only=True))
    hdr = rows[3]; last = max(i for i, v in enumerate(hdr) if v)
    weekly = {r[0]: r[last] for r in rows[4:] if r[0]}
    weekly_date = hdr[last]
    mo = openpyxl.load_workbook(f"{RAW}/raw_wayback_rosstat/sred_potreb_cen_2025.xlsx", read_only=True, data_only=True)
    rows = list(mo["12(2025)"].iter_rows(values_only=True))
    names, rf = rows[4], rows[5]
    assert rf[1] == "Российская Федерация", rf[:2]
    monthly = {names[j]: rf[j] for j in range(2, len(names)) if names[j]}
    return weekly, weekly_date, monthly


WEEKLY, WEEKLY_DATE, DEC2025 = rosstat_tables()
assert WEEKLY_DATE == "на 21 сентября", WEEKLY_DATE

# Densities used to turn ml into g (assumptions, stated in provenance).
DENS = {"oil": 0.92, "milk": 1.03, "juice": 1.04}

# ---------------------------------------------------------------------------
# Selection. Fields: id, group, shelf_stable, weight_g, nutrition, source, extra
#   source "5ka:<exact title in price list>"            -> price = most frequent price across sampled stores
#   source "rw:<Rosstat weekly name>|<unit_kg>"         -> price = RF weekly avg (21.09.2026) * weight_g/1000/unit_kg
#   source "rm:<Rosstat Dec-2025 name>|<unit_kg>"       -> same with RF December 2025 average
#   nutrition "usda:<fdc>" | "usda:<fdc>:refuse" (scale per100 by 1-refuse, i.e. per 100 g as sold)
#             | "off:<barcode>:same" (label of this very product) | "off:<barcode>:comparable"
#             | "zero:<why>"
# extra: dict with name/brand/note overrides
# ---------------------------------------------------------------------------
S = []
def add(id_, group, shelf, weight_g, nutr, src, **extra):
    S.append(dict(id=id_, group=group, shelf_stable=shelf, weight_g=weight_g, nutr=nutr, src=src, extra=extra))

# grains
add("buckwheat-selyanochka-900", "grains", True, 900, "usda:170685", "5ka:Гречка ядрица Селяночка быстроразваривающаяся пропаренная 900г, 900 г", brand="Селяночка")
add("buckwheat-uvelka-500", "grains", True, 500, "usda:170685", "5ka:Крупа Увелка гречневая 500г, 500 г", brand="Увелка")
add("buckwheat-mistral-900", "grains", True, 900, "usda:170685", "5ka:Гречка Мистраль 900г, 900 г", brand="Мистраль")
add("buckwheat-mistral-bags-400", "grains", True, 400, "usda:170685", "5ka:Гречка Мистраль ядрица 5х80г, 400 г", brand="Мистраль")
add("rice-round-selyanochka-900", "grains", True, 900, "usda:169756", "5ka:Рис Селяночка круглозерный шлифованный 900г, 900 г", brand="Селяночка")
add("rice-long-parboiled-selyanochka-900", "grains", True, 900, "usda:169758", "5ka:Рис Селяночка длиннозерный пропаренный 900г, 900 г", brand="Селяночка")
add("rice-plov-gv-800", "grains", True, 800, "usda:169756", "5ka:Рис Global Village Для плова 800г, 800 г", brand="Global Village")
add("rice-krasnodar-natsional-900", "grains", True, 900, "usda:169756", "5ka:Рис Националь Краснодарский 900г, 900 г", brand="Националь")
add("rice-round-uvelka-500", "grains", True, 500, "usda:169756", "5ka:Рис Увелка круглозерный шлифованный 500г, 500 г", brand="Увелка")
add("rice-bags-selyanochka-400", "grains", True, 400, "usda:169756", "5ka:Рис Селяночка круглозерный 5x80г, 400 г", brand="Селяночка")
add("rice-brown-gv-800", "grains", True, 800, "usda:169703", "5ka:Рис Global Village бурый 800г, 800 г", brand="Global Village")
add("millet-selyanochka-800", "grains", True, 800, "usda:169702", "5ka:Пшено Селяночка шлифованное 800г, 800 г", brand="Селяночка")
add("barley-pearl-selyanochka-900", "grains", True, 900, "usda:170284", "5ka:Крупа Селяночка перловая №2 900г, 900 г", brand="Селяночка")
add("corn-grits-selyanochka-600", "grains", True, 600, "usda:168867", "5ka:Крупа Селяночка кукурузная шлифованная 600г, 600 г", brand="Селяночка")
add("semolina-selyanochka-800", "grains", True, 800, "usda:168933", "5ka:Манка Селяночка 800г, 800 г", brand="Селяночка")
add("bulgur-gv-450", "grains", True, 450, "usda:170688", "5ka:Булгур Global Village 450г, 450 г", brand="Global Village")
add("oats-gerkules-selyanochka-500", "grains", True, 500, "usda:173904", "5ka:Хлопья овсяные Селяночка Геркулес 500г, 500 г", brand="Селяночка")
add("oats-quick-selyanochka-350", "grains", True, 350, "usda:173904", "5ka:Хлопья овсяные Селяночка №3 быстрого приготовления 350г, 350 мл", brand="Селяночка", note="в прайс-листе единица «350 мл» — опечатка источника, в названии 350 г")
add("oats-gerkules-rusprodukt-500", "grains", True, 500, "usda:173904", "5ka:Хлопья овсяные Русский Продукт Геркулес традиционный 500г, 500 г", brand="Русский Продукт")
add("flakes-buckwheat-selyanochka-400", "grains", True, 400, "usda:170685", "5ka:Хлопья гречневые Селяночка не требующие варки 400г, 400 г", brand="Селяночка")
add("flakes-5grain-selyanochka-400", "grains", True, 400, "usda:173904", "5ka:Хлопья Селяночка 5 злаков ржаные-овсяные-ячменные-пшеничные-гречневые не требующие варки 400г, 400 г", brand="Селяночка")
add("pasta-horns-shebekinskie-450", "grains", True, 450, "usda:168927", "5ka:Макароны Шебекинские рожок полубублик №202 450г, 450 г", brand="Шебекинские")
add("spaghetti-shebekinskie-450", "grains", True, 450, "usda:168927", "5ka:Спагетти Шебекинские №2 тонкие 450г, 450 г", brand="Шебекинские")
add("vermicelli-shebekinskie-450", "grains", True, 450, "usda:168927", "5ka:Вермишель Шебекинские №111 лёгкая 450г, 450 г", brand="Шебекинские")
add("pasta-vitki-makfa-450", "grains", True, 450, "usda:168927", "5ka:Макароны Makfa витки 450г, 450 г", brand="Makfa")
add("spaghetti-makfa-450", "grains", True, 450, "usda:168927", "5ka:Макароны Makfa Спагетти 450г, 450 г", brand="Makfa")
add("pasta-horns-baisad-450", "grains", True, 450, "usda:168927", "5ka:Изделия макаронные Baisad Рожки, 450г, 450 г", brand="Baisad")
add("pasta-penne-barilla-450", "grains", True, 450, "usda:168927", "5ka:Макаронные изделия Barilla Пенне Ригате №73 из твёрдых сортов пшеницы, 450г, 450 г", brand="Barilla")
add("pasta-chifferini-maltagliati-450", "grains", True, 450, "usda:168927", "5ka:Макароны Maltagliati Chifferini Rigati 450г, 450 г", brand="Maltagliati")
add("flour-wheat-selyanochka-2kg", "grains", True, 2000, "usda:169761", "5ka:Мука Селяночка пшеничная высшего сорта 2кг, 2 кг", brand="Селяночка")
add("flour-wheat-makfa-2kg", "grains", True, 2000, "usda:169761", "5ka:Мука Makfa пшеничная высший сорт 2кг, 2 кг", brand="Makfa")
add("flour-rye-selyanochka-1kg", "grains", True, 1000, "usda:168886", "5ka:Мука Селяночка ржаная хлебопекарная 1кг, 1 кг", brand="Селяночка")
add("flour-wholegrain-selyanochka-1kg", "grains", True, 1000, "usda:168893", "5ka:Мука Селяночка пшеничная хлебопекарная обойная 1кг, 1 кг", brand="Селяночка")
add("cornflakes-lyubyatovo-600", "grains", True, 600, "usda:174648", "5ka:Хлопья Любятово кукурузные 600г, 600 г", brand="Любятово")
add("crackers-fish-krasnaya-tsena-200", "grains", True, 200, "usda:171846", "5ka:Крекер Красная цена в форме рыбок, 200г, 200 г", brand="Красная цена")
add("noodles-instant-krasnaya-tsena-60", "grains", True, 60, "usda:171615", "5ka:Вермишель Красная Цена быстрого приготовления с куриным бульоном 60г, 60 г", brand="Красная цена")
add("sushki-krasnaya-tsena-250", "grains", True, 250, "usda:172746", "5ka:Сушки Красная цена простые 250 г, 250 г", brand="Красная цена")
add("bread-wheat-rosstat-400", "grains", False, 400, "usda:174924", "rw:Хлеб и булочные изделия из пшеничной муки различных сортов, кг|1",
    name="Хлеб пшеничный (батон), 400 г — средняя цена Росстата", brand="— (товарная группа Росстата)")
add("bread-rye-rosstat-700", "grains", False, 700, "usda:172684", "rw:Хлеб из ржаной муки и из смеси муки ржаной и пшеничной, кг|1",
    name="Хлеб ржаной / ржано-пшеничный, 700 г — средняя цена Росстата", brand="— (товарная группа Росстата)")

# legumes
add("peas-split-selyanochka-800", "legumes", True, 800, "usda:172428", "5ka:Горох Селяночка колотый шлифованный 800г, 800 г", brand="Селяночка")
add("peas-split-mistral-900", "legumes", True, 900, "usda:172428", "5ka:Горох Мистраль желтый колотый 900г, 900 г", brand="Мистраль")
add("lentils-red-gv-450", "legumes", True, 450, "usda:174284", "5ka:Чечевица Global Village красная 450г, 450 г", brand="Global Village")
add("lentils-green-gv-450", "legumes", True, 450, "usda:172420", "5ka:Чечевица Global Village зеленая 450г, 450 г", brand="Global Village")
add("mung-gv-450", "legumes", True, 450, "usda:174256", "5ka:Маш Global Village продовольственный 450г, 450 г", brand="Global Village")
add("beans-red-canned-krasnaya-tsena-360", "legumes", True, 360, "usda:175195", "5ka:Фасоль Красная Цена красная в собственном соку, 360г, 360 г", brand="Красная цена")
add("beans-red-canned-gv-400", "legumes", True, 400, "usda:175195", "5ka:Фасоль Global Village красная в собственном соку 400г, 425 мл", brand="Global Village", note="400 г нетто, банка 425 мл")
add("beans-dry-pea-rosstat-1kg", "legumes", True, 1000, "usda:172428", "rm:Горох и фасоль, кг|1",
    name="Горох и фасоль сухие, 1 кг — средняя цена Росстата", brand="— (товарная группа Росстата)", note="КБЖУ взяты как для колотого гороха")

# meat_fish
add("pollock-fillet-fishhouse-600", "meat_fish", False, 600, "usda:173725", "5ka:Минтай Fish House филе без кожи замороженное 600г, 600 г", brand="Fish House")
add("pollock-fillet-borealis-400", "meat_fish", False, 400, "usda:173725", "5ka:Минтай Borealis филе блочное без кожи без костей 400г, 400 г", brand="Borealis")
add("pink-salmon-fillet-polar-400", "meat_fish", False, 400, "usda:175138", "5ka:Горбуша дальневосточная Polar филе порционное замороженное 400г, 400 г", brand="Polar")
add("fish-sticks-fishhouse-350", "meat_fish", False, 350, "usda:173725", "5ka:Палочки рыбные Fish House в панировке 350г, 350 г", brand="Fish House")
add("fish-triangles-polar-300", "meat_fish", False, 300, "usda:173725", "5ka:Треугольники рыбные Polar в панировке 300г, 300 г", brand="Polar")
add("crab-sticks-krasnaya-tsena-200", "meat_fish", False, 200, "usda:173702", "5ka:Крабовые палочки Красная цена имитация замороженные 200г, 200 г", brand="Красная цена")
add("beef-patties-miratorg-400", "meat_fish", False, 400, "usda:174036", "5ka:Котлеты Мираторг из говядины 400г, 400 г", brand="Мираторг")
add("sausage-doktorskaya-vyazanka-370", "meat_fish", False, 370, "usda:172013", "5ka:Колбаса Вязанка Докторская вареная 370г, 370 г", brand="Вязанка")
add("sausage-boiled-papa-mozhet-400", "meat_fish", False, 400, "usda:172013", "5ka:Колбаса Папа может мясная вареная 400г, 400 г", brand="Папа может")
add("sosiski-slivushki-vyazanka-330", "meat_fish", False, 330, "usda:172968", "5ka:Сосиски Вязанка Сливушки 330г, 330 г", brand="Вязанка")
add("sosiski-molochnye-papa-mozhet-410", "meat_fish", False, 410, "usda:172968", "5ka:Сосиски Папа может Молочные вареные 410г, 410 г", brand="Папа может")
add("ham-turkey-papa-mozhet-300", "meat_fish", False, 300, "usda:173864", "5ka:Ветчина Папа может с индейкой, 300г, 300 г", brand="Папа может")
add("chicken-whole-rosstat-1kg", "meat_fish", False, 1000, "usda:171447:refuse", "rw:Куры охлажденные и мороженые, кг|1",
    name="Курица (тушка) охлаждённая/мороженая, 1 кг — средняя цена Росстата", brand="— (товарная группа Росстата)")
add("chicken-legs-rosstat-1kg", "meat_fish", False, 1000, "usda:172378:refuse", "rm:Окорочка куриные, кг|1",
    name="Окорочка куриные, 1 кг — средняя цена Росстата", brand="— (товарная группа Росстата)")
add("canned-fish-tomato-rosstat-250", "meat_fish", True, 250, "usda:175139", "rm:Консервы рыбные в томатном соусе, кг|1",
    name="Консервы рыбные в томатном соусе (килька, бычки и т. п.), банка 250 г — средняя цена Росстата", brand="— (товарная группа Росстата)")
add("eggs-c1-rosstat-10", "meat_fish", False, 550, "usda:171287:refuse", "rw:Яйца куриные, 10 шт.|10",
    name="Яйца куриные, 10 шт. — средняя цена Росстата", brand="— (товарная группа Росстата)",
    note="вес 550 г = 10 яиц по 55 г со скорлупой (наше допущение); КБЖУ на 100 г «как продаётся», скорлупа 12% вычтена")

# dairy
add("milk-past-rosstat-1l", "dairy", False, round(1000 * DENS["milk"]), "usda:171265", "rw:Молоко питьевое цельное пастеризованное 2,5-3,2% жирности, л|1",
    name="Молоко пастеризованное 2,5–3,2%, 1 л — средняя цена Росстата", brand="— (товарная группа Росстата)", note="1 л ≈ 1030 г (плотность 1,03 — допущение)")
add("milk-uht-rosstat-1l", "dairy", True, round(1000 * DENS["milk"]), "usda:171265", "rw:Молоко питьевое цельное ультрапастеризованное 2,5-3,2% жирности, л|1",
    name="Молоко ультрапастеризованное 2,5–3,2%, 1 л — средняя цена Росстата", brand="— (товарная группа Росстата)", note="1 л ≈ 1030 г (плотность 1,03 — допущение); хранится без холода до вскрытия")
add("kefir-rosstat-1kg", "dairy", False, 1000, "usda:170904", "rw:Кефир, кг|1",
    name="Кефир, 1 кг — средняя цена Росстата", brand="— (товарная группа Росстата)")
add("sour-cream-rosstat-300", "dairy", False, 300, "usda:171257", "rw:Сметана, кг|1",
    name="Сметана, 300 г — средняя цена Росстата", brand="— (товарная группа Росстата)")
add("tvorog-rosstat-200", "dairy", False, 200, "usda:172179", "rw:Творог, кг|1",
    name="Творог, 200 г — средняя цена Росстата", brand="— (товарная группа Росстата)")
add("yogurt-bio-sarafanovo-260", "dairy", False, 260, "usda:170889", "5ka:Биойогурт Сарафаново Черника 2% БЗМЖ 260г, 260 г", brand="Сарафаново")
add("tvorog-kids-frutonyanya-90", "dairy", False, 90, "usda:172180", "5ka:Творог ФрутоНяня Лесные ягоды с 6 мес. 4.2% БЗМЖ 90г, 90 г", brand="ФрутоНяня")

# veg_fruit
add("broccoli-frozen-gv-400", "veg_fruit", False, 400, "usda:169968", "5ka:Капуста брокколи Global Village замороженная 400 г, 400 г", brand="Global Village")
add("cauliflower-frozen-gv-400", "veg_fruit", False, 400, "usda:170398", "5ka:Капуста цветная Global Village замороженная 400г, 400 г", brand="Global Village")
add("green-beans-frozen-gv-400", "veg_fruit", False, 400, "usda:169962", "5ka:Фасоль Global Village стручковая замороженная 400 г, 400 г", brand="Global Village")
add("veg-mix-hawaii-gv-400", "veg_fruit", False, 400, "usda:170471", "5ka:Смесь Global Village Овощная Гавайская 400г, 400 г", brand="Global Village")
add("veg-mix-village-gv-400", "veg_fruit", False, 400, "usda:170471", "5ka:Смесь овощная Global Village Овощи По-Деревенски быстрозамороженная 400г, 400 г", brand="Global Village")
add("veg-mix-mexican-gv-400", "veg_fruit", False, 400, "usda:170471", "5ka:Смесь овощная Global Village мексиканская 400г, 400 г", brand="Global Village")
add("veg-mix-8-gv-400", "veg_fruit", False, 400, "usda:170471", "5ka:Смесь овощная Global Village 8 Овощей быстрозамороженная 400г, 400 г", brand="Global Village")
add("potato-fries-frozen-krasnaya-tsena-700", "veg_fruit", False, 700, "usda:170523", "5ka:Картофель Красная цена замороженный для жарки 700г, 700 г", brand="Красная цена")
add("fruit-mix-frozen-krasnaya-tsena-300", "veg_fruit", False, 300, "usda:171718", "5ka:Ассорти Красная Цена компотное быстрозамороженное 300г, 300 г", brand="Красная цена", note="КБЖУ взяты как для замороженной вишни (близкий справочный аналог)")
add("cherry-frozen-gv-300", "veg_fruit", False, 300, "usda:171718", "5ka:Вишня Global Village без косточки замороженная 300г, 300 г", brand="Global Village")
add("peas-green-canned-gv-400", "veg_fruit", True, 400, "usda:170421", "5ka:Горошек Global Village зеленый из мозговых сортов 400г, 400 г", brand="Global Village")
add("peas-green-canned-gv-selection-400", "veg_fruit", True, 400, "usda:170421", "5ka:Горошек Global Village Selection зеленый 400г, 400 г", brand="Global Village")
add("tomato-paste-krasnaya-tsena-500", "veg_fruit", True, 500, "usda:170459", "5ka:Паста томатная Красная цена 500г, 500 г", brand="Красная цена")
add("tomato-paste-gv-270", "veg_fruit", True, 270, "usda:170459", "5ka:Томатная паста Global Village 270г, 270 г", brand="Global Village")
add("juice-apple-sady-pridonya-1l", "veg_fruit", True, round(1000 * DENS["juice"]), "usda:173933", "5ka:Сок Сады Придонья яблочный прямого отжима 1л, 1 л", brand="Сады Придонья", note="1 л ≈ 1040 г (плотность 1,04 — допущение)")
add("juice-apple-frutonyanya-200", "veg_fruit", True, round(200 * DENS["juice"]), "usda:170959", "5ka:Сок ФрутоНяня яблочный без сахара осветленный 200мл, 200 мл", brand="ФрутоНяня", note="200 мл ≈ 208 г (плотность 1,04 — допущение)")
add("dates-mixbar-200", "veg_fruit", True, 200, "usda:171726", "5ka:Финики Mixbar 200г, 200 г", brand="Mixbar")
add("prunes-mixbar-200", "veg_fruit", True, 200, "usda:168162", "5ka:Чернослив MixBar без косточки 200г, 200 г", brand="Mixbar")
add("potato-rosstat-1kg", "veg_fruit", False, 1000, "usda:170026:refuse", "rw:Картофель, кг|1",
    name="Картофель, 1 кг — средняя цена Росстата", brand="— (товарная группа Росстата)")
add("carrot-rosstat-1kg", "veg_fruit", False, 1000, "usda:170393:refuse", "rw:Морковь, кг|1",
    name="Морковь, 1 кг — средняя цена Росстата", brand="— (товарная группа Росстата)")
add("onion-rosstat-1kg", "veg_fruit", False, 1000, "usda:170000:refuse", "rw:Лук репчатый, кг|1",
    name="Лук репчатый, 1 кг — средняя цена Росстата", brand="— (товарная группа Росстата)")
add("cabbage-rosstat-1kg", "veg_fruit", False, 1000, "usda:169975:refuse", "rw:Капуста белокочанная свежая, кг|1",
    name="Капуста белокочанная, 1 кг — средняя цена Росстата", brand="— (товарная группа Росстата)")
add("beet-rosstat-1kg", "veg_fruit", False, 1000, "usda:169145:refuse", "rw:Свёкла столовая, кг|1",
    name="Свёкла столовая, 1 кг — средняя цена Росстата", brand="— (товарная группа Росстата)")
add("bananas-rosstat-1kg", "veg_fruit", False, 1000, "usda:173944:refuse", "rw:Бананы, кг|1",
    name="Бананы, 1 кг — средняя цена Росстата", brand="— (товарная группа Росстата)")
add("cucumbers-rosstat-1kg", "veg_fruit", False, 1000, "usda:168409:refuse", "rw:Огурцы свежие, кг|1",
    name="Огурцы свежие, 1 кг — средняя цена Росстата", brand="— (товарная группа Росстата)")
add("tomatoes-rosstat-1kg", "veg_fruit", False, 1000, "usda:170457:refuse", "rw:Помидоры свежие, кг|1",
    name="Помидоры свежие, 1 кг — средняя цена Росстата", brand="— (товарная группа Росстата)")

# oils
for id_, w_ml, title, brand in [
    ("oil-sunflower-selyanochka-1l", 1000, "Масло Селяночка подсолнечное рафинированное дезодорированное 1л, 1 л", "Селяночка"),
    ("oil-sunflower-zolotaya-semechka-1l", 1000, "Масло Золотая семечка подсолнечное рафинированное 1л, 1 л", "Золотая семечка"),
    ("oil-sunflower-zolotaya-semechka-1800", 1800, "Масло подсолнечное Золотая семечка рафинированное 1.8л, 1.8 л", "Золотая семечка"),
    ("oil-sunflower-zolotaya-semechka-500", 500, "Масло Золотая Семечка подсолнечное рафинированное 500мл, 500 мл", "Золотая семечка"),
    ("oil-sunflower-sloboda-1800", 1800, "Масло подсолнечное Слобода рафинированное 1.8л, 1.8 л", "Слобода"),
    ("oil-sunflower-olive-sloboda-1l", 1000, "Масло подсолнечное Слобода с добавлением оливкового 1л, 1 л", "Слобода"),
    ("oil-sunflower-krasnaya-tsena-900", 900, "Масло Красная цена подсолнечное рафинированное 900мл, 900 мл", "Красная цена"),
    ("oil-sunflower-blago-1l", 1000, "Масло Благо подсолнечное рафинированное вымороженное 1л, 1 л", "Благо"),
    ("oil-sunflower-olive-altero-810", 810, "Масло Altero подсолнечное с добавлением оливкового 810мл, 810 мл", "Altero"),
]:
    add(id_, "oils", True, round(w_ml * DENS["oil"]), "usda:171025", "5ka:" + title, brand=brand, note=f"{w_ml} мл ≈ {round(w_ml * DENS['oil'])} г (плотность 0,92 — допущение)")
add("oil-olive-gv-250", "oils", True, round(250 * DENS["oil"]), "usda:171413", "5ka:Масло оливковое Global Village 250мл, 250 мл", brand="Global Village", note="250 мл ≈ 230 г (плотность 0,92 — допущение)")
add("margarine-rosstat-250", "oils", False, 250, "usda:171018", "rw:Маргарин, кг|1",
    name="Маргарин, 250 г — средняя цена Росстата", brand="— (товарная группа Росстата)")

# sugar_sweets
add("sugar-rosstat-1kg", "sugar_sweets", True, 1000, "usda:169655", "rw:Сахар-песок, кг|1",
    name="Сахар-песок, 1 кг — средняя цена Росстата", brand="— (товарная группа Росстата)")
add("sugar-cane-gv-500", "sugar_sweets", True, 500, "usda:168833", "5ka:Сахар Global Village тростниковый кусковой нерафинированный 500г, 500 г", brand="Global Village")
add("cookies-maria-krasnaya-tsena-300", "sugar_sweets", True, 300, "usda:172819", "5ka:Печенье Красная Цена Мария затяжное 300г, 300 г", brand="Красная цена")
add("cookies-oat-krasnaya-tsena-400", "sugar_sweets", True, 400, "usda:172725", "5ka:Печенье Красная Цена овсяное 400г, 400 г", brand="Красная цена")
add("cookies-oat-posidelkino-320", "sugar_sweets", True, 320, "usda:172725", "5ka:Печенье Посиделкино Овсяное классическое 320г, 320 г", brand="Посиделкино")
add("cookies-yubileynoe-112", "sugar_sweets", True, 112, "usda:172819", "5ka:Печенье Юбилейное Традиционное витаминизированное 112г, 112 г", brand="Юбилейное")
add("cookies-maria-lyubyatovo-156", "sugar_sweets", True, 156, "usda:172819", "5ka:Печенье Любятово Мария традиционное затяжное 156г, 156 г", brand="Любятово")
add("gingerbread-krasnaya-tsena-400", "sugar_sweets", True, 400, "usda:174956", "5ka:Пряники Красная Цена 400г, 400 г", brand="Красная цена")
add("zefir-krasnaya-tsena-180", "sugar_sweets", True, 180, "usda:167995", "5ka:Зефир Красная Цена ванильный 180г, 180 г", brand="Красная цена")
add("pastila-krasnaya-tsena-180", "sugar_sweets", True, 180, "usda:167995", "5ka:Пастила Красная Цена со вкусом ванили 180г, 180 г", brand="Красная цена")
add("halva-krasnaya-tsena-250", "sugar_sweets", True, 250, "usda:167996", "5ka:Халва Красная цена Подсолнечная 250г, 250 г", brand="Красная цена")
add("wafers-krasnaya-tsena-200", "sugar_sweets", True, 200, "usda:172819", "5ka:Вафли Красная цена со вкусом сливок 200г, 200 г", brand="Красная цена")
add("roll-sponge-krasnaya-tsena-200", "sugar_sweets", True, 200, "usda:172706", "5ka:Рулет бисквитный Красная Цена клубничный 200г, 200 г", brand="Красная цена")
add("rusks-vanilla-krasnaya-tsena-350", "sugar_sweets", True, 350, "usda:172819", "5ka:Сухари Красная цена Ванильные 350г, 350 г", brand="Красная цена")
add("candies-milk-krasnaya-tsena-100", "sugar_sweets", True, 100, "usda:167990", "5ka:Конфеты Красная цена Молочные, Цена за 100 г", brand="Красная цена", note="весовой товар, цена за 100 г")
add("caramel-barbaris-rot-front-100", "sugar_sweets", True, 100, "usda:167990", "5ka:Карамель Рот Фронт Барбарис, Цена за 100 г", brand="Рот Фронт", note="весовой товар, цена за 100 г")
add("chocolate-alenka-15", "sugar_sweets", True, 15, "usda:167587", "5ka:Шоколад молочный Алёнка 15г, 15 г", brand="Алёнка")
add("chocolate-alenka-150", "sugar_sweets", True, 150, "usda:167587", "5ka:Шоколад Аленка Молочный 150г, 150 г", brand="Алёнка")
add("marmalade-sharliz-300", "sugar_sweets", True, 300, "usda:167989", "5ka:Мармелад Шарлиз Ассорти дольки желейный 300г, 300 г", brand="Шарлиз")
add("jam-forest-berries-maheev-300", "sugar_sweets", True, 300, "usda:169641", "5ka:Джем Махеевъ Лесные ягоды 300г, 300 г", brand="Махеевъ")
add("candies-slivochnye-azovskaya-400", "sugar_sweets", True, 400, "usda:167990", "5ka:Конфеты Азовская КФ Сливочные 400г, 400 г", brand="Азовская КФ")

# other
add("peanuts-krasnaya-tsena-250", "other", True, 250, "usda:174262", "5ka:Арахис Красная цена бланшированный жареный соленый 250г, 250 г", brand="Красная цена")
add("peanuts-krasnaya-tsena-80", "other", True, 80, "usda:174262", "5ka:Ядра арахиса Красная цена жареные соленые 80г, 80 г", brand="Красная цена")
add("peanuts-mixbar-150", "other", True, 150, "usda:174262", "5ka:Арахис Mixbar жареный соленый 150г, 150 г", brand="Mixbar")
add("walnuts-krasnaya-tsena-100", "other", True, 100, "usda:170187", "5ka:Орех Красная цена грецкий 100 г, 100 г", brand="Красная цена")
add("cashew-krasnaya-tsena-100", "other", True, 100, "usda:169421", "5ka:Кешью Красная цена жареный 100г, 100 г", brand="Красная цена")
add("almonds-krasnaya-tsena-100", "other", True, 100, "usda:168596", "5ka:Ядра миндаля Красная цена жареные 100г, 100 г", brand="Красная цена")
add("sunflower-seeds-krasnaya-tsena-100", "other", True, 100, "usda:169417:refuse", "5ka:Семена Красная Цена подсолнечные жареные 100г, 100 г", brand="Красная цена",
    note="семечки в шелухе: КБЖУ ядра уменьшены на долю шелухи по USDA SR28")
add("sunflower-kernels-mixbar-70", "other", True, 70, "usda:169418", "5ka:Ядра Mixbar подсолнечника жареные с морской солью 70г, 70 г", brand="Mixbar")
add("pistachios-krasnaya-tsena-100", "other", True, 100, "usda:169426:refuse", "5ka:Фисташки Красная цена неочищенные жареные соленые 100г, 100 г", brand="Красная цена",
    note="фисташки в скорлупе: КБЖУ ядра уменьшены на долю скорлупы по USDA SR28")
add("nuts-dried-fruit-mix-krasnaya-tsena-100", "other", True, 100, "usda:167561", "5ka:Смесь Красная Цена Сухофрукты и орехи 100г, 100 г", brand="Красная цена", note="КБЖУ — типичная смесь сухофруктов и орехов из справочника USDA («Snacks, trail mix, regular»); состав этой смеси неизвестен")
add("tea-black-bags-rosstat-25", "other", True, 50, "zero:чай заваривают; энергия чашки ≈ 1 ккал (USDA FDC 173227 «Beverages, tea, black, brewed»: 1 ккал/100 г), в расчёте принят 0",
    "rm:Чай черный байховый пакетированный, 25 пакетиков|25",
    name="Чай чёрный байховый в пакетиках, 25 пак. — средняя цена Росстата", brand="— (товарная группа Росстата)",
    note="вес 50 г = 25 пакетиков по 2 г (допущение)")

# extra price tiers / variety
add("rice-plov-natsional-900", "grains", True, 900, "usda:169756", "5ka:Рис Националь для плова 900г, 900 г", brand="Националь")
add("oats-monastyrsky-rusprodukt-500", "grains", True, 500, "usda:173904", "5ka:Хлопья овсяные Русский Продукт Геркулес Монастырский 500г, 500 г", brand="Русский Продукт")
add("rice-long-agro-alyans-900", "grains", True, 900, "usda:169756", "5ka:Рис Агро-альянс Экстра Элитный длиннозерный 900г, 900 г", brand="Агро-Альянс")
add("flour-wheat-makfa-1kg", "grains", True, 1000, "usda:169761", "5ka:Мука Makfa Пшеничная высший сорт 1кг, 1 кг", brand="Makfa")
add("semolina-shebekinskaya-500", "grains", True, 500, "usda:168933", "5ka:Манка Шебекинская из твердой пшеницы 500г, 500 г", brand="Шебекинские")
add("spaghetti-red-lentil-federici-250", "legumes", True, 250, "usda:174284", "5ka:Спагетти Federici №3 без глютена из красной чечевицы 250г, 250 г", brand="Federici",
    note="КБЖУ взяты как для красной чечевицы (паста из чечевичной муки) — справочный аналог")
add("hake-fillet-fishhouse-600", "meat_fish", False, 600, "usda:171955", "5ka:Хек Fish House медальон филе без кожи замороженный 600г, 600 г", brand="Fish House",
    note="КБЖУ взяты как для трески (в справочнике USDA SR Legacy хека нет; треска — близкий аналог)")
add("sausage-molokusha-vyazanka-450", "meat_fish", False, 450, "usda:172013", "5ka:Колбаса Вязанка Молокуша вареная 450г, 450 г", brand="Вязанка")
add("veg-mix-italian-miratorg-400", "veg_fruit", False, 400, "usda:170471", "5ka:Смесь овощная Мираторг Итальянская замороженная 400г, 400 г", brand="Мираторг")
add("juice-pumpkin-apple-sady-pridonya-1l", "veg_fruit", True, round(1000 * DENS["juice"]), "usda:173933", "5ka:Сок Сады Придонья Тыква-яблоко с мякотью восстановленный 1л, 1 л", brand="Сады Придонья",
    note="1 л ≈ 1040 г (плотность 1,04 — допущение); КБЖУ взяты как для яблочного сока — справочный аналог")
add("cookies-yubileynoe-oat-224", "sugar_sweets", True, 224, "usda:172725", "5ka:Печенье Юбилейное с овсяными хлопьями 224г, 224 г", brand="Юбилейное")

# Label nutrition from Open Food Facts where a product of the same brand was found (reviewed by hand).
# "same" = same brand and product type; "comparable" = a similar product (other pack, flavour or brand).
LABEL = {
    "buckwheat-selyanochka-900": "off:4603554001620:comparable",   # Селяночка «Гречневая крупа» 900 г (в OFF без «пропаренная»)
    "buckwheat-uvelka-500": "off:4607016245485:comparable",        # Увелка гречневая 5×80 г
    "rice-round-uvelka-500": "off:4607016245515:comparable",       # Увелка круглозерный 400 г
    "rice-bags-selyanochka-400": "off:4607072716516:same",
    "rice-round-selyanochka-900": "off:4607072716516:comparable",  # тот же рис Селяночка, в пакетиках
    "rice-brown-gv-800": "off:4606038097232:same",
    "semolina-selyanochka-800": "off:4606038084713:same",
    "oats-gerkules-selyanochka-500": "off:4607072712969:same",
    "oats-quick-selyanochka-350": "off:4607072712969:comparable",  # Геркулес Селяночка, не №3
    "oats-gerkules-rusprodukt-500": "off:4602112100393:same",
    "flakes-buckwheat-selyanochka-400": "off:4606038061820:same",
    "flakes-5grain-selyanochka-400": "off:4610082862012:same",
    "flour-wheat-selyanochka-2kg": "off:4606038070150:comparable",  # Селяночка мука хлебопекарная 1 кг
    "cornflakes-lyubyatovo-600": "off:4610003253004:comparable",
    "noodles-instant-krasnaya-tsena-60": "off:4600545625100:comparable",  # тот же бренд, с говяжьим бульоном
    "sushki-krasnaya-tsena-250": "off:4627104524100:same",
    "lentils-red-gv-450": "off:4607016248349:same",
    "beans-red-canned-krasnaya-tsena-360": "off:4630055870127:same",
    "beef-patties-miratorg-400": "off:4606471150013:same",
    "sosiski-slivushki-vyazanka-330": "off:4607091383256:same",
    "sosiski-molochnye-papa-mozhet-410": "off:4607958074624:comparable",  # Папа может «Сосиски фирменные»
    "sausage-boiled-papa-mozhet-400": "off:4607958074471:comparable",     # Папа может «Колбаса варёная фирменная»
    "ham-turkey-papa-mozhet-300": "off:4680115887664:comparable",         # Вязанка «Ветчина Сливушка с индейкой»
    "veg-mix-italian-miratorg-400": "off:4607106443845:same",
    "cherry-frozen-gv-300": "off:4620119951664:same",
    "tomato-paste-krasnaya-tsena-500": "off:4650598800092:same",
    "cookies-maria-krasnaya-tsena-300": "off:4607129806771:same",
    "cookies-oat-posidelkino-320": "off:4607011262302:same",
    "cookies-yubileynoe-112": "off:7622202204371:comparable",
    "cookies-yubileynoe-oat-224": "off:7622202204319:same",
    "halva-krasnaya-tsena-250": "off:4620004251244:same",
    "jam-forest-berries-maheev-300": "off:4604248013240:same",
    "peanuts-krasnaya-tsena-250": "off:4650069675495:comparable",  # КЦ «Арахис жареный солёный», вес не указан
    "peanuts-krasnaya-tsena-80": "off:4650069675495:comparable",
    "canned-fish-tomato-rosstat-250": "off:4607175486545:comparable",  # «Килька в томатном соусе» Красная цена 240 г
    "sour-cream-rosstat-300": "off:4610030034171:comparable",          # «Сметана 15%» Красная цена
    "kefir-rosstat-1kg": "off:4607011840258:comparable",               # «Кефир 1%» Красная цена
    "bread-wheat-rosstat-400": "off:4620021166033:comparable",         # «Хлеб белый» Красная цена 300 г
    "oil-sunflower-blago-1l": "off:4607014786447:same",
    "oil-sunflower-zolotaya-semechka-1l": "off:4680001220025:same",
    "oil-sunflower-zolotaya-semechka-1800": "off:4680001220025:same",
    "oil-sunflower-zolotaya-semechka-500": "off:4680001220025:same",
    "crab-sticks-krasnaya-tsena-200": "off:4610101146710:comparable",  # Vici; у карточек «Красной цены» в OFF нет белка
    "buckwheat-mistral-900": "off:4601916000502:same",
    "buckwheat-mistral-bags-400": "off:4601916007082:same",
    "oil-sunflower-sloboda-1800": "off:4600699502494:same",
    "candies-milk-krasnaya-tsena-100": "off:4607138021325:comparable",  # «Бековские молочные конфеты»
    "sausage-doktorskaya-vyazanka-370": "off:4680115882539:same",
    "sausage-molokusha-vyazanka-450": "off:4680115881303:same",
}
for s_ in S:
    if s_["id"] in LABEL:
        s_["nutr"] = LABEL[s_["id"]]

# Real Пятёрочка prices from the short price list of the store in д. Давыдово (Московская обл.), added 2026-11-24
# to replace Росстат averages for shelf-stable animal protein, cheese, butter and some fresh items.
SPRAT = "off:4607029234933:comparable"   # «Шпроты в масле из балтийской кильки» (Sweet life) — у этих шпрот своей этикетки в OFF нет
SAIRA = "4607075851306"                  # «Сайра Тихоокеанская натуральная» 5 морей 250 г
add("sprats-fishhouse-240", "meat_fish", True, 240, SPRAT, "5ka:Шпроты Fish House из салаки в масле 240г", brand="Fish House")
add("sprats-za-rodinu-270", "meat_fish", True, 270, SPRAT, "5ka:Шпроты За Родину тушки из балтийской кильки в масле 270г", brand="За Родину")
add("sprats-kapitan-nord-175", "meat_fish", True, 175, SPRAT, "5ka:Шпроты Капитан Норд из балтийской кильки в масле, 175г", brand="Капитан Норд",
    name="Шпроты Капитан Норд из балтийской кильки в масле, 175г")
add("saury-5-morey-250", "meat_fish", True, 250, f"off:{SAIRA}:same", "5ka:Сайра 5 Морей тихоокеанская натуральная 250г", brand="5 Морей")
add("saury-fishhouse-240", "meat_fish", True, 240, f"off:{SAIRA}:comparable", "5ka:Сайра Fish House тихоокеанская натуральная 240г", brand="Fish House")
add("mackerel-natural-fishhouse-240", "meat_fish", True, 240, f"off:{SAIRA}:comparable", "5ka:Скумбрия Fish House атлантическая натуральная с добавлением масла 240г", brand="Fish House",
    note="КБЖУ взяты с этикетки сайры натуральной (близкий тип консервов); этикетки скумбрии в доступных источниках нет")
add("pink-salmon-canned-dobroflot-245", "meat_fish", True, 245, "usda:173690", "5ka:Горбуша Доброфлот натуральная 245г", brand="Доброфлот")
add("beef-stewed-belrosprod-338", "meat_fish", True, 338, "off:0099990000595:comparable", "5ka:Говядина БелРосПрод тушеная 338г", brand="БелРосПрод")
add("turkey-stewed-myasnaya-ferma-325", "meat_fish", True, 325, "off:0099990000595:comparable", "5ka:Индейка Мясная Ферма тушеная 325г", brand="Мясная Ферма",
    note="КБЖУ взяты с этикетки говяжьей тушёнки (тот же тип консервов); этикетки этой индейки нет, а справочник USDA (FDC 171101, мясо без жира) дал бы белок 23,7 г — вероятно завышенный для тушёнки")
add("condensed-milk-stantsiya-360", "dairy", True, 360, "usda:171275", "5ka:Сгущенное молоко Станция Молочная цельное с сахаром 8.5% БЗМЖ 360г", brand="Станция Молочная")
add("butter-vkusnoteevo-725-180", "dairy", False, 180, "usda:173430", "5ka:Масло сливочное Вкуснотеево Крестьянское 72.5% БЗМЖ 180г", brand="Вкуснотеево",
    note="на упаковке 72,5% жира, в справочнике USDA 81% — жир и ккал завышены примерно на 10%")
add("butter-ekoniva-725-180", "dairy", False, 180, "usda:173430", "5ka:Масло сливочное ЭкоНива Крестьянское 72.5% БЗМЖ 180г", brand="ЭкоНива",
    note="на упаковке 72,5% жира, в справочнике USDA 81% — жир и ккал завышены примерно на 10%")
add("butter-vkusnoteevo-825-180", "dairy", False, 180, "usda:173430", "5ka:Масло сливочное Вкуснотеево Традиционное 82.5% БЗМЖ 180г", brand="Вкуснотеево")
add("cheese-belebeevsky-190", "dairy", False, 190, "usda:171241", "5ka:Сыр Белебеевский Классический полутвердый 45% БЗМЖ 190г", brand="Белебеевский")
add("cheese-ekoniva-shchuchansky-200", "dairy", False, 200, "usda:171241", "5ka:Сыр полутвердый ЭкоНива Щучанский 50% БЗМЖ 200г", brand="ЭкоНива")
add("cheese-liebendorf-grated-200", "dairy", False, 200, "usda:171241", "5ka:Сыр LiebenDorf Голландский твердый тертый 45% БЗМЖ 200г", brand="LiebenDorf")
add("mince-pork-beef-miratorg-400", "meat_fish", False, 400, "off:4670002944600:same", "5ka:Фарш Мираторг свино-говяжий домашний 400г", brand="Мираторг")
add("mince-beef-restoria-400", "meat_fish", False, 400, "usda:174036", "5ka:Фарш говяжий Рестория 400г", brand="Рестория")
add("apples-gala-gv-1kg", "veg_fruit", False, 1000, "usda:171688:refuse", "5ka:Яблоки Global Village Роял Гала, Цена за 1 кг", brand="Global Village", note="весовой товар, цена за 1 кг")
add("oranges-gv-1kg", "veg_fruit", False, 1000, "usda:169097:refuse", "5ka:Апельсины Global Village отборные, Цена за 1 кг", brand="Global Village", note="весовой товар, цена за 1 кг")
add("bread-grain-kolomenskoe-300", "grains", False, 300, "usda:168013", "5ka:Хлеб Коломенское Даниловский зерновой 300г", brand="Коломенское")

# ---------------------------------------------------------------------------
# Resolve prices and nutrition
# ---------------------------------------------------------------------------
WEEKLY_URL = "https://rosstat.gov.ru/storage/mediabank/Nedel_sred_cen.xlsx (копия Internet Archive от 27.09.2026: https://web.archive.org/web/20260927134507/https://rosstat.gov.ru/storage/mediabank/Nedel_sred_cen.xlsx)"
MONTHLY_URL = "https://rosstat.gov.ru/storage/mediabank/sred_potreb_cen_2025.xlsx (копия Internet Archive от 28.04.2026: https://web.archive.org/web/20260428050407/https://rosstat.gov.ru/storage/mediabank/sred_potreb_cen_2025.xlsx)"


def r2(x):
    return round(x + 1e-9, 2)


def price_5ka(title):
    by_store = U["items"].get(title)
    if not by_store:
        sys.exit(f"title not in price list: {title}")
    cnt = collections.Counter(by_store.values())
    top = max(cnt.values())
    price = max(p for p, c in cnt.items() if c == top)  # most frequent; tie -> higher (does not flatter the basket)
    stores = sorted(by_store)
    in_mo = [s for s in stores if not U["addr"][s].startswith("Moscow,")]
    where = "Москва" if not in_mo else ("Московская обл." if len(in_mo) == len(stores) else "Москва и Московская обл.")
    seen_in = "; ".join(STORE_ADDR.get(s, U["addr"][s]) for s in stores if by_store[s] == price)
    others = sorted(set(by_store.values()) - {price})
    prov = (f"цена: прайс-лист «Пятёрочки» на Яндекс Картах (источник — Едадил, обновлён 07.10.2026); "
            f"{price} ₽ — самая частая цена среди просмотренных магазинов ({len(stores)} шт., {where}); такая цена в: {seen_in}"
            + (f"; другие цены: {', '.join(str(o) for o in others)}" if others else ""))
    return price, prov


def price_rosstat(spec, weight_g, unit_note):
    kind, rest = spec.split(":", 1)
    name, unit = rest.rsplit("|", 1)
    unit = float(unit)
    table, label, url = (WEEKLY, "средняя потребительская цена по РФ на 21.09.2026 (еженедельная регистрация)", WEEKLY_URL) if kind == "rw" \
        else (DEC2025, "средняя потребительская цена по РФ за декабрь 2025", MONTHLY_URL)
    if name not in table or not isinstance(table[name], (int, float)):
        sys.exit(f"Rosstat name not found: {name}")
    per_unit = table[name]
    if name.endswith(", кг") or name.endswith(", л"):
        qty = weight_g / 1000 if name.endswith(", кг") else 1.0  # litre items are sold as exactly 1 l here
        price = r2(per_unit * qty)
        calc = f"{per_unit} ₽ за {'кг' if name.endswith(', кг') else 'л'}" + (f" × {qty:g} кг" if name.endswith(", кг") and qty != 1 else "")
    else:
        price = r2(per_unit)
        calc = f"{per_unit} ₽ за {name.rsplit(', ', 1)[1]}"
    prov = (f"цена: Росстат, «{name}» — {label}: {calc} = {price} ₽. Это НЕ цена конкретного товара «Пятёрочки», "
            f"а средняя по всем магазинам страны; источник: {url}")
    return price, prov


def nutrition(spec):
    kind, rest = spec.split(":", 1)
    if kind == "zero":
        return {"kcal": 0, "protein_g": 0, "fat_g": 0, "carb_g": 0}, f"КБЖУ: {rest}", "none"
    if kind == "usda":
        parts = rest.split(":")
        f = SR[parts[0]]
        per = {k: f[k] for k in ("kcal", "protein_g", "fat_g", "carb_g")}
        txt = f"КБЖУ: справочник USDA FoodData Central, SR Legacy, FDC {parts[0]} «{f['desc']}» — общий справочник, не этикетка этого товара"
        if len(parts) > 1 and parts[1] == "refuse":
            ref = REF[parts[0]]
            share = 1 - float(ref["refuse"]) / 100
            per = {k: v * share for k, v in per.items()}
            txt += f"; пересчитано на 100 г «как продаётся»: × {share:.2f} (несъедобная часть {ref['refuse']}% — {ref['ref_desc']}, USDA SR28)"
        return {k: round(v, 1) for k, v in per.items()}, txt, "reference_table"
    if kind == "off":
        code, how = rest.split(":")
        p = OFF[code]
        n = p["nutriments"]
        per = {"kcal": n["energy-kcal_100g"], "protein_g": n["proteins_100g"], "fat_g": n["fat_100g"], "carb_g": n.get("carbohydrates_100g")}
        nm = p.get("product_name") or p.get("product_name_ru")
        carb_note = ""
        if per["carb_g"] is None:  # canned fish labels often omit carbs; accept 0 only if the label's kcal equals 4P+9F
            assert abs(per["kcal"] - 4 * per["protein_g"] - 9 * per["fat_g"]) <= 0.03 * per["kcal"], code
            per["carb_g"] = 0
            carb_note = "; углеводы на этикетке не указаны, приняты 0 (калорийность этикетки равна 4·Б + 9·Ж)"
        if how == "same":
            txt = f"КБЖУ: этикетка этого товара по базе Open Food Facts (штрихкод {code}, «{nm}», {p.get('brands')}; данные внесены пользователями базы){carb_note}"
            basis = "label_same_product"
        else:
            txt = f"КБЖУ: этикетка похожего товара по базе Open Food Facts (штрихкод {code}, «{nm}», {p.get('brands')}) — не этикетка этого товара{carb_note}"
            basis = "label_comparable_product"
        return {k: round(float(v), 1) for k, v in per.items()}, txt, basis
    sys.exit(f"bad nutrition spec {spec}")


items, seen = [], set()
for s in S:
    assert s["id"] not in seen, s["id"]; seen.add(s["id"])
    kind, key = s["src"].split(":", 1)
    ex = s["extra"]
    if kind == "5ka":
        price, pprov = price_5ka(key)
        name = key.rsplit(", ", 1)[0] if ", " in key and key.rsplit(", ", 1)[1][:1].isdigit() else key
        url = U["urls"].get(key)
        basis = "5ka_shelf"
    else:
        price, pprov = price_rosstat(s["src"], s["weight_g"], ex.get("note"))
        name = ex["name"]
        url = (WEEKLY_URL if kind == "rw" else MONTHLY_URL).split(" ")[0]
        basis = "rosstat_avg"
    per, nprov, nbasis = nutrition(s["nutr"])
    # animal_protein: protein essentially of animal origin (meat, fish, eggs, dairy). Mixed products -> false + note.
    animal = ex.get("animal", s["group"] in ("meat_fish", "dairy"))
    if ex.get("animal_note"):
        nprov += "; " + ex["animal_note"]
    item = {
        "id": s["id"], "name": ex.get("name", name), "brand": ex.get("brand", ""), "price_rub": price,
        "weight_g": s["weight_g"], "per100": per, "group": s["group"], "shelf_stable": s["shelf_stable"],
        "url": url, "provenance": pprov + ". " + nprov + ".",
        "price_basis": basis, "nutrition_basis": nbasis, "animal_protein": animal,
    }
    if ex.get("note"):
        item["note"] = ex["note"]
    items.append(item)

catalog = {
    "snapshot_date": "2026-10-07",
    "fetched": "2026-11-24",
    "store": "«Пятёрочка», Москва: 8 магазинов (в том числе ул. Академика Анохина, 26к5); консервированные овощи и бобовые — магазин в д. Чупряково, рыбные и мясные консервы, сгущёнка, сыр, сливочное масло, фарш, яблоки, апельсины, зерновой хлеб — магазин в д. Давыдово (оба — Московская обл.). Позиции с price_basis = rosstat_avg — средние цены Росстата по России, не цены «Пятёрочки».",
    "source": ("СМЕШАННЫЙ ИСТОЧНИК, ЧИТАТЬ ВНИМАТЕЛЬНО. "
               "1) price_basis = 5ka_shelf: реальные цены «Пятёрочки» из публичных прайс-листов магазинов на Яндекс Картах (данные Едадила, обновлены 07.10.2026; собраны вручную один раз 24.11.2026). "
               "Сайт 5ka.ru и его API с нашего адреса недоступны (блокировка), клиент pyaterochka-api не использовался: он работает через браузер для обхода антибот-защиты. "
               "У большинства магазинов прайс-лист на картах обрезан и покрывает только бакалею, сладости, заморозку и детское питание; рыбные и мясные консервы, сыр, масло и сгущёнка взяты из короткого прайс-листа одного магазина в д. Давыдово (Московская обл.). "
               "2) price_basis = rosstat_avg: молоко (в т. ч. ультрапастеризованное), кефир, сметана, творог, яйца, курица, обычный хлеб, свежие овощи, бананы, рыбные консервы в томате, маргарин, чай и сахар — "
               "ЭТО НЕ ЦЕНЫ «ПЯТЁРОЧКИ», а средние потребительские цены Росстата по России (на 21.09.2026 или за декабрь 2025), пересчитанные на условную упаковку. "
               "КБЖУ: для большинства товаров — общий справочник USDA FoodData Central, а не этикетка; см. nutrition_basis и provenance у каждой позиции. "
               "Подробности — data/SOURCES.md."),
    "fields": {
        "weight_g": "масса нетто в граммах; для жидкостей объём × принятая плотность (см. note)",
        "per100": "на 100 г продукта в том виде, как он продаётся (для товаров с костью, кожурой, скорлупой несъедобная часть уже вычтена)",
        "price_basis": "5ka_shelf — цена «Пятёрочки»; rosstat_avg — средняя цена Росстата по РФ, не «Пятёрочка»",
        "nutrition_basis": "label_same_product | label_comparable_product | reference_table | none",
        "shelf_stable": "true — можно хранить без холодильника (подходит для «Корзины доброты»)",
        "animal_protein": "true — белок продукта в основном животного происхождения (мясо, рыба, яйца, молочное); false — растительный или смешанный продукт (для смешанных причина указана в provenance)",
    },
    "items": items,
}
json.dump(catalog, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(items), "items ->", OUT)
print(collections.Counter(i["group"] for i in items))
print(collections.Counter(i["price_basis"] for i in items), collections.Counter(i["nutrition_basis"] for i in items))
