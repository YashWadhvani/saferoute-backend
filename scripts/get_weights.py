import pandas as pd
import argparse
import os

# Define the absolute path to the data directory
data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

def normalize_weights(weights):
    """Normalize weights to ensure they sum to 1."""
    if weights.sum() != 1.0:
        weights = weights / weights.sum()
    return weights.round(2)

def get_weights(method):
    file_map = {
        "mean": os.path.join(data_dir, "weights_mean.csv"),
        "regression": os.path.join(data_dir, "weights_regression.csv"),
        "pca": os.path.join(data_dir, "weights_pca.csv"),
        "rf": os.path.join(data_dir, "weights_rf.csv"),
    }

    if method == "all":
        weights = {}
        for method_name, file_path in file_map.items():
            try:
                raw_weights = pd.read_csv(file_path, index_col=0).squeeze("columns")
                weights[method_name] = normalize_weights(raw_weights)
            except FileNotFoundError:
                weights[method_name] = f"File not found: {file_path}"
        return weights

    if method in file_map:
        weights_path = file_map[method]
        try:
            raw_weights = pd.read_csv(weights_path, index_col=0).squeeze("columns")
            return normalize_weights(raw_weights)
        except FileNotFoundError:
            raise FileNotFoundError(f"Weights file not found for method: {method}")

    raise ValueError(f"Invalid method: {method}. Choose from {list(file_map.keys()) + ['all']}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Get weights for a specified method.")
    parser.add_argument("--method", type=str, required=True, help="Method to get weights for (mean, regression, pca, rf, all)")
    args = parser.parse_args()

    method = args.method

    try:
        weights = get_weights(method)
        if method == "all":
            for method_name, weight in weights.items():
                print(f"Weights using {method_name} method:")
                print(weight)
                print()
        else:
            print(f"Weights using {method} method:")
            print(weights)
    except Exception as e:
        print(f"Error: {e}")