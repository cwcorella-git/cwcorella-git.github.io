# Serves build/ the way Cloudflare Pages does for this site: /library -> library.html,
# /library/* -> 404.html with 200 (static/_redirects), unknown -> 404.html with 404.
import http.server, os, sys
ROOT = sys.argv[1]
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s,*a,**k): super().__init__(*a,directory=ROOT,**k)
    def do_GET(s):
        path = s.path.split('?')[0]
        f = os.path.join(ROOT, path.lstrip('/'))
        if os.path.isfile(f): return super().do_GET()
        if os.path.isfile(f + '.html'): s.path = path + '.html'; return super().do_GET()
        if os.path.isdir(f) and os.path.isfile(os.path.join(f, 'index.html')): return super().do_GET()
        body = open(os.path.join(ROOT, '404.html'), 'rb').read()
        s.send_response(200 if path.startswith('/library/') else 404)
        s.send_header('Content-Type','text/html'); s.send_header('Content-Length',str(len(body))); s.end_headers(); s.wfile.write(body)
    def log_message(s,*a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[2])), H).serve_forever()
