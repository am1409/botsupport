from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import chat, clients, ingest, auth, billing
from app.database import init_db

app = FastAPI(
    title="SupportBot API",
    description="AI-powered customer support as a service",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://botsupport-olive.vercel.app",
        "https://landingpage-theta-tan-77.vercel.app",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await init_db()

app.include_router(auth.router,    prefix="/auth",    tags=["Auth"])
app.include_router(clients.router, prefix="/clients", tags=["Clients"])
app.include_router(ingest.router,  prefix="/ingest",  tags=["Ingestion"])
app.include_router(chat.router,    prefix="/chat",    tags=["Chat"])
app.include_router(billing.router, prefix="/billing", tags=["Billing"])

@app.get("/health")
async def health():
    return {"status": "ok"}
