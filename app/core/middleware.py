from starlette.types import ASGIApp, Receive, Scope, Send


class SecurityHeadersMiddleware:
    """
    ASGI Middleware that injects essential security headers into all HTTP responses.
    - X-Frame-Options: DENY
    - X-Content-Type-Options: nosniff
    - Strict-Transport-Security: max-age=31536000; includeSubDomains
    - Referrer-Policy: strict-origin-when-cross-origin
    - Permissions-Policy: geolocation=(), microphone=(), camera=()
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                sec_headers = [
                    (b"x-frame-options", b"DENY"),
                    (b"x-content-type-options", b"nosniff"),
                    (b"strict-transport-security", b"max-age=31536000; includeSubDomains"),
                    (b"referrer-policy", b"strict-origin-when-cross-origin"),
                    (b"permissions-policy", b"geolocation=(), microphone=(), camera=()"),
                ]
                existing_names = {k.lower() for k, _ in sec_headers}
                filtered_headers = [
                    (k, v) for k, v in headers if k.lower() not in existing_names
                ]
                filtered_headers.extend(sec_headers)
                message["headers"] = filtered_headers
            await send(message)

        await self.app(scope, receive, send_wrapper)
