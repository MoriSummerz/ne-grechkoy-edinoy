"""Merge parsed Yandex Maps price lists (output of parse_yandex_prices.py) into one table.
Usage: python3 -I union_prices.py <out_dir> <raw_yango_dir> [<raw_yango_dir> ...]  -> writes <out_dir>/union_msk.json
Keeps all Moscow stores plus the Moscow Region stores listed in KEEP_MO; skips EXCLUDE."""
import glob, json, os, re, sys

# Чупряково: its list reaches «Консервы»; Давыдово: a short list (170 items) that spans all categories incl. canned fish/meat and dairy
KEEP_MO = {"17620177076", "200518261999"}
EXCLUDE = {"100128780541"}  # ул. Дубки, 2: only 5 items with round prices (195, 300 ₽) unlike every other store — not trusted
items, cat, urls, addr = {}, {}, {}, {}
for d in sys.argv[2:]:
    for f in sorted(glob.glob(os.path.join(d, "parsed_*.json"))):
        oid = os.path.basename(f)[7:-5]
        p = json.load(open(f, encoding="utf-8"))
        a = p["org_address"] or ""
        if oid in EXCLUDE or not p["items"]:
            continue
        full = a if a.startswith("Moscow,") else None
        if not full:  # parse_yandex_prices stores the short address; Moscow Region stores are recognised by their fullAddress
            html = os.path.join(d, f"store_{oid}_prices.html")
            m = re.search(r'"fullAddress":"([^"]+)"', open(html, encoding="utf-8").read())
            full = m.group(1) if m and oid in KEEP_MO else None
        if not full:
            continue
        addr[oid] = full
        for i in p["items"]:
            items.setdefault(i["title"], {})[oid] = float(i["price"])
            urls.setdefault(i["title"], i["sourceUrl"])
            if i["category"] != "popular":
                cat[i["title"]] = i["category"]
json.dump({"items": items, "cat": cat, "urls": urls, "addr": addr}, open(os.path.join(sys.argv[1], "union_msk.json"), "w", encoding="utf-8"), ensure_ascii=False)
print(len(items), "titles from", len(addr), "stores")
