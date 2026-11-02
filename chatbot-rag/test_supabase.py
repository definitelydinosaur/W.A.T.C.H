
from app.database import get_supabase

supabase = get_supabase()

try:
    response = (
        supabase
        .table("chatbot_faqs")
        .select("id")
        .limit(1)
        .execute()
    )

    print("Supabase connection successful!")
    print("Database response:", response.data)

except Exception as error:
    print("Supabase connection failed!")
    print(error)
