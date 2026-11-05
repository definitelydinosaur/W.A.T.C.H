
import pandas as pd

from app.database import get_supabase
from app.embeddings import generate_embedding

EXCEL_FILE = "data/watch_faq.xlsx"

def ingest_faqs():
    print("Reading Excel FAQ file...")

    df = pd.read_excel(EXCEL_FILE)

    required_columns = ["Question", "Answer", "Category"]

    for column in required_columns:
        if column not in df.columns:
            raise ValueError(f"Missing Excel column: {column}")

    supabase = get_supabase()

    print(f"Found {len(df)} FAQ entries.")

    for index, row in df.iterrows():
        question = str(row["Question"]).strip()
        answer = str(row["Answer"]).strip()
        category = str(row["Category"]).strip()

        if not question or not answer:
            print(f"Skipping empty row {index + 2}")
            continue

        print(f"\nProcessing: {question}")

        embedding = generate_embedding(question)

        faq_data = {
            "question": question,
            "answer": answer,
            "category": category,
            "embedding": embedding
        }

        supabase.table("chatbot_faqs").insert(
            faq_data
        ).execute()

        print("Inserted successfully!")

    print("\nFAQ ingestion completed!")


if __name__ == "__main__":
    ingest_faqs()
