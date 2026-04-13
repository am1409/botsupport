from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # Anthropic
    anthropic_api_key: str

    # Supabase (postgres + pgvector)
    supabase_url: str
    supabase_key: str
    database_url: str  # postgres://user:pass@host:5432/db

    # Stripe
    stripe_secret_key: str
    stripe_webhook_secret: str
    stripe_price_id_starter: str   # €99/mo
    stripe_price_id_pro: str       # €299/mo
    stripe_price_id_enterprise: str # €599/mo

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # App
    app_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()
