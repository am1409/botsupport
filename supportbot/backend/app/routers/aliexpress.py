from fastapi import APIRouter
from fastapi.responses import JSONResponse
import httpx

router = APIRouter()

RAPIDAPI_KEY = "eb4f1e5a08msh2d0d2cae2651ceap1a2460jsn1e30452a1e57"

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
}

@router.options("/aliexpress")
async def aliexpress_options():
    return JSONResponse(content={}, headers=CORS_HEADERS)

@router.get("/aliexpress")
async def aliexpress_search(q: str = "trending"):
    url = "https://aliexpress-datahub.p.rapidapi.com/item_search_2"
    params = {
        "q": q,
        "page": "1",
        "sort": "default"
    }
    headers = {
        "Content-Type": "application/json",
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": "aliexpress-datahub.p.rapidapi.com"
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params, headers=headers)
    return JSONResponse(content=response.json(), headers=CORS_HEADERS)
