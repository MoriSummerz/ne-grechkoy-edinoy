"""Compact USDA reference data used for nutrition.
Usage: python3 -I usda_compact.py <raw_usda_1_dir> <raw_usda_sr28_dir>
Inputs (downloaded once):
  <raw_usda_1_dir>/FoodData_Central_sr_legacy_food_csv_2018-04/  from https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
  <raw_usda_sr28_dir>/FOOD_DES.txt                                from https://www.ars.usda.gov/ARSUserFiles/80400535/DATA/SR/sr28/dnload/sr28asc.zip
Outputs: <raw_usda_1_dir>/sr_compact.json (kcal, protein, fat, carb per 100 g by FDC id)
         <raw_usda_sr28_dir>/refuse_by_fdc.json (inedible share %, by FDC id)"""
import csv, json, os, sys

fdc_dir = os.path.join(sys.argv[1], "FoodData_Central_sr_legacy_food_csv_2018-04")
foods = {r["fdc_id"]: r["description"] for r in csv.DictReader(open(os.path.join(fdc_dir, "food.csv"), encoding="utf-8"))}
want = {"1008": "kcal", "1003": "protein_g", "1004": "fat_g", "1005": "carb_g"}
out = {}
for r in csv.DictReader(open(os.path.join(fdc_dir, "food_nutrient.csv"), encoding="utf-8")):
    k = want.get(r["nutrient_id"])
    if k and r["fdc_id"] in foods:
        out.setdefault(r["fdc_id"], {"desc": foods[r["fdc_id"]]})[k] = float(r["amount"])
json.dump(out, open(os.path.join(sys.argv[1], "sr_compact.json"), "w"), ensure_ascii=False)

fd = {}
for line in open(os.path.join(sys.argv[2], "FOOD_DES.txt"), encoding="latin-1"):
    f = [x.strip("~") for x in line.rstrip("\r\n").split("^")]
    fd[f[0]] = {"desc": f[2], "ref_desc": f[7], "refuse": f[8]}
ndb = {r["fdc_id"]: r["NDB_number"] for r in csv.DictReader(open(os.path.join(fdc_dir, "sr_legacy_food.csv")))}
json.dump({k: fd.get(v.zfill(5)) for k, v in ndb.items()}, open(os.path.join(sys.argv[2], "refuse_by_fdc.json"), "w"), ensure_ascii=False)
print(len(out), "foods")
