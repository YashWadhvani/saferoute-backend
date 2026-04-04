import pandas as pd

# Load preprocessed dataset
preprocessed_path = "data/preprocessed_human_like_importance_dataset.csv"
df = pd.read_csv(preprocessed_path)

# Calculate mean importance for each factor
importance_cols = [
    'Lighting_Importance', 'Police_Importance', 'Hospital_Importance',
    'Crowd_Importance', 'Crime_Importance', 'Accident_Importance', 'Road_Importance'
]
mean_importance = df[importance_cols].mean()

# Normalize weights so that their sum equals 1
weights_mean = mean_importance / mean_importance.sum()
weights_mean = weights_mean.round(2)  # Round to 2 decimal places

# Ensure weights sum to exactly 1 after rounding
if weights_mean.sum() != 1.0:
    diff = 1.0 - weights_mean.sum()
    weights_mean[weights_mean.argmax()] += diff

# Save weights to a file
weights_path = "data/weights_mean.csv"
weights_mean.to_csv(weights_path, header=True)

print("Baseline weights (mean importance) calculated and saved to", weights_path)