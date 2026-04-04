import pandas as pd
from sklearn.linear_model import LinearRegression

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

# Train Linear Regression model
X = df[importance_cols]
y = df['overall_score']
model = LinearRegression()
model.fit(X, y)

# Extract and normalize weights
weights_regression = model.coef_ / model.coef_.sum()
weights_regression = weights_regression.round(2)  # Round to 2 decimal places

# Ensure weights sum to exactly 1 after rounding
if weights_regression.sum() != 1.0:
    diff = 1.0 - weights_regression.sum()
    weights_regression[weights_regression.argmax()] += diff

# Save weights to a file
weights_path = "data/weights_regression.csv"
pd.Series(weights_regression, index=importance_cols).to_csv(weights_path, header=True)

print("Linear Regression weights calculated and saved to", weights_path)