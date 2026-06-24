from fastapi import APIRouter
import httpx

router = APIRouter()

RAPIDAPI_KEY = "eb4f1e5a08msh2d0d2cae2651ceap1a2460jsn1e30452a1e57"

@router.get("/aliexpress")
async def aliexpress_search(q: str = "trending"):
    url = "https://free-aliexpress-all-data.p.rapidapi.com/api/aliexpress/search"
    params = {
        "q": q,
        "language": "en",
        "currency": "EUR",
        "sort": "LAST_VOLUME_DESC",
        "page": "1",
        "page_size": "12",
        "ship_to": "NL"
    }
    headers = {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": "free-aliexpress-all-data.p.rapidapi.com"
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params, headers=headers)
    return response.json()
