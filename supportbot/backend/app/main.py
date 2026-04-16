from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.routers import chat, clients, ingest, auth, billing
from app.database import init_db
import os

app = FastAPI(
    title="SupportBot API",
    description="AI-powered customer support as a service",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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

@app.get("/widget.js")
async def widget():
    # Try multiple possible paths
    possible_paths = [
        "/app/widget/widget.js",
        os.path.join(os.path.dirname(__file__), "..", "..", "widget", "widget.js"),
        os.path.join(os.path.dirname(__file__), "..", "widget", "widget.js"),
        os.path.join(os.path.dirname(__file__), "widget", "widget.js"),
    ]
    for path in possible_paths:
        resolved = os.path.realpath(path)
        if os.path.exists(resolved):
            return FileResponse(resolved, media_type="application/javascript")
    return {"error": "widget not found", "tried": possible_paths}
@app.get("/health")
async def health():
    return {"status": "ok"}
