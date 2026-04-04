from pathlib import Path
import numpy as np
import joblib

def detect_pothole_xgb(features: dict) -> int:
    """
    features: dict of feature_name -> value for the XGBoost model
    returns 0 or 1
    """
    repo_root = Path(__file__).resolve().parents[1]
    model_path = repo_root / "saved_models" / "xgb_model.joblib"
    scaler_path = repo_root / "saved_models" / "xgb_scaler.joblib"
    if not model_path.exists() or not scaler_path.exists():
        raise FileNotFoundError("Saved XGB model or scaler not found")

    model = joblib.load(model_path)
    scaler = joblib.load(scaler_path)

    feature_cols = [
        "accel_mag",
        "gyro_mag",
        "accel_spike",
        "gyro_peak",
        "speed_kmph",
        "jerk",
        "accel_roll_mean",
        "accel_roll_std",
        "accel_roll_max",
        "gyro_roll_max",
    ]

    x = np.array([features.get(c, 0.0) for c in feature_cols]).reshape(1, -1)
    x_s = scaler.transform(x)
    pred = model.predict(x_s)
    return int(pred[0])


def detect_pothole_lstm(sequence: list) -> int:
    """
    sequence: list of feature dicts or 2D array-like (timesteps x features)
    returns 0/1 using saved LSTM model
    """
    import tensorflow as tf
    from tensorflow.keras.models import load_model

    repo_root = Path(__file__).resolve().parents[1]
    model_dir = repo_root / "saved_models" / "lstm_model"
    scaler_path = repo_root / "saved_models" / "lstm_scaler.joblib"
    if not model_dir.exists() or not scaler_path.exists():
        raise FileNotFoundError("Saved LSTM model or scaler not found")

    model = load_model(model_dir)
    scaler = joblib.load(scaler_path)

    arr = np.array(sequence)
    # if sequence is list of dicts, convert
    if arr.dtype == object:
        # assume list of dicts
        feature_cols = [
            "accel_mag",
            "gyro_mag",
            "accel_spike",
            "gyro_peak",
            "speed_kmph",
            "jerk",
            "accel_roll_mean",
            "accel_roll_std",
            "accel_roll_max",
            "gyro_roll_max",
        ]
        arr = np.array([[s.get(c, 0.0) for c in feature_cols] for s in sequence])

    # scale per feature
    orig_shape = arr.shape
    flat = arr.reshape(-1, orig_shape[-1])
    flat_s = scaler.transform(flat)
    seq_s = flat_s.reshape(orig_shape)

    pred_prob = model.predict(seq_s.reshape(1, *seq_s.shape))[0][0]
    return int(pred_prob >= 0.5)
