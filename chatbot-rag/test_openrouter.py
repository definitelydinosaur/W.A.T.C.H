import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

API_KEY = os.getenv("OPENROUTER_API_KEY")
MODEL = os.getenv("LLM_MODEL", "openrouter/free")

if not API_KEY:
    raise ValueError("OPENROUTER_API_KEY is missing from .env")

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=API_KEY,
)

print("Connecting to OpenRouter...", flush=True)

try:
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {
                "role": "user",
                "content": "Introduce yourself as the AI assistant for W.A.T.C.H. in one sentence."
            }
        ],
        max_tokens=100,
    )

    print("\nModel:", response.model)
    print("Response:", response.choices[0].message.content)

    print("\nOpenRouter connection successful!")

except Exception as error:
    print("\nOpenRouter request failed!")
    print(type(error).__name__)
    print(error)

finally:
    client.close()