import os
from pathlib import Path
import subprocess

def run_script(script_name):
    """Run a Python script and print its output."""
    try:
        print(f"Running {script_name}...")
        result = subprocess.run(["python", script_name], capture_output=True, text=True)
        print(result.stdout)
        if result.stderr:
            print(f"Errors in {script_name}:\n{result.stderr}")
    except Exception as e:
        print(f"Failed to run {script_name}: {e}")

if __name__ == "__main__":
    # Define the scripts to run in sequence
    repo_root = Path(__file__).resolve().parent
    scripts = [
        repo_root / "preprocess_data.py",
        repo_root / "calculate_baseline_weights.py",
        repo_root / "calculate_regression_weights.py",
        repo_root / "calculate_pca_weights.py",
        repo_root / "calculate_rf_weights.py",
        repo_root / "compare_weights.py",
        repo_root / "demographic_segmentation.py",
        repo_root / "get_weights.py"
    ]

    # Run each script
    for script in scripts:
        if script.exists():
            run_script(str(script))
        else:
            print(f"Script {script} not found.")