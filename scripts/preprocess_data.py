import pandas as pd
import os
from sklearn.preprocessing import LabelEncoder, MinMaxScaler

# Ensure the data directory exists
os.makedirs("data", exist_ok=True)

# Load dataset
data_path = "data/human_like_importance_dataset.csv"
df = pd.read_csv(data_path)

# Handle categorical features
label_encoders = {}
for col in ['Gender', 'Area_Type']:
    le = LabelEncoder()
    df[col] = le.fit_transform(df[col])
    label_encoders[col] = le

# Normalize importance scores
importance_cols = [
    'Lighting_Importance', 'Police_Importance', 'Hospital_Importance',
    'Crowd_Importance', 'Crime_Importance', 'Accident_Importance', 'Road_Importance'
]
scaler = MinMaxScaler()
df[importance_cols] = scaler.fit_transform(df[importance_cols])

# Handle missing values
# Exclude non-numeric columns from mean calculation
numeric_cols = df.select_dtypes(include=['number']).columns
df[numeric_cols] = df[numeric_cols].fillna(df[numeric_cols].mean())

# Save preprocessed data
preprocessed_path = "data/preprocessed_human_like_importance_dataset.csv"
df.to_csv(preprocessed_path, index=False)

print(f"Preprocessing complete. Preprocessed data saved to {preprocessed_path}")