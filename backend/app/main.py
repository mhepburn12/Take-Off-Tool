"""
plan-takeoff backend — PDF upload, conversion, and serving.

Coordinate System & Resolution Notes
=====================================
- PDFs are rasterised at **300 DPI** using PyMuPDF (fitz).
- The conversion matrix is `fitz.Matrix(300/72, 300/72)` which scales the
  default 72-DPI PDF user-space by ~4.1667×.
- A PDF point at (x_pt, y_pt) maps to pixel (x_px, y_px) via:
      x_px = x_pt * (300 / 72)
      y_px = y_pt * (300 / 72)
- PNGs are saved as RGBA with no additional scaling or compression artefacts,
  so every pixel in the served image corresponds exactly to the above mapping.
- The frontend canvas must use the **natural image dimensions** (PNG width ×
  height) as its coordinate space so that overlay coordinates can be translated
  back to PDF points using the inverse ratio (72 / 300).
"""

from __future__ import annotations

import uuid
from pathlib import Path

import fitz  # PyMuPDF
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DPI = 300
"""Rasterisation resolution. Change this constant and re-upload to adjust."""

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="plan-takeoff")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ZOOM = DPI / 72  # 72 DPI is the PDF default user-space unit


def _convert_pdf(pdf_path: Path, out_dir: Path) -> int:
    """Render every page of *pdf_path* to a PNG in *out_dir*.

    Returns the total number of pages.
    """
    doc = fitz.open(str(pdf_path))
    mat = fitz.Matrix(ZOOM, ZOOM)
    for page_num in range(len(doc)):
        page = doc[page_num]
        pix = page.get_pixmap(matrix=mat, alpha=False)
        pix.save(str(out_dir / f"page_{page_num}.png"))
    page_count = len(doc)
    doc.close()
    return page_count


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.post("/api/upload")
async def upload_pdf(file: UploadFile):
    """Accept a PDF upload, rasterise pages at 300 DPI, return job metadata."""
    if file.content_type not in ("application/pdf",):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    job_id = uuid.uuid4().hex
    job_dir = UPLOAD_DIR / job_id
    job_dir.mkdir(parents=True)

    # Persist the original PDF
    pdf_path = job_dir / "original.pdf"
    contents = await file.read()
    pdf_path.write_bytes(contents)

    # Convert to PNGs
    page_count = _convert_pdf(pdf_path, job_dir)

    return {
        "job_id": job_id,
        "page_count": page_count,
        "dpi": DPI,
        "pages": [
            {"page": i, "url": f"/api/images/{job_id}/{i}"}
            for i in range(page_count)
        ],
    }


@app.get("/api/images/{job_id}/{page}")
async def get_page_image(job_id: str, page: int):
    """Serve a rasterised page PNG."""
    img_path = UPLOAD_DIR / job_id / f"page_{page}.png"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Image not found.")
    return FileResponse(img_path, media_type="image/png")


@app.get("/api/pdf/{job_id}")
async def get_pdf(job_id: str):
    """Serve the original uploaded PDF."""
    pdf_path = UPLOAD_DIR / job_id / "original.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found.")
    return FileResponse(pdf_path, media_type="application/pdf")
