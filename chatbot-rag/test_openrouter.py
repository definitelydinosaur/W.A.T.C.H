
import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

print("API key loaded:", bool(os.getenv("OPENROUTER_API_KEY")))
print("API key prefix:", os.getenv("OPENROUTER_API_KEY", "")[:7])

API_KEY = os.getenv("OPENROUTER_API_KEY")
MODEL = os.getenv(
    "LLM_MODEL",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
)

if not API_KEY:
    raise ValueError("OPENROUTER_API_KEY is missing from .env")

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=API_KEY,
)

print("Connecting to OpenRouter...", flush=True)
print("Model:", MODEL)

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
    print("Error type:", type(error).__name__)
    print("Error:", error)

    if hasattr(error, "response") and error.response is not None:
        print("HTTP status:", error.response.status_code)
        print("Response body:", error.response.text)

finally:
    client.close()
