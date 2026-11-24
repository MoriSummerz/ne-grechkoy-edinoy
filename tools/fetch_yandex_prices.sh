#!/bin/bash
# Polite one-off fetch of public Yandex/Yango Maps "prices" pages of Пятёрочка stores (price lists there come from Edadeal).
# Usage: fetch_yandex_prices.sh <out_dir> <org_id> [org_id ...]
# Anonymous, generic UA, no cookies, 6 s pause between pages. Stop if you get a captcha page.
out=$1; shift; mkdir -p "$out"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
for id in "$@"; do
  curl -s -A "$UA" -L --max-time 40 "https://maps.yango.com/org/pyatyorochka/$id/prices/" -o "$out/store_${id}_prices.html" -w "$id %{http_code} %{size_download}\n"
  sleep 6
done
