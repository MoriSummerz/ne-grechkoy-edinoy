"""Build data/baseline.json — the "typical donation" baskets — from data/catalog.json by a fixed, documented rule.
Usage: python3 -I tools/build_baseline.py data/catalog.json data/baseline.json"""
import json, sys

cat = {i["id"]: i for i in json.load(open(sys.argv[1], encoding="utf-8"))["items"]}

# Categories in the order the 2020 X5 / Роспотребнадзор press release lists what the sets actually contain:
# «крупы, макаронные и кондитерские изделия, консервы, чай, сахар, подсолнечное масло».
# One typical low-price pack per category (private label or the cheapest common pack in the catalog).
ORDER = [
    ("крупы", "buckwheat-selyanochka-900"),
    ("макаронные изделия", "pasta-horns-shebekinskie-450"),
    ("кондитерские изделия", "cookies-oat-krasnaya-tsena-400"),
    ("консервы", "canned-fish-tomato-rosstat-250"),
    ("чай", "tea-black-bags-rosstat-25"),
    ("сахар", "sugar-rosstat-1kg"),
    ("подсолнечное масло", "oil-sunflower-selyanochka-1l"),
]


def basket(budget):
    left, out = budget, []
    for cat_name, iid in ORDER:  # take each category once, in order; skip what no longer fits; never top up
        it = cat[iid]
        assert it["shelf_stable"], iid
        if it["price_rub"] <= left + 1e-9:
            out.append({"id": iid, "qty": 1, "category": cat_name, "name": it["name"], "price_rub": it["price_rub"]})
            left -= it["price_rub"]
    total = round(sum(x["price_rub"] for x in out), 2)
    assert total <= budget
    return {"budget_rub": budget, "items": out, "total_rub": total, "unspent_rub": round(budget - total, 2)}


baseline = {
    "title": "Типичная корзина пожертвования (база для сравнения)",
    "built_from": "data/catalog.json, правило в rationale; скрипт tools/build_baseline.py",
    "rule": "Категории берутся в порядке, в котором X5 и Роспотребнадзор (2020) перечисляют фактический состав наборов: крупы, макаронные изделия, кондитерские изделия, консервы, чай, сахар, подсолнечное масло. Из каждой категории — одна недорогая типичная упаковка. Если упаковка не помещается в остаток бюджета, категория пропускается; остаток не добивается.",
    "rationale": [
        "Не соломенное чучело. В базу входят только категории, которые сами организаторы называют составом наборов, и первыми идут крупы и макароны — самые питательные на рубль товары из этого списка. В корзину на 300 и 500 ₽ входят рыбные консервы — источник белка.",
        "Источник 1 — пресс-релиз X5 от 30.11.2020 «Роспотребнадзор оздоровил „Корзину доброты“» (https://esg.x5.ru/media/pdfs/301120_ru.pdf): «Сейчас в „корзину доброты“ входят базовые продукты длительного хранения…: крупы, макаронные и кондитерские изделия, консервы, чай, сахар, подсолнечное масло и пр.» Там же рекомендации Роспотребнадзора и ФИЦ питания: добавлять орехи, сухое и консервированное молоко без сахара, из круп отдавать приоритет овсяной и гречневой, при двух упаковках сахара одну менять на сухофрукты. Гречка в базе стоит как раз по этой рекомендации; сахар, чай и печенье — потому что их, по тексту релиза, кладут сейчас.",
        "Источник 2 — новость «Корзина доброты» в октябре на сайте акции (https://xn--80acikfkxffboh1a0k.xn--p1ai/novosti/detail/korzina-dobroty-v-oktyabre/, 23.10.2026): «В список рекомендуемых продуктов входят крупы, овощные, рыбные и мясные консервы, подсолнечное масло, чай, сахар, макароны, сухофрукты и орехи, печенье и другие продукты с длительным сроком хранения.»",
        "Источник 3 — пресс-релизы X5 о онлайн-сборах (https://esg.x5.ru/media/pdfs/211020_ru.pdf, https://esg.x5.ru/media/pdfs/250722_ru.pdf): наборы — «крупы, макароны, подсолнечное масло, консервы, чай и кондитерские изделия длительного хранения»; «каждая сумма [от 150 до 2 000 руб.] эквивалентна определённому перечню продуктов». Сами перечни по суммам на сайте акции не опубликованы (страница онлайн-пожертвования ответила 403), поэтому состав по суммам собран нашим правилом, а не скопирован.",
        "Чего мы не знаем: фактической статистики, что именно покупатели кладут в короб. Её нет в открытых источниках. Правило выше — наша модель «добросовестного дарителя, идущего по официальному списку», а не измерение.",
        "Цены: гречка, макароны, печенье, масло — реальные цены «Пятёрочки» (Москва). Рыбные консервы, чай и сахар — средние цены Росстата по России, потому что в доступных прайс-листах «Пятёрочки» этих товаров нет (см. catalog.json, price_basis). Сравнивать корзину сервиса с базой нужно по тем же ценам каталога.",
    ],
    "baskets": [basket(b) for b in (150, 300, 500)],
}
json.dump(baseline, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for b in baseline["baskets"]:
    print(b["budget_rub"], b["total_rub"], [x["id"] for x in b["items"]])
