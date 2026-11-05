
import os

from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise ValueError("GEMINI_API_KEY is missing!")

client = genai.Client(
    api_key=API_KEY,
    http_options=types.HttpOptions(
        timeout=120000
    )
)

try:
    print("Gemini client initialized!")
    print("Sending request...")

    response = client.models.generate_content(
        model="gemini-3.8-flash",
        contents="Reply with exactly: W.A.T.C.H. is online!",
        config=types.GenerateContentConfig(
            max_output_tokens=50
        )
    )

    print("\nGemini response:")
    print(response.text)

except Exception as error:
    print("\nGemini request failed!")
    print(type(error).__name__)
    print(error)

finally:
    client.close()
