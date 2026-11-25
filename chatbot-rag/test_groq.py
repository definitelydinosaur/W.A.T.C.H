import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

API_KEY = os.getenv("GROQ_API_KEY")
MODEL = os.getenv("LLM_MODEL", "openai/gpt-oss-20b")

if not API_KEY:
    raise ValueError("GROQ_API_KEY is missing from .env")

client = OpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=API_KEY
)

try:
    print("Connecting to Groq...")

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {
                "role": "user",
                "content": "Introduce yourself as the AI assistant for W.A.T.C.H. in one sentence."
            }
        ],
        max_tokens=150
    )

    print("\nModel:", response.model)
    print("Response:", response.choices[0].message.content)
    print("\nGroq connection successful!")

except Exception as error:
    print("\nGroq request failed!")
    print(type(error).__name__)
    print(error)

finally:
    client.close()