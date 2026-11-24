"""Self-check of data/*.json. Usage: python3 -I tools/check_data.py [data_dir]   (exit 1 on failure)"""
import json, os, sys, collections

D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "data")
GROUPS = {"grains", "legumes", "meat_fish", "dairy", "veg_fruit", "oils", "sugar_sweets", "other"}
FIELDS = {"id": str, "name": str, "brand": str, "price_rub": (int, float), "weight_g": (int, float), "per100": dict,
          "group": str, "shelf_stable": bool, "url": str, "provenance": str,
          "price_basis": str, "nutrition_basis": str, "animal_protein": bool}
PRICE_BASIS = {"5ka_shelf", "rosstat_avg"}
# Items whose label/reference kcal legitimately deviates from 4P+9F+4C by more than 20% (reason shown in report).
KCAL_OK = {
    "broccoli-frozen-gv-400": "USDA FDC 169968: энергия посчитана по специфичным коэффициентам Этуотера, а углеводы «по разности» включают клетчатку (у брокколи её много), поэтому 4Б+9Ж+4У завышает ккал; отклонение 21% — свойство справочника, не ошибка ввода.",
}
fail = []

cat = json.load(open(os.path.join(D, "catalog.json"), encoding="utf-8"))
norms = json.load(open(os.path.join(D, "norms.json"), encoding="utf-8"))
base = json.load(open(os.path.join(D, "baseline.json"), encoding="utf-8"))
for k in ("snapshot_date", "store", "source", "items"):
    if not cat.get(k):
        fail.append(f"catalog: missing {k}")

items = cat["items"]
ids = [i.get("id") for i in items]
dups = [k for k, v in collections.Counter(ids).items() if v > 1]
if dups:
    fail.append(f"duplicate ids: {dups}")
outliers = []
for i in items:
    for f, t in FIELDS.items():
        if not isinstance(i.get(f), t) or (t is str and not i[f] and f != "brand"):
            fail.append(f"{i.get('id')}: bad field {f}={i.get(f)!r}")
    if not (isinstance(i.get("price_rub"), (int, float)) and i["price_rub"] > 0):
        fail.append(f"{i.get('id')}: price must be > 0")
    if not (isinstance(i.get("weight_g"), (int, float)) and i["weight_g"] > 0):
        fail.append(f"{i.get('id')}: weight must be > 0")
    if i.get("price_basis") not in PRICE_BASIS:
        fail.append(f"{i.get('id')}: unknown price_basis {i.get('price_basis')}")
    if i.get("animal_protein") is True and i.get("group") not in ("meat_fish", "dairy"):
        fail.append(f"{i.get('id')}: animal_protein true outside meat_fish/dairy — check")
    if i.get("animal_protein") is False and i.get("group") in ("meat_fish", "dairy") and "смешанн" not in i.get("provenance", ""):
        fail.append(f"{i.get('id')}: meat/dairy item marked non-animal without a 'смешанный' note in provenance")
    if i.get("group") not in GROUPS:
        fail.append(f"{i.get('id')}: bad group {i.get('group')}")
    p = i.get("per100", {})
    if set(p) != {"kcal", "protein_g", "fat_g", "carb_g"} or any(not isinstance(v, (int, float)) or v < 0 for v in p.values()):
        fail.append(f"{i.get('id')}: bad per100 {p}")
        continue
    est = 4 * p["protein_g"] + 9 * p["fat_g"] + 4 * p["carb_g"]
    if p["kcal"] == 0 and est == 0:
        continue
    dev = (p["kcal"] - est) / est if est else float("inf")
    if abs(dev) > 0.20:
        outliers.append((i["id"], p["kcal"], round(est, 1), f"{dev:+.0%}"))
        if i["id"] not in KCAL_OK:
            fail.append(f"{i['id']}: kcal {p['kcal']} vs 4P+9F+4C {est:.1f} ({dev:+.0%}) — fix or justify in KCAL_OK")

by_group = collections.Counter(i["group"] for i in items)
for g in GROUPS:
    if by_group[g] < 8:
        fail.append(f"group {g}: only {by_group[g]} items (need >= 8)")
shelf = sum(1 for i in items if i["shelf_stable"])
if shelf < 60:
    fail.append(f"only {shelf} shelf-stable items (need >= 60)")
if not 150 <= len(items) <= 300:
    fail.append(f"{len(items)} items (need 150-300)")

idx = {i["id"]: i for i in items}
for b in base["baskets"]:
    tot = 0
    for x in b["items"]:
        if x["id"] not in idx:
            fail.append(f"baseline {b['budget_rub']}: unknown id {x['id']}")
            continue
        it = idx[x["id"]]
        if abs(it["price_rub"] - x["price_rub"]) > 1e-9:
            fail.append(f"baseline {b['budget_rub']}: price of {x['id']} differs from catalog")
        if not it["shelf_stable"]:
            fail.append(f"baseline {b['budget_rub']}: {x['id']} is not shelf-stable")
        tot += it["price_rub"] * x["qty"]
    if tot > b["budget_rub"] + 1e-9 or abs(round(tot, 2) - b["total_rub"]) > 0.005:
        fail.append(f"baseline {b['budget_rub']}: total {tot:.2f} (declared {b['total_rub']})")

for pr in norms["profiles"]:
    if not (pr.get("kcal", 0) > 0 and pr.get("protein_g", 0) > 0 and pr.get("citation") and "verified" in pr):
        fail.append(f"norms profile {pr.get('id')}: incomplete")
    ap = pr.get("animal_protein_g")
    if not (isinstance(ap, (int, float)) and 0 < ap < pr["protein_g"] and pr.get("animal_protein_citation") and "animal_protein_verified" in pr):
        fail.append(f"norms profile {pr.get('id')}: bad animal_protein_g")
    if "members" in pr and abs(sum(m["animal_protein_g"] for m in pr["members"]) - ap) > 0.05:
        fail.append(f"norms profile {pr.get('id')}: animal_protein_g != sum of members")
for g in GROUPS:
    if g not in norms["food_groups"]["groups"]:
        fail.append(f"norms: no mapping for group {g}")

print(f"items: {len(items)}; per group: {dict(sorted(by_group.items()))}; shelf-stable: {shelf}")
anim_ss = [i for i in items if i["animal_protein"] and i["shelf_stable"]]
print("animal-protein shelf-stable items:", len(anim_ss), "of which real 5ka prices:", sum(i["price_basis"] != "rosstat_avg" for i in anim_ss))
print("price basis:", dict(collections.Counter(i.get("price_basis") for i in items)),
      "| nutrition basis:", dict(collections.Counter(i.get("nutrition_basis") for i in items)))
print("kcal outliers (>20%):", outliers or "none")
for i, why in KCAL_OK.items():
    print(f"  justified {i}: {why}")
for b in base["baskets"]:
    print(f"baseline {b['budget_rub']} ₽: {b['total_rub']} ₽, {len(b['items'])} items")
if fail:
    print("FAIL:\n  " + "\n  ".join(fail))
    sys.exit(1)
print("OK")
