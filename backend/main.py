from fastapi import FastAPI
from routers import access_matrix

app = FastAPI(
    title = "Request Manager Application",
    description= "Security Manager",
    version = "0.1.0"
)

app.include_router(access_matrix.router)

@app.get("/api/health")
async def health():
    return {"status": "health",
            "service": "Securty Management"}