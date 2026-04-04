import pandas as pd
from sklearn.ensemble import RandomForestRegressor

# Load preprocessed dataset
preprocessed_path = "data/preprocessed_human_like_importance_dataset.csv"
df = pd.read_csv(preprocessed_path)

# Define importance columns
importance_cols = [
    'Lighting_Importance', 'Police_Importance', 'Hospital_Importance',
    'Crowd_Importance', 'Crime_Importance', 'Accident_Importance', 'Road_Importance'
]

# Create synthetic target
df['overall_score'] = df[importance_cols].mean(axis=1)

# Train Random Forest Regressor
X = df[importance_cols]
y = df['overall_score']
model = RandomForestRegressor(random_state=42)
model.fit(X, y)

# Extract and normalize feature importances
weights_rf = model.feature_importances_ / model.feature_importances_.sum()
weights_rf = weights_rf.round(2)  # Round to 2 decimal places

# Ensure weights sum to exactly 1 after rounding
if weights_rf.sum() != 1.0:
    diff = 1.0 - weights_rf.sum()
    weights_rf[weights_rf.argmax()] += diff

# Save weights to a file
weights_path = "data/weights_rf.csv"
pd.Series(weights_rf, index=importance_cols).to_csv(weights_path, header=True)

print("Random Forest weights calculated and saved to", weights_path)