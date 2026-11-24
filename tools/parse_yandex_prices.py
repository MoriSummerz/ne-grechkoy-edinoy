"""Extract the Edadeal-sourced price list embedded in a Yandex/Yango Maps org "prices" page.
Usage: python3 -I parse_yandex_prices.py <saved_prices.html> <out.json>
Writes: {"org": {...}, "updated": [...], "items": [{"category","title","price","sourceUrl"}]}"""
import json, re, sys

html = open(sys.argv[1], encoding="utf-8").read()
dec = json.JSONDecoder()
items, seen = [], set()
# Each price list is a JSON array after "categories":[{"categoryName"...
for m in re.finditer(r'"categories":(\[\{"categoryName")', html):
    arr, _ = dec.raw_decode(html, m.start(1))
    for cat in arr:
        for it in cat.get("categoryItems", []):
            key = (it.get("title"), it.get("price"))
            if key in seen:
                continue
            seen.add(key)
            items.append({"category": cat.get("categoryName"), "title": it.get("title"),
                          "price": it.get("price"), "sourceUrl": it.get("sourceUrl")})
addr = re.search(r'"address":"([^"]+)","coordinates"', html)
upd = sorted(set(re.findall(r'"updatedTime":"([^"]+)"', html)))
out = {"org_address": addr.group(1) if addr else None, "updatedTime_values": upd, "items": items}
json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(items), "items;", out["org_address"], upd)
