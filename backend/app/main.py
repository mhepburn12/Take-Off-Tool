"""
plan-takeoff backend — PDF upload, conversion, AI extraction, and polygon validation.

Coordinate System & Resolution Notes
=====================================
- PDFs are rasterised at **300 DPI** using PyMuPDF (fitz).
- The conversion matrix is ``fitz.Matrix(300/72, 300/72)`` which scales the
  default 72-DPI PDF user-space by ~4.1667x.
- A PDF point at (x_pt, y_pt) maps to pixel (x_px, y_px) via::

      x_px = x_pt * (300 / 72)
      y_px = y_pt * (300 / 72)

- PNGs are saved as RGBA with no additional scaling or compression artefacts,
  so every pixel in the served image corresponds exactly to the above mapping.
- The frontend canvas must use the **natural image dimensions** (PNG width x
  height) as its coordinate space so that overlay coordinates can be translated
  back to PDF points using the inverse ratio (72 / 300).
"""

from __future__ import annotations

import base64
import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
from anthropic import Anthropic, APIError
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from shapely.geometry import Polygon as ShapelyPolygon
from shapely.validation import explain_validity

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logger = logging.getLogger("plan-takeoff")
logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DPI: int = 300
"""Rasterisation resolution. Change this constant and re-upload to adjust."""

UPLOAD_DIR: Path = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_RETRIES: int = 2
"""Maximum number of automatic retries for Claude API calls."""

DEFAULT_MODEL: str = "claude-sonnet-4-20250514"
"""Default Claude model to use for AI extraction."""

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
# Pydantic models
# ---------------------------------------------------------------------------


class Point(BaseModel):
    """A 2D point in pixel coordinates."""

    x: float
    y: float


class PolygonInput(BaseModel):
    """A polygon defined by an ordered list of vertices."""

    vertices: list[Point]


class PolygonValidationResult(BaseModel):
    """Result of polygon self-intersection validation."""

    valid: bool
    reason: str | None = None


class ExtractRequest(BaseModel):
    """Request body for the AI extraction endpoint."""

    job_id: str
    page: int
    prompt: str = "Extract all rooms, dimensions, and labels from this floor plan."
    model: str = DEFAULT_MODEL


class ExtractResponse(BaseModel):
    """Response from the AI extraction endpoint."""

    success: bool
    data: dict[str, Any] | None = None
    error: str | None = None
    retries_used: int = 0


class UploadResponse(BaseModel):
    """Response from the upload endpoint."""

    job_id: str
    page_count: int
    dpi: int
    pages: list[dict[str, Any]]


class PageInfo(BaseModel):
    """Metadata about a single rasterised page."""

    page: int
    url: str
    width: int
    height: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ZOOM: float = DPI / 72  # 72 DPI is the PDF default user-space unit


def _convert_pdf(pdf_path: Path, out_dir: Path) -> list[PageInfo]:
    """Render every page of *pdf_path* to a PNG in *out_dir*.

    Returns a list of ``PageInfo`` objects with page dimensions.
    """
    doc = fitz.open(str(pdf_path))
    mat = fitz.Matrix(ZOOM, ZOOM)
    pages: list[PageInfo] = []
    job_id = out_dir.name

    for page_num in range(len(doc)):
        page = doc[page_num]
        pix = page.get_pixmap(matrix=mat, alpha=False)
        png_path = out_dir / f"page_{page_num}.png"
        pix.save(str(png_path))
        pages.append(
            PageInfo(
                page=page_num,
                url=f"/api/images/{job_id}/{page_num}",
                width=pix.width,
                height=pix.height,
            )
        )

    doc.close()
    return pages


def validate_polygon(vertices: list[Point]) -> PolygonValidationResult:
    """Check whether a polygon has self-intersecting edges.

    Uses the Shapely library to determine geometric validity.

    Args:
        vertices: Ordered list of polygon vertices.

    Returns:
        A ``PolygonValidationResult`` indicating whether the polygon is valid.
    """
    if len(vertices) < 3:
        return PolygonValidationResult(
            valid=False, reason="A polygon requires at least 3 vertices."
        )

    coords = [(v.x, v.y) for v in vertices]
    poly = ShapelyPolygon(coords)

    if poly.is_valid:
        return PolygonValidationResult(valid=True)

    reason = explain_validity(poly)
    return PolygonValidationResult(valid=False, reason=reason)


