from pathlib import Path
import pandas as pd


def create_features():
    repo_root = Path(__file__).resolve().parents[1]
    in_path = repo_root / "data" / "pothole_dataset.csv"
    out_dir = repo_root / "data"
    out_dir.mkdir(exist_ok=True)

    if not in_path.exists():
        print(f"Input dataset not found: {in_path}")
        return

    df = pd.read_csv(in_path)

    # ensure timestamp
    if "timestamp" in df.columns:
        try:
            df["timestamp"] = pd.to_datetime(df["timestamp"])
            df = df.sort_values("timestamp")
        except Exception:
            pass

    # use lowercase columns
    df.columns = [c.lower() for c in df.columns]

    # required base features
    for col in ["accel_mag", "gyro_mag", "accel_spike", "gyro_peak", "speed_kmph"]:
        if col not in df.columns:
            df[col] = 0.0

    # derived features
    df["jerk"] = df["accel_mag"].diff().fillna(0.0)

    # rolling window features (window=5)
    window = 5
    df["accel_roll_mean"] = df["accel_mag"].rolling(window, min_periods=1).mean()
    df["accel_roll_std"] = df["accel_mag"].rolling(window, min_periods=1).std().fillna(0.0)
    df["accel_roll_max"] = df["accel_mag"].rolling(window, min_periods=1).max()
    df["gyro_roll_max"] = df["gyro_mag"].rolling(window, min_periods=1).max()

    out_path = out_dir / "pothole_features.csv"
    df.to_csv(out_path, index=False)
    print(f"Saved features to {out_path}")


if __name__ == "__main__":
    create_features()
