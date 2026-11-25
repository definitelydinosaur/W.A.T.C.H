
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Literal

from app.chatbot import ask_chatbot, analyze_report


app = FastAPI(
    title="W.A.T.C.H. Chatbot API",
    description="RAG-powered chatbot and AI report analysis service for W.A.T.C.H.",
    version="1.1.0"
)



class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str



class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)

    history: list[ChatMessage] = Field(
        default_factory=list,
        max_length=20
    )



class ReportAnalysisRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)

    history: list[ChatMessage] = Field(
        default_factory=list,
        max_length=20
    )


class ReportAnalysisResponse(BaseModel):
    status: Literal[
        "valid",
        "needs_more_info",
        "out_of_scope"
    ]

    category: Literal[
        "bug",
        "feedback",
        "suggestion"
    ] | None = None

    title: str | None = None
    description: str | None = None
    affected_feature: str | None = None
    follow_up_question: str | None = None
    reason: str



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



@app.post("/chat")
def chat(request: ChatRequest):

    try:
        conversation_history = [
            message.model_dump()
            for message in request.history
        ]

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




@app.post(
    "/analyze-report",
    response_model=ReportAnalysisResponse
)
def analyze_report_endpoint(request: ReportAnalysisRequest):

    try:
        conversation_history = [
            message.model_dump()
            for message in request.history
        ]

        result = analyze_report(
            request.message,
            conversation_history
        )

        return result

    except Exception as error:
        print(f"Report Analyst API error: {error}")

        raise HTTPException(
            status_code=500,
            detail="The AI Report Analyst encountered an error. Please try again."
        )
