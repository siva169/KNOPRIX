"""ASGI entrypoint for generic ASGI servers (PythonAnywhere, etc.).

Run locally with:  uvicorn asgi:application --port 8000
"""
from app.main import app

application = app
