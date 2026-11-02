from app.chatbot import ask_chatbot


if __name__ == "__main__":

    conversation_history = []

    print("\n================================")
    print("W.A.T.C.H. CHATBOT")
    print("You are chatting with Eric!")
    print("Type 'exit' to end the conversation.")
    print("================================")

    while True:

        question = input("\nYou: ").strip()

        if question.lower() in ["exit", "quit", "bye"]:
            print("\nEric: Goodbye! Stay safe!")
            break

        if not question:
            continue

        try:
            result = ask_chatbot(
                question,
                conversation_history
            )

            answer = result["answer"]

            print("\nEric:")
            print(answer)

            # Save the conversation.
            conversation_history.append({
                "role": "user",
                "content": question
            })

            conversation_history.append({
                "role": "assistant",
                "content": answer
            })

        except Exception as error:
            print("\nSomething went wrong:")
            print(error)