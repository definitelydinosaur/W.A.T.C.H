import os
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("OPENROUTER_API_KEY")

response = requests.get(
    "https://openrouter.ai/api/v1/key",
    headers={
        "Authorization": f"Bearer {API_KEY}"
    },
    timeout=30
)

print("HTTP Status:", response.status_code)
print("Response:", response.text)