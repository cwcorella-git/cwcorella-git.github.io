"""Seed a throwaway library-api corpus for library-links.e2e.ts. Run from the
library-api checkout (it imports backend.*). Usage: seed.py <dir>"""
import os, shutil, sys
sys.path.insert(0, os.getcwd())
from backend import store, loader
from backend.api import curation, edits
d = sys.argv[1]; shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
conn = store.connect(f"{d}/library.db"); store.init_db(conn)
rows = [("anarchist","1","p-m-bolo-bolo","Bolo’bolo"),("user","1","bolo-bolo","Bolobolo"),
        ("anarchist","2","malatesta-the-suffragettes","The Suffragettes"),("marxist","1","malatesta-the-suffragettes","The Suffragettes (marxist copy)")]
rows += [("user", str(100+i), f"filler-{i:03d}", f"Filler document {i:03d}") for i in range(150)]
for i,(src,sid,slug,title) in enumerate(rows):
    meta=dict(slug=slug,title=title,author="A",publication_date=None,language="en",document_type="book",notes=None,
              source_url=None,original_format="txt",visibility="private",license=None,tags=[],collections=[])
    loader.load_document(conn, f"{d}/bodies", src, sid, meta, f"Body of {title}. bolo sila ibu.\n".encode(), now="2026-09-26T00:00:00Z")
conn.close(); curation.init_curation_db(f"{d}/curation.db"); edits.init_edits_db(f"{d}/edits.db"); print("seeded", len(rows))
