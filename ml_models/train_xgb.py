from pathlib import Path
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
import joblib
import matplotlib.pyplot as plt

try:
    from xgboost import XGBClassifier
except Exception:
    XGBClassifier = None


def train_xgb():
    repo_root = Path(__file__).resolve().parent.parent
    in_path = repo_root / "data" / "pothole_features.csv"
    out_dir = repo_root / "saved_models"
    out_dir.mkdir(exist_ok=True)

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

    df = df.dropna(subset=feature_cols + ["label"])  # drop incomplete rows

    X = df[feature_cols].values
    y = df["label"].values

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    model = XGBClassifier(eval_metric="logloss") if XGBClassifier is not None else None
    if model is None:
        print("xgboost not installed")
        return

    model.fit(X_train_s, y_train)

    y_pred = model.predict(X_test_s)
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    cm = confusion_matrix(y_test, y_pred)

    print("XGBoost Results:")
    print(f"Accuracy: {acc:.4f}")
    print(f"Precision: {prec:.4f}")
    print(f"Recall: {rec:.4f}")
    print(f"F1: {f1:.4f}")
    print("Confusion Matrix:\n", cm)

    # save model and scaler
    joblib.dump(model, out_dir / "xgb_model.joblib")
    joblib.dump(scaler, out_dir / "xgb_scaler.joblib")

    try:
        importances = model.feature_importances_
        plt.figure(figsize=(8, 5))
        plt.bar(feature_cols, importances)
        plt.xticks(rotation=45, ha="right")
        plt.title("XGBoost Feature Importance")
        plt.tight_layout()
        plt.savefig(repo_root / "outputs" / "xgb_feature_importance.png")
        print("Saved feature importance plot")
    except Exception:
        pass


def tune_xgb():
    param_grid = {
        "max_depth": [3, 5, 7],
        "learning_rate": [0.01, 0.1, 0.2],
        "n_estimators": [50, 100, 200],
        "subsample": [0.8, 1.0],
    }

    model = XGBClassifier(eval_metric="logloss")
    grid_search = GridSearchCV(model, param_grid, scoring="f1", cv=3, verbose=1)
    grid_search.fit(X_train_s, y_train)

    best_model = grid_search.best_estimator_
    best_params = grid_search.best_params_
    best_score = grid_search.best_score_

    print("Best params:", best_params)
    print(f"Best F1 score: {best_score:.4f}")

    # Save the best model
    joblib.dump(best_model, out_dir / "xgb_best_model.joblib")
    joblib.dump(scaler, out_dir / "xgb_scaler.joblib")


if __name__ == "__main__":
    train_xgb()
