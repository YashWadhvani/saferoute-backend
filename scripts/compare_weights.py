import pandas as pd
import matplotlib.pyplot as plt

# Load weights
weights_mean = pd.read_csv("data/weights_mean.csv", index_col=0).squeeze("columns")
weights_regression = pd.read_csv("data/weights_regression.csv", index_col=0).squeeze("columns")
weights_pca = pd.read_csv("data/weights_pca.csv", index_col=0).squeeze("columns")
weights_rf = pd.read_csv("data/weights_rf.csv", index_col=0).squeeze("columns")

# Combine weights into a single DataFrame
weights_comparison = pd.DataFrame({
    "Mean": weights_mean,
    "Regression": weights_regression,
    "PCA": weights_pca,
    "RandomForest": weights_rf
})

# Save comparison table
comparison_path = "data/weights_comparison.csv"
weights_comparison.to_csv(comparison_path)

# Plot bar chart
weights_comparison.plot(kind="bar", figsize=(10, 6))
plt.title("Comparison of Weights by Method")
plt.ylabel("Weight")
plt.xlabel("Factors")
plt.xticks(rotation=45)
plt.legend(title="Method")
plt.tight_layout()
plt.savefig("data/weights_comparison.png")
plt.show()

print("Weights comparison table saved to", comparison_path)
print("Bar chart saved as weights_comparison.png")