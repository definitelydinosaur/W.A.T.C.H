from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Literal

from app.chatbot import ask_chatbot


app = FastAPI(
    title="W.A.T.C.H. Chatbot API",
    description="RAG-powered chatbot service for W.A.T.C.H.",
    version="1.0.0"
)


# Conversation message structure
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


# Incoming chat request
class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(
        default_factory=list,
        max_length=20
    )


# Health check endpoint
@app.get("/")
def root():
    return {
        "message": "W.A.T.C.H. Chatbot API is running!"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "watch-chatbot"
    }


# Main chatbot endpoint
@app.post("/chat")
def chat(request: ChatRequest):

    try:
        # Convert Pydantic history objects into dictionaries
        conversation_history = [
            message.model_dump()
            for message in request.history
        ]

        # Process the user's question
        result = ask_chatbot(
            request.question,
            conversation_history
        )

        return {
            "success": True,
            "question": result["question"],
            "answer": result["answer"],
            "sources": result["sources"]
        }

    except Exception as error:
        print(f"Chatbot API error: {error}")

        raise HTTPException(
            status_code=500,
            detail="The chatbot encountered an error. Please try again."
        )