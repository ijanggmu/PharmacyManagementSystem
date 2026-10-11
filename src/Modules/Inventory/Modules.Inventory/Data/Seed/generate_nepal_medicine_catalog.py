# Usage: python -I generate_nepal_medicine_catalog.py "<purchase export>.xlsx" nepal-medicine-catalog.json  (needs openpyxl)
"""Converts the pharmacy's purchase-history export into the Nepal medicine catalog seed JSON.

Only the product name is trusted: in this export the Prodname column is not row-aligned with the
Compname/price columns (e.g. PEDIASURE 400 GM sits on a TORRENT row at MRP 116), so manufacturer and
prices are deliberately left out. Form and strength are parsed from the name itself.
"""
import sys, re, json, collections, openpyxl

src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
s = lambda v: re.sub(r"\s+", " ", str(v)).strip() if v is not None else ""

names = {}
for r in wb["new-purchase"].iter_rows(min_row=9, values_only=True):
    if s(r[6]) and s(r[6]) != "None":
        names.setdefault(s(r[6]).upper(), s(r[6]))
for _, prod in wb["Medicine Details"].iter_rows(min_row=2, values_only=True):
    if s(prod) and s(prod) != "None":
        names.setdefault(s(prod).upper(), s(prod))

def words(n): return set(t for t in re.split(r"[^A-Z0-9%]+", n) if t)

def infer_form(n):
    w = words(n)
    if w & {"INJ", "INJECTION", "VIAL", "AMP", "AMPOULE"}: return "injection"
    if w & {"DROP", "DROPS"} or (w & {"EYE", "EAR", "NASAL"} and not w & {"SPRAY", "WASH", "OINT", "OINTMENT", "GEL"}): return "drops"
    if w & {"CREAM", "OINT", "OINTMENT", "GEL", "LOTION"}: return "cream"
    if w & {"CAP", "CAPS", "CAPSULE", "CAPSULES", "ROTACAPS"}: return "capsule"
    if w & {"SYRUP", "SYP", "SUSP", "SUSPENSION", "ELIXIR", "LINCTUS"}: return "syrup"
    if w & {"TAB", "TABS", "TABLET", "TABLETS", "DT"}: return "tablet"
    # A bare oral strength ("ATOR-10MG", "MONTAIR 5MG") with no other form keyword => tablet.
    if re.search(r"\d\s*(MG|MCG)\b", n) and not re.search(r"\d\s*(ML|GM?)\b", n): return "tablet"
    return None

STRENGTH = re.compile(r"(\d+(?:\.\d+)?(?:\s*/\s*\d+(?:\.\d+)?)?)\s*(MG|MCG|IU|%)", re.I)
def infer_strength(n):
    m = STRENGTH.search(n)
    return (m.group(1).replace(" ", "") + m.group(2).lower()) if m else None

entries, forms = [], collections.Counter()
for key in sorted(names):
    brand = names[key]
    e = {"brandName": brand[:256]}
    f = infer_form(key)
    if f: e["form"] = f
    st = infer_strength(brand)
    if st: e["strength"] = e["dosage"] = st
    forms[f] += 1
    entries.append(e)

with open(out, "w", encoding="utf-8", newline="\n") as fh:
    fh.write("[\n" + ",\n".join(json.dumps(e, ensure_ascii=False) for e in entries) + "\n]\n")
print(len(entries), "entries;", dict(forms), "with strength:", sum("strength" in e for e in entries))
