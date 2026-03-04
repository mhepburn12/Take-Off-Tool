"""
plan-takeoff backend — PDF upload, conversion, calibration, and AI extraction.

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

import base64
import json
import math
import uuid
from pathlib import Path

import anthropic
import fitz  # PyMuPDF
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DPI = 300
"""Rasterisation resolution. Change this constant and re-upload to adjust."""

DEFAULT_CEILING_HEIGHT_MM = 2400
"""Default floor-to-ceiling height in millimetres, used for wall area calc."""

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


def _load_job(job_id: str) -> dict:
    """Load a job's metadata JSON from disk, or return empty dict."""
    job_dir = UPLOAD_DIR / job_id
    meta_path = job_dir / "job.json"
    if meta_path.exists():
        return json.loads(meta_path.read_text())
    return {}


def _save_job(job_id: str, data: dict) -> None:
    """Persist a job's metadata JSON to disk."""
    job_dir = UPLOAD_DIR / job_id
    meta_path = job_dir / "job.json"
    meta_path.write_text(json.dumps(data, indent=2))


def _shoelace_area(vertices: list[list[float]]) -> float:
    """Compute the area of a polygon using the shoelace formula.

    *vertices* is a list of [x, y] pairs.  Returns the **absolute** area in
    square-pixel units.
    """
    n = len(vertices)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        x1, y1 = vertices[i]
        x2, y2 = vertices[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def _segment_length_px(p1: list[float], p2: list[float]) -> float:
    """Euclidean distance between two pixel-coordinate points."""
    return math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2)


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

    # Initialise job metadata
    job_meta = {
        "job_id": job_id,
        "page_count": page_count,
        "dpi": DPI,
        "ceiling_height_mm": DEFAULT_CEILING_HEIGHT_MM,
        "calibrations": {},  # keyed by page number (string)
        "results": {},       # keyed by page number (string)
    }
    _save_job(job_id, job_meta)

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


@app.post("/api/calibrate/{job_id}/{page}")
async def calibrate_page(job_id: str, page: int, body: dict):
    """Store a calibration for a specific page.

    Expected JSON body::

        {
            "pixel_length": 542.0,
            "real_length_mm": 3000.0
        }

    *pixel_length* is the distance in image-pixel units between two points the
    user drew on the plan.  *real_length_mm* is the real-world distance those
    two points represent, in millimetres.

    The derived **scale** (mm-per-pixel) is stored so that downstream
    extraction can convert pixel measurements to real-world units.
    """
    job_dir = UPLOAD_DIR / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="Job not found.")

    pixel_length = body.get("pixel_length")
    real_length_mm = body.get("real_length_mm")
    if pixel_length is None or real_length_mm is None:
        raise HTTPException(
            status_code=400,
            detail="Both pixel_length and real_length_mm are required.",
        )
    if pixel_length <= 0 or real_length_mm <= 0:
        raise HTTPException(status_code=400, detail="Lengths must be positive.")

    mm_per_pixel = real_length_mm / pixel_length

    job_meta = _load_job(job_id)
    if not job_meta:
        raise HTTPException(status_code=404, detail="Job metadata not found.")

    job_meta.setdefault("calibrations", {})[str(page)] = {
        "pixel_length": pixel_length,
        "real_length_mm": real_length_mm,
        "mm_per_pixel": mm_per_pixel,
    }
    _save_job(job_id, job_meta)

    return {"status": "ok", "mm_per_pixel": mm_per_pixel}


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

EXTRACTION_PROMPT = """\
You are an architectural floor-plan analyser. You will be given a rasterised \
image of a single page from a building floor plan.

Identify **every distinct room or space** visible in the plan. For each room \
return:

1. **label** — a human-readable name (e.g. "Kitchen", "Bedroom 1", "Hallway", \
"WC", "Living Room"). Use the labels printed on the plan if visible; otherwise \
infer from context.

2. **vertices** — the polygon boundary as a list of [x, y] pixel-coordinate \
pairs, ordered **clockwise**. Place vertices on the wall centre-lines (or \
inner wall faces) as drawn. Be precise — the coordinates will be used to \
render an overlay on top of this exact image. Include enough vertices to \
capture the room shape accurately (use more points for curves or jogs).

3. **edges** — for each consecutive pair of vertices (wrapping from last back \
to first), classify the edge as one of: "exterior_wall", "interior_wall", \
"window", or "door". The length of this array must equal the length of \
vertices.

Respond with **strict JSON only** — no markdown fences, no commentary, no \
trailing commas. Use this exact schema:

{
  "rooms": [
    {
      "label": "<string>",
      "vertices": [[x1,y1],[x2,y2],...],
      "edges": ["exterior_wall","interior_wall",...]
    }
  ]
}
"""


