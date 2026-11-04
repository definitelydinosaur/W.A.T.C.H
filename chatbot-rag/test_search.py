
from app.database import get_supabase
from app.embeddings import generate_embedding

supabase = get_supabase()


def search_faq(question: str):
    print(f"\nUser question: {question}")

    # Generate embedding for the user's question
    embedding = generate_embedding(question)

    # Search Supabase using pgvector
    response = supabase.rpc(
        "match_chatbot_faqs",
        {
            "query_embedding": embedding,
            "match_threshold": 0.00,
            "match_count": 3
        }
    ).execute()

    results = response.data

    if not results:
        print("\nNo relevant FAQ found.")
        return

    print("\nMatching FAQs:")

    for result in results:
        print("\n--------------------------")
        print("Question:", result["question"])
        print("Answer:", result["answer"])
        print("Category:", result["category"])
        print("Similarity:", round(result["similarity"], 4))


if __name__ == "__main__":
    search_faq("What is W.A.T.C.H.?")
