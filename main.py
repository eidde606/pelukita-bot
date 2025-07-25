# main.py
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from gpt_logic import handle_gpt_message
from db import get_or_create_session
from fb import send_facebook_message
import uvicorn
import os

VERIFY_TOKEN = os.getenv("VERIFY_TOKEN")

app = FastAPI()


# ✅ Facebook Webhook Verification
@app.get("/webhook")
async def verify_token(request: Request):
    params = dict(request.query_params)
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == VERIFY_TOKEN:
        return int(challenge)
    return JSONResponse(status_code=403, content={"error": "Forbidden"})


# ✅ Messenger Incoming Messages
@app.post("/webhook")
async def receive_message(request: Request):
    body = await request.json()

    for entry in body.get("entry", []):
        for messaging_event in entry.get("messaging", []):
            sender_id = messaging_event["sender"]["id"]
            message = messaging_event.get("message", {}).get("text")

            if not message:
                continue

            session = get_or_create_session(sender_id)
            reply = await handle_gpt_message(sender_id, message, session)

            # ✅ Send reply back to Messenger
            send_facebook_message(sender_id, reply)

    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
