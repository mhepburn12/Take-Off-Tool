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

import json
import math
import uuid
from pathlib import Path

import fitz  # PyMuPDF
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

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


# ---------------------------------------------------------------------------
# Calibration
# ---------------------------------------------------------------------------


class CalibrateRequest(BaseModel):
    """Body for POST /api/calibrate.

    The two pixel coordinates (x1, y1) and (x2, y2) must be expressed in
    **image-pixel space** — i.e. coordinates within the rasterised PNG, not
    screen coordinates.  The frontend overlay converts screen clicks to image
    pixels before sending this request (see Viewer.tsx for details).

    ``distance`` is the real-world length of the line in the unit given by
    ``unit``.  The backend normalises everything to millimetres internally.
    """

    job_id: str
    page: int
    x1: float
    y1: float
    x2: float
    y2: float
    distance: float
    unit: str  # "mm", "cm", "m", "in", "ft"
    dpi: int


# Multipliers to convert each supported unit into millimetres.
_UNIT_TO_MM: dict[str, float] = {
    "mm": 1.0,
    "cm": 10.0,
    "m": 1000.0,
    "in": 25.4,
    "ft": 304.8,
}

CALIBRATION_FILE = "calibration.json"


def _load_calibration(job_dir: Path) -> dict:
    path = job_dir / CALIBRATION_FILE
    if path.exists():
        return json.loads(path.read_text())
    return {}


def _save_calibration(job_dir: Path, data: dict) -> None:
    path = job_dir / CALIBRATION_FILE
    path.write_text(json.dumps(data, indent=2))


@app.post("/api/calibrate")
async def calibrate(req: CalibrateRequest):
    """Compute and store a pixels-per-millimetre ratio for a page.

    The pixel distance between the two supplied points is divided by the
    real-world distance (converted to mm) to yield ``px_per_mm``.

    The result is persisted to ``calibration.json`` inside the job directory,
    keyed by page number (as a string, since JSON keys must be strings).
    """
    job_dir = UPLOAD_DIR / req.job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="Job not found.")

    if req.unit not in _UNIT_TO_MM:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported unit '{req.unit}'. Use one of: {', '.join(_UNIT_TO_MM)}",
        )

    if req.distance <= 0:
        raise HTTPException(status_code=400, detail="Distance must be positive.")

    # Euclidean pixel distance between the two points.
    px_dist = math.hypot(req.x2 - req.x1, req.y2 - req.y1)
    if px_dist == 0:
        raise HTTPException(status_code=400, detail="The two points must not be identical.")

    distance_mm = req.distance * _UNIT_TO_MM[req.unit]
    px_per_mm = px_dist / distance_mm

    calibration = _load_calibration(job_dir)
    calibration[str(req.page)] = {
        "x1": req.x1,
        "y1": req.y1,
        "x2": req.x2,
        "y2": req.y2,
        "distance": req.distance,
        "unit": req.unit,
        "distance_mm": distance_mm,
        "px_dist": px_dist,
        "px_per_mm": px_per_mm,
        "dpi": req.dpi,
    }
    _save_calibration(job_dir, calibration)

    return {
        "px_per_mm": px_per_mm,
        "mm_per_px": 1.0 / px_per_mm,
        "px_dist": px_dist,
        "distance_mm": distance_mm,
    }


@app.get("/api/calibrate/{job_id}/{page}")
async def get_calibration(job_id: str, page: int):
    """Return the stored calibration for a given page, or 404 if none exists."""
    job_dir = UPLOAD_DIR / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="Job not found.")

    calibration = _load_calibration(job_dir)
    key = str(page)
    if key not in calibration:
        raise HTTPException(status_code=404, detail="No calibration for this page.")

    return calibration[key]
