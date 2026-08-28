"""
Send SMS/WhatsApp only to REGISTERED users after a paid interest request.

Never contact people who did not opt into MatchHunter.
Set TWILIO_* env vars. Wire this to a Supabase webhook on transactions.status = success.
"""

from __future__ import annotations

import os
import sys


def send_interest_notice(partner_phone: str, requester_name: str, approve_url: str) -> None:
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
    if not sid or not token:
        print("Twilio is not configured. Skipping send.")
        print(f"Would notify {partner_phone}: {requester_name} -> {approve_url}")
        return

    from twilio.rest import Client  # type: ignore

    body = (
        f"MatchHunter: {requester_name} is interested in connecting. "
        f"Open the app to approve or decline: {approve_url}"
    )
    client = Client(sid, token)
    client.messages.create(from_=from_number, to=f"whatsapp:{partner_phone}", body=body)
    print("sent")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("usage: python notify.py <partner_phone> <requester_name> <approve_url>")
        raise SystemExit(1)
    send_interest_notice(sys.argv[1], sys.argv[2], sys.argv[3])