def _call_claude_api(
    image_path: Path,
    prompt: str,
    model: str = DEFAULT_MODEL,
) -> dict[str, Any]:
    """Call the Claude API with an image and prompt.

    Implements automatic retries (up to ``MAX_RETRIES``) on transient failures.

    Args:
        image_path: Path to the PNG image to send.
        prompt: The extraction prompt.
        model: The Claude model ID to use.

    Returns:
        Parsed JSON response from Claude.

    Raises:
        RuntimeError: If all retries are exhausted or the response is malformed.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY environment variable is not set. "
            "Please configure it in the settings or environment."
        )

    client = Anthropic(api_key=api_key)

    image_data = base64.standard_b64encode(image_path.read_bytes()).decode("utf-8")

    last_error: Exception | None = None
    for attempt in range(1 + MAX_RETRIES):
        try:
            logger.info("Claude API call attempt %d/%d", attempt + 1, 1 + MAX_RETRIES)
            message = client.messages.create(
                model=model,
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
                                    "data": image_data,
                                },
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
            )

            raw_text = message.content[0].text  # type: ignore[union-attr]

            # Try to extract JSON from the response
            try:
                # Handle markdown-wrapped JSON
                text = raw_text.strip()
                if text.startswith("```"):
                    # Remove ```json ... ``` wrapping
                    lines = text.split("\n")
                    text = "\n".join(lines[1:-1]) if len(lines) > 2 else text
                result: dict[str, Any] = json.loads(text)
                return result
            except (json.JSONDecodeError, TypeError) as parse_err:
                if attempt < MAX_RETRIES:
                    logger.warning(
                        "Malformed JSON on attempt %d: %s", attempt + 1, parse_err
                    )
                    last_error = parse_err
                    continue
                raise RuntimeError(
                    f"Claude returned malformed JSON after {1 + MAX_RETRIES} attempts. "
                    f"Raw response: {raw_text[:500]}"
                ) from parse_err

        except APIError as api_err:
            logger.warning("Claude API error on attempt %d: %s", attempt + 1, api_err)
            last_error = api_err
            if attempt >= MAX_RETRIES:
                raise RuntimeError(
                    f"Claude API call failed after {1 + MAX_RETRIES} attempts: {api_err}"
                ) from api_err

    raise RuntimeError(f"Unexpected retry exhaustion: {last_error}")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.post("/api/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile) -> UploadResponse:
    """Accept a PDF upload, rasterise pages at 300 DPI, return job metadata.

    Supports plans at various scales and paper sizes (A0 through A4).
    The rasterisation resolution (300 DPI) preserves detail even for A0 plans.

    Args:
        file: The uploaded PDF file.

    Returns:
        An ``UploadResponse`` containing job ID, page count, DPI, and page URLs.

    Raises:
        HTTPException: If the file is not a PDF.
    """
    if file.content_type not in ("application/pdf",):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    job_id: str = uuid.uuid4().hex
    job_dir: Path = UPLOAD_DIR / job_id
    job_dir.mkdir(parents=True)

    pdf_path: Path = job_dir / "original.pdf"
    contents: bytes = await file.read()
    pdf_path.write_bytes(contents)

    pages: list[PageInfo] = _convert_pdf(pdf_path, job_dir)

    return UploadResponse(
        job_id=job_id,
        page_count=len(pages),
        dpi=DPI,
        pages=[p.model_dump() for p in pages],
    )


@app.get("/api/images/{job_id}/{page}")
async def get_page_image(job_id: str, page: int) -> FileResponse:
    """Serve a rasterised page PNG.

    Args:
        job_id: The UUID hex identifying the upload job.
        page: Zero-based page index.

    Returns:
        The PNG image as a ``FileResponse``.

    Raises:
        HTTPException: If the image file is not found.
    """
    img_path: Path = UPLOAD_DIR / job_id / f"page_{page}.png"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Image not found.")
    return FileResponse(img_path, media_type="image/png")


@app.get("/api/pdf/{job_id}")
async def get_pdf(job_id: str) -> FileResponse:
    """Serve the original uploaded PDF.

    Args:
        job_id: The UUID hex identifying the upload job.

    Returns:
        The PDF file as a ``FileResponse``.

    Raises:
        HTTPException: If the PDF file is not found.
    """
    pdf_path: Path = UPLOAD_DIR / job_id / "original.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found.")
    return FileResponse(pdf_path, media_type="application/pdf")


@app.post("/api/extract", response_model=ExtractResponse)
async def extract_from_plan(req: ExtractRequest) -> ExtractResponse:
    """Use Claude AI to extract information from a plan page.

    Sends the rasterised page image to the Claude API along with the extraction
    prompt. Automatically retries up to ``MAX_RETRIES`` times on failure.

    Args:
        req: The extraction request containing job ID, page, prompt, and model.

    Returns:
        An ``ExtractResponse`` with the extracted data or error details.
    """
    img_path: Path = UPLOAD_DIR / req.job_id / f"page_{req.page}.png"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Page image not found.")

    try:
        data = _call_claude_api(img_path, req.prompt, req.model)
        return ExtractResponse(success=True, data=data, retries_used=0)
    except RuntimeError as err:
        logger.error("Extraction failed: %s", err)
        return ExtractResponse(success=False, error=str(err))


@app.post("/api/validate-polygon", response_model=PolygonValidationResult)
async def validate_polygon_endpoint(polygon: PolygonInput) -> PolygonValidationResult:
    """Validate that a polygon does not have self-intersecting edges.

    Uses the Shapely library to check geometric validity.

    Args:
        polygon: The polygon to validate.

    Returns:
        A ``PolygonValidationResult`` indicating validity.
    """
    return validate_polygon(polygon.vertices)
