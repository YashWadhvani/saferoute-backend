import pandas as pd
from sklearn.decomposition import PCA

# Load preprocessed dataset
preprocessed_path = "data/preprocessed_human_like_importance_dataset.csv"
df = pd.read_csv(preprocessed_path)

# Define importance columns
importance_cols = [
    'Lighting_Importance', 'Police_Importance', 'Hospital_Importance',
    'Crowd_Importance', 'Crime_Importance', 'Accident_Importance', 'Road_Importance'
]

# Apply PCA
pca = PCA(n_components=1)
pca.fit(df[importance_cols])

# Extract and normalize weights
weights_pca = pca.components_[0] / pca.components_[0].sum()
weights_pca = weights_pca.round(2)  # Round to 2 decimal places

# Ensure weights sum to exactly 1 after rounding
if weights_pca.sum() != 1.0:
    diff = 1.0 - weights_pca.sum()
    weights_pca[weights_pca.argmax()] += diff

# Save weights to a file
weights_path = "data/weights_pca.csv"
pd.Series(weights_pca, index=importance_cols).to_csv(weights_path, header=True)

print("PCA weights calculated and saved to", weights_path)