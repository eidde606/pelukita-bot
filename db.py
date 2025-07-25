# db.py
from pymongo import MongoClient
import os


client = MongoClient(os.getenv("MONGODB_URI"))

db = client["pelukita_db"]
sessions = db["sessions"]


def get_or_create_session(sender_id):
    session = sessions.find_one({"senderId": sender_id})
    if not session:
        session = {"senderId": sender_id, "messages": [], "data": {}}
        sessions.insert_one(session)
    return session


def update_session(sender_id, messages, data):
    print(f"💾 Updating session for {sender_id}")
    print(f"Data: {data}")
    sessions.update_one(
        {"senderId": sender_id}, {"$set": {"messages": messages, "data": data}}
    )


def clear_session(sender_id):
    sessions.delete_one({"senderId": sender_id})


def get_session(sender_id):
    return sessions.find_one({"senderId": sender_id})


from pymongo import MongoClient
import os

MONGODB_URI = os.getenv("MONGODB_URI")
client = MongoClient(MONGODB_URI)
db = client["pelukita"]
collection = db["bookings"]


async def create_booking(data):
    try:
        collection.insert_one(data)
        print("✅ Booking saved to MongoDB")
    except Exception as e:
        print("❌ Error saving booking:", e)
