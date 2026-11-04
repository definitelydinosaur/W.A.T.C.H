
from app.embeddings import generate_embedding

question = "What should I prepare during heavy rainfall?"

vector = generate_embedding(question)

print("\nQuestion:", question)
print("Embedding dimensions:", len(vector))
print("First five values:", vector[:5])

assert len(vector) == 384, "Incorrect embedding dimensions!"

print("\nEmbedding test passed!")
