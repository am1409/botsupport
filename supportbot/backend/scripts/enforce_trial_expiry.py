"""
Trial Expiry Enforcement Script
Run daily via Railway cron: 0 9 * * *

What it does:
1. Finds all accounts still on 'trialing' status
2. Checks if their trial_ends_at date has passed
3. Sets subscription_status to 'trial_expired' for expired accounts
4. This blocks their bot and dashboard access automatically
"""
import asyncio
from datetime import datetime, timezone
from sqlalchemy import select, update
from app.database import AsyncSessionLocal
from app.models import Client

async def enforce_trial_expiry():
    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)

        # Find all trialing accounts whose trial has expired
        result = await db.execute(
            select(Client).where(
                Client.subscription_status == "trialing",
                Client.trial_ends_at != None,
                Client.trial_ends_at < now,
            )
        )
        expired = result.scalars().all()

        if not expired:
            print(f"✓ No expired trials found at {now.strftime('%Y-%m-%d %H:%M')}")
            return

        for client in expired:
            client.subscription_status = "trial_expired"
            print(f"⚠ Trial expired: {client.email} ({client.company_name}) — expired {client.trial_ends_at}")

        await db.commit()
        print(f"✓ Marked {len(expired)} account(s) as trial_expired")

if __name__ == "__main__":
    asyncio.run(enforce_trial_expiry())
