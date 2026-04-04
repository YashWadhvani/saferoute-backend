from pathlib import Path
import numpy as np
import pandas as pd
import joblib
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from sklearn.model_selection import train_test_split

import tensorflow as tf
from tensorflow.keras.models import load_model


def create_sequences(X, y, window_size=10):
    sequences = []
    labels = []
    for i in range(len(X) - window_size + 1):
        seq = X[i : i + window_size]
        lbl = int(y[i : i + window_size].max())
        sequences.append(seq)
        labels.append(lbl)
    return np.array(sequences), np.array(labels)


def eval_xgb(df, feature_cols):
    repo_root = Path(__file__).resolve().parent.parent
    model_file = repo_root / "saved_models" / "xgb_model.joblib"
    scaler_file = repo_root / "saved_models" / "xgb_scaler.joblib"
    if not model_file.exists() or not scaler_file.exists():
        print("XGBoost model or scaler not found; skipping XGBoost evaluation.")
        return

    model = joblib.load(model_file)
    scaler = joblib.load(scaler_file)

    X = df[feature_cols].values
    y = df["label"].values

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    X_s = scaler.transform(X_test)
    y_pred = model.predict(X_s)
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)

    print("XGBoost Results:")
    print(f"Accuracy: {acc:.4f}")
    print(f"Precision: {prec:.4f}")
    print(f"Recall: {rec:.4f}")
    print(f"F1: {f1:.4f}")


def eval_lstm(df, feature_cols, window_size=10):
    repo_root = Path(__file__).resolve().parent.parent
    model_file = repo_root / "saved_models" / "lstm_model.keras"
    scaler_file = repo_root / "saved_models" / "lstm_scaler.joblib"
    if not model_file.exists() or not scaler_file.exists():
        print("LSTM model or scaler not found; skipping LSTM evaluation.")
        return

    model = load_model(model_file)
    scaler = joblib.load(scaler_file)

    X = df[feature_cols].values
    y = df["label"].values

    X_s = scaler.transform(X)
    seqs, seq_labels = create_sequences(X_s, y, window_size=window_size)
    if len(seqs) == 0:
        print("Not enough data to create sequences for LSTM evaluation.")
        return

    X_train, X_test, y_train, y_test = train_test_split(seqs, seq_labels, test_size=0.2, random_state=42, stratify=seq_labels)

    y_pred_prob = model.predict(X_test).ravel()
    y_pred = (y_pred_prob >= 0.5).astype(int)

    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)

    print("LSTM Results:")
    print(f"Accuracy: {acc:.4f}")
    print(f"Precision: {prec:.4f}")
    print(f"Recall: {rec:.4f}")
    print(f"F1: {f1:.4f}")


def main():
    repo_root = Path(__file__).resolve().parent.parent
    in_path = repo_root / "data" / "pothole_features.csv"
    if not in_path.exists():
        print(f"Features file missing: {in_path}")
        return

    df = pd.read_csv(in_path)
    df.columns = [c.lower() for c in df.columns]

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
    for c in feature_cols:
        if c not in df.columns:
            df[c] = 0.0

    df = df.dropna(subset=feature_cols + ["label"])
    if df.empty:
        print("No data after dropna; cannot evaluate.")
        return

    eval_xgb(df, feature_cols)
    eval_lstm(df, feature_cols, window_size=10)


if __name__ == "__main__":
    main()
