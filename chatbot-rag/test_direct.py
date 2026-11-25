import os
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("OPENROUTER_API_KEY")

response = requests.post(
    "https://openrouter.ai/api/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
       "model": "liquid/lfm-3-1.7b:free",
        "messages": [
            {
                "role": "user",
                "content": "Say hello in one sentence."
            }
        ],
        "max_tokens": 100,
    },
    timeout=60,
)

print("HTTP Status:", response.status_code)
print("Response:", response.text)