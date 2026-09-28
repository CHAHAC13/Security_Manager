"""Serves the Vite-built React SPA with client-side routing support."""

import os
import http.server
import socketserver

PORT = int(os.environ.get("DATABRICKS_APP_PORT", 8000))
DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "dist")


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    """Falls back to index.html for any path that doesn't match a static file
    — required for React Router's client-side routing to work."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def do_GET(self):
        file_path = self.translate_path(self.path)
        if not os.path.isfile(file_path):
            self.path = "/index.html"
        return super().do_GET()

    def log_message(self, fmt, *args):
        """Suppress noisy per-request logs in production."""
        pass


def main():
    with socketserver.TCPServer(("", PORT), SPAHandler) as httpd:
        print(f"Serving Security Manager on http://0.0.0.0:{PORT}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
