from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.routers import chat, clients, ingest, auth, billing, aliexpress
from app.database import init_db
from fastapi.responses import HTMLResponse
from app.routers import products, orders, listing_agent, payment
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

@app.get("/scorer", response_class=HTMLResponse)
async def scorer():
    path = os.path.join(os.path.dirname(__file__), "scorer.html")
    with open(path) as f:
        return f.read()

@app.on_event("startup")
async def startup():
    await init_db()

@app.get("/", response_class=HTMLResponse)
async def storefront():
    path = os.path.join(os.path.dirname(__file__), "index.html")
    with open(path) as f:
        return f.read()

app.include_router(auth.router,    prefix="/auth",    tags=["Auth"])
app.include_router(clients.router, prefix="/clients", tags=["Clients"])
app.include_router(ingest.router,  prefix="/ingest",  tags=["Ingestion"])
app.include_router(chat.router,    prefix="/chat",    tags=["Chat"])
app.include_router(billing.router, prefix="/billing", tags=["Billing"])
app.include_router(aliexpress.router, tags=["AliExpress"])
app.include_router(products.router,      tags=["Products"])
app.include_router(orders.router,        tags=["Orders"])
app.include_router(listing_agent.router, tags=["Listing"])
app.include_router(payment.router,       tags=["Payment"])

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/widget.js")
async def widget():
    widget_path = os.path.join(os.path.dirname(__file__), "widget.js")
    return FileResponse(widget_path, media_type="application/javascript")
@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/admin", response_class=HTMLResponse)
async def admin_panel():
    path = os.path.join(os.path.dirname(__file__), "admin.html")
    with open(path) as f:
        return f.read()

@app.get("/listing", response_class=HTMLResponse)
async def listing_panel():
    path = os.path.join(os.path.dirname(__file__), "listing_agent.html")
    with open(path) as f:
        return f.read()