@app.post("/api/extract/{job_id}/{page}")
async def extract_measurements(job_id: str, page: int):
    """Send page image to Claude for room extraction, compute measurements.

    Requires calibration to have been set for this page first.
    """
    job_dir = UPLOAD_DIR / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="Job not found.")

    img_path = job_dir / f"page_{page}.png"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Page image not found.")

    job_meta = _load_job(job_id)
    if not job_meta:
        raise HTTPException(status_code=404, detail="Job metadata not found.")

    calibration = job_meta.get("calibrations", {}).get(str(page))
    if not calibration:
        raise HTTPException(
            status_code=400,
            detail="Page has not been calibrated. Set calibration first.",
        )

    mm_per_pixel = calibration["mm_per_pixel"]
    ceiling_height_mm = job_meta.get("ceiling_height_mm", DEFAULT_CEILING_HEIGHT_MM)

    # ------------------------------------------------------------------
    # 1. Send image to Claude
    # ------------------------------------------------------------------
    image_bytes = img_path.read_bytes()
    image_b64 = base64.standard_b64encode(image_bytes).decode("ascii")

    client = anthropic.Anthropic()  # uses ANTHROPIC_API_KEY env var
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": image_b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": EXTRACTION_PROMPT,
                    },
                ],
            }
        ],
    )

    # ------------------------------------------------------------------
    # 2. Parse the JSON response
    # ------------------------------------------------------------------
    raw_text = message.content[0].text.strip()
    # Strip markdown fences if model included them despite instructions
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[1]  # remove opening fence line
        if raw_text.endswith("```"):
            raw_text = raw_text[: -len("```")].rstrip()

    try:
        extraction = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Claude returned invalid JSON: {exc}",
        )

    rooms_raw = extraction.get("rooms", [])

    # ------------------------------------------------------------------
    # 3. Compute measurements for each room
    # ------------------------------------------------------------------
    rooms_out: list[dict] = []
    for room in rooms_raw:
        label = room.get("label", "Unknown")
        vertices = room.get("vertices", [])
        edges = room.get("edges", [])

        # Floor area via shoelace
        area_px2 = _shoelace_area(vertices)
        area_mm2 = area_px2 * (mm_per_pixel ** 2)
        area_m2 = area_mm2 / 1_000_000.0

        # Wall segments
        n = len(vertices)
        walls: list[dict] = []
        for i in range(n):
            p1 = vertices[i]
            p2 = vertices[(i + 1) % n]
            length_px = _segment_length_px(p1, p2)
            length_mm = length_px * mm_per_pixel
            wall_area_mm2 = length_mm * ceiling_height_mm
            wall_area_m2 = wall_area_mm2 / 1_000_000.0
            edge_type = edges[i] if i < len(edges) else "interior_wall"
            walls.append({
                "from": p1,
                "to": p2,
                "edge_type": edge_type,
                "length_mm": round(length_mm, 1),
                "wall_area_m2": round(wall_area_m2, 3),
            })

        rooms_out.append({
            "label": label,
            "vertices": vertices,       # pass-through from Claude exactly
            "edges": edges,             # pass-through from Claude exactly
            "floor_area_m2": round(area_m2, 2),
            "walls": walls,
            "ceiling_height_mm": ceiling_height_mm,
        })

    # ------------------------------------------------------------------
    # 4. Store results
    # ------------------------------------------------------------------
    page_results = {
        "mm_per_pixel": mm_per_pixel,
        "ceiling_height_mm": ceiling_height_mm,
        "rooms": rooms_out,
    }
    job_meta.setdefault("results", {})[str(page)] = page_results
    _save_job(job_id, job_meta)

    return page_results


# ---------------------------------------------------------------------------
# Results
# ---------------------------------------------------------------------------


@app.get("/api/results/{job_id}/{page}")
async def get_results(job_id: str, page: int):
    """Return previously computed extraction results for a page."""
    job_dir = UPLOAD_DIR / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="Job not found.")

    job_meta = _load_job(job_id)
    if not job_meta:
        raise HTTPException(status_code=404, detail="Job metadata not found.")

    page_results = job_meta.get("results", {}).get(str(page))
    if not page_results:
        raise HTTPException(
            status_code=404,
            detail="No results for this page. Run extraction first.",
        )

    return page_results
