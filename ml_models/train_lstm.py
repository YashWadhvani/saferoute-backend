from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from sklearn.model_selection import train_test_split
import joblib

import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Masking


def create_sequences(X, y, window_size=10):
    sequences = []
    labels = []
    for i in range(len(X) - window_size + 1):
        seq = X[i : i + window_size]
        lbl = int(y[i : i + window_size].max())
        sequences.append(seq)
        labels.append(lbl)
    return np.array(sequences), np.array(labels)


def train_lstm(window_size=10, epochs=10, batch_size=32):
    repo_root = Path(__file__).resolve().parent.parent
    in_path = repo_root / "data" / "pothole_features.csv"
    out_dir = repo_root / "saved_models"
    out_dir.mkdir(exist_ok=True)

    if not in_path.exists():
        print("features file not found")
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

    df = df.dropna(subset=feature_cols + ["label"])  # drop incomplete

    X = df[feature_cols].values
    y = df["label"].values

    scaler = StandardScaler()
    X_s = scaler.fit_transform(X)

    seqs, seq_labels = create_sequences(X_s, y, window_size=window_size)
    if len(seqs) == 0:
        print("Not enough data to create sequences")
        return

    X_train, X_test, y_train, y_test = train_test_split(
        seqs, seq_labels, test_size=0.2, random_state=42, stratify=seq_labels
    )

    model = Sequential()
    model.add(Masking(mask_value=0.0, input_shape=(window_size, len(feature_cols))))
    model.add(LSTM(64, return_sequences=False))
    model.add(Dense(1, activation="sigmoid"))
    model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy"])

    model.fit(
        X_train,
        y_train,
        validation_data=(X_test, y_test),
        epochs=epochs,
        batch_size=batch_size,
    )

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

    model_path = out_dir / "lstm_model.keras"
    model.save(model_path)
    joblib.dump(scaler, out_dir / "lstm_scaler.joblib")


if __name__ == "__main__":
    train_lstm(epochs=5)
