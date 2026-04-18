#!/usr/bin/env python3
"""
Servidor HTTP local com Cache-Control adequado para desenvolvimento
(evita JS/HTML antigos em cache após refresh).

Uso: python serve.py
Abre: http://127.0.0.1:8080/
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os


class DevHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(os.environ.get("PORT", "8080"))
    httpd = ThreadingHTTPServer(("", port), DevHandler)
    print(f"Servindo em http://127.0.0.1:{port}/ (Ctrl+C para sair)")
    httpd.serve_forever()
