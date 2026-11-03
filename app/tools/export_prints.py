"""Export Hourly Index daily prints with their per-source breakdown to JSON (read-only on the index DB).
Every calendar day from the first print to today is listed; a day with no print has value null (a visible gap)."""
import json, sqlite3, sys
from datetime import date, timedelta
from pathlib import Path
DB = Path("/home/mehdi_quantum3labs_com/compute-options/index/data/index.sqlite")
METHOD = Path("/home/mehdi_quantum3labs_com/compute-options/index/method.json")
OUT = Path(sys.argv[1])
c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
method = json.loads(METHOD.read_text())
out = {"method": method, "chips": {}}
for gpu, key in method["gpus"].items():
    rows = {r[0]: r for r in c.execute("select day,value,n_providers,n_obs,detail,inputs_sha256,computed_at,status from prints where gpu=? and mode='research'", (gpu,))}
    if not rows: continue
    d0 = date.fromisoformat(min(rows)); days = []
    d = d0
    while d <= date.today():
        k = d.isoformat(); r = rows.get(k)
        if not r:
            days.append({"day": k, "value": None}); d += timedelta(days=1); continue
        det = json.loads(r[4] or "{}")
        seen = {}
        for prov, usd, at, url in c.execute("select provider,usd_hr,fetched_at,source_url from observations where day=? and gpu_key=? and kind='on-demand'", (k, key)):
            s = seen.setdefault(prov, {"fetched_at": at, "source_url": url, "n": 0}); s["n"] += 1
            if at > s["fetched_at"]: s["fetched_at"] = at
        provs = [{"name": p, "usd_hr": v, "clamped": p in det.get("clamped", []), **seen.get(p, {})} for p, v in sorted(det.get("provider_values", {}).items())]
        days.append({"day": k, "value": r[1], "n_providers": r[2], "n_obs": r[3], "status": r[7], "inputs_sha256": r[5], "computed_at": r[6], "bounds": det.get("winsor_bounds"), "providers": provs})
        d += timedelta(days=1)
    out["chips"][gpu] = days
OUT.write_text(json.dumps(out))
print({g: (len(v), sum(1 for x in v if x["value"] is None)) for g, v in out["chips"].items()})
