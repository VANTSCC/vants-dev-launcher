import asyncio
import os

from aiohttp import web

_runner: web.AppRunner | None = None
_start_lock = asyncio.Lock()


async def _health(_request: web.Request) -> web.Response:
    return web.Response(text="ok")


async def start_health_server() -> None:
    global _runner

    if _runner is not None:
        return

    async with _start_lock:
        if _runner is not None:
            return

        app = web.Application()
        app.router.add_get("/", _health)

        _runner = web.AppRunner(app)
        await _runner.setup()

        port = int(os.getenv("PORT", "8080"))
        site = web.TCPSite(_runner, "0.0.0.0", port)
        await site.start()
