"""
Monthly Usage Reset
Run this on the 1st of every month via a cron job or Railway cron.
Resets chat_count_this_month for all clients.

Cron schedule: 0 0 1 * *  (midnight on 1st of every month)

Railway: Add as a cron job pointing to this script.
Local:   python -m scripts.reset_monthly_usage
"""
import asyncio
from sqlalchemy import update
from app.database import AsyncSessionLocal
from app.models import Client

async def reset():
    async with AsyncSessionLocal() as db:
        await db.execute(update(Client).values(chat_count_this_month=0))
        await db.commit()
        print("✓ Monthly chat counts reset for all clients")

if __name__ == "__main__":
    asyncio.run(reset())
