# gpt_logic.py
import os
from openai import AsyncOpenAI
from db import update_session, clear_session, get_session
from emailer import send_confirmation_emails

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# System prompt customized for Pelukita
SYSTEM_PROMPT = """
You are the assistant for Pelukita’s Show, a birthday party entertainment business.
Speak in English or Spanish based on the user’s language. Explain services naturally if asked.

Booking packages:
- Paquete Pelukines ($650): up to 10 kids. Includes clown show, games, face painting, balloon animals.
- Paquete Pelukones ($1500): up to 25 kids. Includes full Pelukines + costume characters + cotton candy.

Gather these fields conversationally:
- name
- date
- time
- service
- price
- phone
- email
- address

Once everything is collected, respond with only this JSON: 
{ "action": "finalize" }

Use a warm, friendly tone like a party host!
"""


async def handle_gpt_message(sender_id, user_message, session_data):
    messages = session_data.get("messages", [])
    data = session_data.get("data", {})

    messages.append({"role": "user", "content": user_message})

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, *messages],
            temperature=0.7,
        )

        reply = response.choices[0].message.content

        if '"action": "finalize"' in reply or '{ "action": "finalize" }' in reply:
            await send_confirmation_emails(data)
            clear_session(sender_id)
            return "¡Gracias! La reservación está confirmada 🎉. Check your email for details."

        # Update the session with new message and any updates to booking info
        update_session(sender_id, messages, data)
        return reply

    except Exception as e:
        print("GPT error:", e)
        return "Oops, algo salió mal. Try again later."
