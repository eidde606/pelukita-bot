# fb.py
import os
import requests

FB_PAGE_TOKEN = os.getenv("PAGE_ACCESS_TOKEN")


def send_facebook_message(recipient_id, text):
    url = "https://graph.facebook.com/v18.0/me/messages"
    headers = {"Content-Type": "application/json"}
    data = {"recipient": {"id": recipient_id}, "message": {"text": text}}
    params = {"access_token": FB_PAGE_TOKEN}

    response = requests.post(url, headers=headers, json=data, params=params)
    if response.status_code != 200:
        print("❌ FB send error:", response.text)


FB_PAGE_TOKEN = os.getenv("PAGE_ACCESS_TOKEN")  # ✅ from Render
