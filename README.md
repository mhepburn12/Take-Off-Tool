# Plan Take-Off Tool

PDF upload → page rasterisation → zoomable viewer. Built for pixel-perfect plan measurement overlays.

## Architecture

```
backend/          Python 3.11+ · FastAPI · PyMuPDF
  app/main.py     All API endpoints
  uploads/        Runtime directory for PDFs & PNGs (gitignored)

frontend/         React 18 · TypeScript · Vite
  src/components/ UploadPage, Viewer (react-zoom-pan-pinch)
```

## Quick start

### Backend

```bash
cd backend
uv sync              # install deps into .venv
uv run uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # Vite dev server on :5173, proxies /api → :8000
```

Open http://localhost:5173, upload a PDF, and navigate pages.

## Resolution & coordinate system

| Constant | Value |
|---|---|
| Rasterisation DPI | **300** |
| PDF default DPI | 72 |
| Scale factor | 300 / 72 ≈ **4.1667** |

**Pixel → PDF point:** `pt = px / (300 / 72)`
**PDF point → pixel:** `px = pt * (300 / 72)`

The viewer renders PNGs at their natural pixel dimensions (no CSS scaling at zoom 1×), so overlay coordinates expressed in pixels map directly to the rasterised image.

## API

| Method | Path | Description |
|---|---|---|
| POST | `/api/upload` | Upload a PDF. Returns `{ job_id, page_count, dpi, pages }` |
| GET | `/api/images/{job_id}/{page}` | Serve a rasterised page PNG |
| GET | `/api/pdf/{job_id}` | Serve the original PDF |
