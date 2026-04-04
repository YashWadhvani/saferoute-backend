import os
import json
from pathlib import Path
import math
import pandas as pd
import numpy as np

try:
    from pymongo import MongoClient
except Exception:
    MongoClient = None


def haversine_meters(lat1, lon1, lat2, lon2):
    # all args in degrees
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def load_verified_potholes(repo_root: Path):
    # Try MongoDB first, fallback to local JSON file
    uri = os.getenv("MONGO_URI", "")
    potholes = []
    if uri and MongoClient is not None:
        try:
            client = MongoClient(uri, serverSelectionTimeoutMS=5000)
            dbname = "saferoute"
            db = client.get_default_database() if dbname is None else client[dbname]
            coll = db.get_collection("potholes")
            for doc in coll.find({}, {"latitude": 1, "longitude": 1}):
                if "latitude" in doc and "longitude" in doc:
                    potholes.append((float(doc["latitude"]), float(doc["longitude"])))
            # only return if we actually found any potholes in MongoDB; otherwise fall back to local JSON
            if potholes:
                return potholes
        except Exception:
            # fallthrough to local JSON
            pass

    local_json = repo_root /  "saferoute.potholes.json"
    if local_json.exists():
        try:
            with open(local_json, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Expect either a list of docs or {"docs": [...]} 
            if isinstance(data, dict) and "docs" in data:
                docs = data["docs"]
            elif isinstance(data, list):
                docs = data
            else:
                docs = []
            for d in docs:
                lat = None
                lon = None
                # common flat fields
                if isinstance(d, dict):
                    lat = d.get("latitude") or d.get("lat")
                    lon = d.get("longitude") or d.get("lon")
                    # GeoJSON-style: location.coordinates = [lon, lat]
                    loc = d.get("location") or d.get("geometry")
                    if loc and isinstance(loc, dict):
                        coords = loc.get("coordinates")
                        if isinstance(coords, (list, tuple)) and len(coords) >= 2:
                            try:
                                # coordinates are usually [lon, lat]
                                lon = float(coords[0])
                                lat = float(coords[1])
                            except Exception:
                                pass
                if lat is None or lon is None:
                    continue
                potholes.append((float(lat), float(lon)))
        except Exception:
            pass

    # Fallback: also check for JSON at repo root (some users keep it there)
    if not potholes:
        alt_json = repo_root / "saferoute.potholes.json"
        if alt_json.exists():
            try:
                print(f"Found fallback JSON at {alt_json}")
                with open(alt_json, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict) and "docs" in data:
                    docs = data["docs"]
                elif isinstance(data, list):
                    docs = data
                else:
                    docs = []
                extracted = 0
                for d in docs:
                    lat = None
                    lon = None
                    if isinstance(d, dict):
                        lat = d.get("latitude") or d.get("lat")
                        lon = d.get("longitude") or d.get("lon")
                        loc = d.get("location") or d.get("geometry")
                        if loc and isinstance(loc, dict):
                            coords = loc.get("coordinates")
                            if isinstance(coords, (list, tuple)) and len(coords) >= 2:
                                try:
                                    lon = float(coords[0])
                                    lat = float(coords[1])
                                except Exception:
                                    pass
                    if lat is None or lon is None:
                        continue
                    potholes.append((float(lat), float(lon)))
                    extracted += 1
                print(f"Loaded {len(docs)} docs from fallback JSON, extracted {extracted} potholes")
            except Exception as e:
                print("Failed to read fallback JSON:", e)

    return potholes


def read_sensor_file(path: Path) -> pd.DataFrame:
    # Read metadata lines (comments) to extract column names if present
    fields = None
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("# Fields:"):
                    # format: # Fields: a, b, c
                    parts = line.split(":", 1)
                    if len(parts) > 1:
                        fields = [p.strip() for p in parts[1].split(",")]
                    break
    except Exception:
        fields = None

    if fields:
        # file contains a comment line with field names; use those and ignore comment lines
        return pd.read_csv(path, names=fields, comment="#", header=None, na_values=["null"], engine="python")

    # Fallback: try common separators but ignore comment lines starting with '#'
    for sep in [",", "\t", "\\s+"]:
        try:
            df = pd.read_csv(path, sep=sep, comment="#", engine="python", na_values=["null"])
            if df.shape[1] >= 5:
                return df
        except Exception:
            continue

    # Final fallback: use regex whitespace separator
    return pd.read_csv(path, sep=r"\s+", comment="#", engine="python", na_values=["null"])


def label_sensor_logs():
    repo_root = Path(__file__).resolve().parents[1]
    sensor_dir = repo_root / "pothole sensors logs"
    out_dir = repo_root / "data"
    out_dir.mkdir(exist_ok=True)

    potholes = load_verified_potholes(repo_root)
    print(f"Loaded {len(potholes)} verified potholes")

    all_rows = []
    for f in sensor_dir.glob("*.txt"):
        try:
            df = read_sensor_file(f)
        except Exception as e:
            print("failed to read", f, e)
            continue

        # normalize column names
        df.columns = [c.strip() for c in df.columns]

        # required gps columns
        if not {"latitude", "longitude"}.issubset(set(map(str.lower, df.columns))):
            # try variants
            if "lat" in df.columns and "lon" in df.columns:
                df = df.rename(columns={"lat": "latitude", "lon": "longitude"})

        df = df.rename(columns={c: c.lower() for c in df.columns})

        # ensure numeric
        for col in ["latitude", "longitude"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        # drop rows without gps
        if "latitude" not in df.columns or "longitude" not in df.columns:
            print(f"Skipping {f.name}: missing latitude/longitude columns")
            continue

        df = df.dropna(subset=["latitude", "longitude"])  # ignore rows where GPS missing

        if df.empty:
            continue

        # iterate rows and label
        for i, row in df.iterrows():
            lat = float(row["latitude"])
            lon = float(row["longitude"])
            label = 0
            for ph_lat, ph_lon in potholes:
                d = haversine_meters(lat, lon, ph_lat, ph_lon)
                if d <= 10.0:
                    label = 1
                    break
            r = row.to_dict()
            r["label"] = int(label)
            r["source_file"] = f.name
            all_rows.append(r)

    if not all_rows:
        print("No labeled rows produced")
        return

    out_df = pd.DataFrame(all_rows)
    out_path = out_dir / "pothole_dataset.csv"
    out_df.to_csv(out_path, index=False)
    print(f"Saved labeled dataset to {out_path}")


if __name__ == "__main__":
    label_sensor_logs()
