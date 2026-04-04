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

# Define demographic groups
demographic_groups = {
    "Gender": df['Gender'].unique(),
    "Area_Type": df['Area_Type'].unique(),
    "Age_Group": pd.cut(df['Age'], bins=[0, 18, 35, 50, 100], labels=['0-18', '19-35', '36-50', '51+'])
}

# Initialize results dictionary
segmented_weights = {}

# Perform segmentation analysis
df['Age_Group'] = pd.cut(df['Age'], bins=[0, 18, 35, 50, 100], labels=['0-18', '19-35', '36-50', '51+'])
for demo, groups in demographic_groups.items():
    segmented_weights[demo] = {}
    for group in groups:
        if demo == "Age_Group":
            group_df = df[df['Age_Group'] == group]
        else:
            group_df = df[df[demo] == group]
        if group_df.empty:
            continue
        X = group_df[importance_cols]
        y = group_df['overall_score']
        model = LinearRegression()
        model.fit(X, y)
        weights = model.coef_ / model.coef_.sum()
        weights = weights.round(2)  # Round to 2 decimal places
        segmented_weights[demo][group] = weights

# Save segmented weights
segmentation_path = "data/segmented_weights.csv"
pd.DataFrame(segmented_weights).to_csv(segmentation_path)

print("Demographic segmentation analysis complete. Results saved to", segmentation_path)