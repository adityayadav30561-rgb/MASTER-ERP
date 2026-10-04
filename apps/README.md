# apps/

Deployable programs (Step 9 §4.2). Planned:

- `server/` — one Docker image with two start commands: the **web** process (HTTP API) and the **worker** process (jobs, outbox, PDFs). Slice 0.
- `web/` — the React single-page app / PWA (ADR-0056). Slice 0.

Apps may import everything below them; nothing imports an app.
