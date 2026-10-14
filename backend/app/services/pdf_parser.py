"""Document text extraction — PDF (pypdf), PPTX (python-pptx), DOCX (python-docx)
and plain text (TXT / MD)."""
from __future__ import annotations

from pathlib import Path


import re
import shutil
import subprocess

def _detect_text_tables(text: str, page_number: int = 1) -> list[dict]:
    """Detect simple markdown or pipe/tab delimited tables in extracted plain text."""
    tables = []
    lines = (text or "").splitlines()
    current_table: list[list[str]] = []
    for line in lines:
        stripped = line.strip()
        if "|" in stripped:
            cells = [c.strip() for c in stripped.strip("|").split("|")]
            if len(cells) >= 2 and any(cells):
                # Skip markdown separator rows like |---|---|
                if all(re.match(r"^:?-+:?$", c) for c in cells if c):
                    continue
                current_table.append(cells)
                continue
        elif "\t" in stripped:
            cells = [c.strip() for c in stripped.split("\t") if c.strip()]
            if len(cells) >= 2:
                current_table.append(cells)
                continue
        if current_table:
            if len(current_table) >= 2:
                tables.append({"page": page_number, "rows": current_table})
            current_table = []
    if len(current_table) >= 2:
        tables.append({"page": page_number, "rows": current_table})
    return tables


def _extract_reading_order(pages: list[str]) -> list[dict]:
    """Break pages into structured reading blocks: headings, paragraphs, and lists."""
    blocks: list[dict] = []
    block_idx = 0
    for page_num, page_text in enumerate(pages, start=1):
        raw_paras = [p.strip() for p in (page_text or "").split("\n\n") if p.strip()]
        for para in raw_paras:
            lines = [l.strip() for l in para.splitlines() if l.strip()]
            if not lines:
                continue
            first_line = lines[0]
            # Classify block type
            if first_line.startswith("#") or (len(first_line) < 65 and not first_line.endswith(".") and len(lines) == 1):
                block_type = "heading"
            elif first_line.startswith(("-", "*", "•")) or re.match(r"^\d+[\.\)]", first_line):
                block_type = "list_item"
            elif "|" in first_line:
                block_type = "table_row"
            else:
                block_type = "paragraph"

            blocks.append({
                "index": block_idx,
                "page": page_num,
                "type": block_type,
                "text": para,
            })
            block_idx += 1
    return blocks


def _check_ocr_status(is_scanned: bool) -> tuple[str, str]:
    """Truth-first OCR detection: check if OCR engine is genuinely available."""
    if not is_scanned:
        return "none", ""
    tesseract_bin = shutil.which("tesseract")
    if not tesseract_bin:
        return "unavailable", ""
    return "scanned_ocr_required", ""


def extract_pdf(path: str | Path) -> dict:
    """Return {text, pages: [str], method, is_scanned, tables, reading_order, ocr_status, ocr_text}."""
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    pages: list[str] = []
    tables: list[dict] = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            page_text = (page.extract_text() or "").strip()
            pages.append(page_text)
            page_tables = _detect_text_tables(page_text, page_number=i)
            tables.extend(page_tables)
        except Exception:
            pages.append("")
    full = "\n\n".join(p for p in pages if p).strip()
    is_scanned = len(full) < 50  # image-only PDFs yield no text layer
    ocr_status, ocr_text = _check_ocr_status(is_scanned)
    reading_order = _extract_reading_order(pages)

    return {
        "text": full,
        "pages": pages,
        "method": "pypdf",
        "is_scanned": is_scanned,
        "page_count": max(len(pages), 1),
        "tables": tables,
        "reading_order": reading_order,
        "ocr_status": ocr_status,
        "ocr_text": ocr_text,
    }


def extract_pptx(path: str | Path) -> dict:
    from pptx import Presentation

    prs = Presentation(str(path))
    pages: list[str] = []
    tables: list[dict] = []
    for i, slide in enumerate(prs.slides, start=1):
        lines: list[str] = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    text = "".join(run.text for run in para.runs).strip()
                    if text:
                        lines.append(text)
            if getattr(shape, "has_table", False) and shape.has_table:
                table_rows = []
                for row in shape.table.rows:
                    row_cells = [c.text.strip() for c in row.cells]
                    table_rows.append(row_cells)
                if table_rows:
                    tables.append({"page": i, "rows": table_rows})
        pages.append("\n".join(lines))
    full = "\n\n".join(p for p in pages if p).strip()
    is_scanned = len(full) < 20
    ocr_status, ocr_text = _check_ocr_status(is_scanned)
    reading_order = _extract_reading_order(pages)

    return {
        "text": full,
        "pages": pages,
        "method": "python-pptx",
        "is_scanned": is_scanned,
        "page_count": max(len(pages), 1),
        "tables": tables,
        "reading_order": reading_order,
        "ocr_status": ocr_status,
        "ocr_text": ocr_text,
    }


def extract_docx(path: str | Path) -> dict:
    """DOCX (modern Word) — paragraphs + tables. Legacy .doc is not supported."""
    from docx import Document

    doc = Document(str(path))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    tables: list[dict] = []
    table_lines: list[str] = []
    for table in doc.tables:
        rows_data = []
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                rows_data.append(cells)
                table_lines.append(" | ".join(cells))
        if rows_data:
            tables.append({"page": 1, "rows": rows_data})
    pages: list[str] = ["\n".join(paragraphs + table_lines)]
    full = "\n\n".join(p for p in pages if p).strip()
    is_scanned = len(full) < 20
    ocr_status, ocr_text = _check_ocr_status(is_scanned)
    reading_order = _extract_reading_order(pages)

    return {
        "text": full,
        "pages": pages,
        "method": "python-docx",
        "is_scanned": is_scanned,
        "page_count": max(len(pages), 1),
        "tables": tables,
        "reading_order": reading_order,
        "ocr_status": ocr_status,
        "ocr_text": ocr_text,
    }


def extract_pptx_slides(path: str | Path) -> dict:
    """Rebuild slides visually — every shape's position, text, fonts, colors,
    images and tables, so the frontend can render PPTX like PowerPoint.

    Returns {widthPt, heightPt, slides: [{bg, shapes: [...]}]} where shape
    positions are percentages of the slide and font sizes are in points
    (the frontend renders a design-layer where 1pt = 1px).
    """
    import base64

    from pptx import Presentation
    from pptx.enum.dml import MSO_FILL
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    prs = Presentation(str(path))
    slide_w, slide_h = prs.slide_width, prs.slide_height
    sw_pt = round(slide_w / 12700, 2)
    sh_pt = round(slide_h / 12700, 2)

    ALIGN = {1: "left", 2: "center", 3: "right", 4: "justify"}
    ANCHOR = {1: "top", 2: "middle", 3: "bottom"}

    def _solid_bg(fill) -> str | None:
        try:
            if fill.type == MSO_FILL.SOLID:
                rgb = fill.fore_color.rgb
                if rgb is not None:
                    return str(rgb)
        except Exception:
            pass
        return None

    def _para_data(p) -> dict:
        runs = []
        for r in p.runs:
            f = r.font
            color = None
            try:
                if f.color is not None and f.color.type is not None:
                    color = str(f.color.rgb)
            except Exception:
                color = None
            size = None
            try:
                if f.size is not None:
                    size = round(f.size.pt, 1)
            except Exception:
                size = None
            runs.append({
                "t": r.text,
                "bold": bool(f.bold),
                "italic": bool(f.italic),
                "size": size,
                "color": color,
                "font": f.name,
            })
        if not runs and p.text:
            runs = [{"t": p.text, "bold": False, "italic": False,
                    "size": None, "color": None, "font": None}]
        align = None
        try:
            if p.alignment is not None:
                align = ALIGN.get(int(p.alignment))
        except Exception:
            align = None
        return {"level": p.level or 0, "align": align, "runs": runs}

    def _frame_data(tf) -> list[dict]:
        anchor = None
        try:
            if tf.vertical_anchor is not None:
                anchor = ANCHOR.get(int(tf.vertical_anchor))
        except Exception:
            anchor = None
        paras = [_para_data(p) for p in tf.paragraphs]
        return {"anchor": anchor, "paras": paras}

    def walk(shapes, acc):
        for shape in shapes:
            if shape.left is None or shape.top is None or shape.width is None or shape.height is None:
                continue
            item = {
                "x": round(shape.left / slide_w * 100, 3),
                "y": round(shape.top / slide_h * 100, 3),
                "w": round(shape.width / slide_w * 100, 3),
                "h": round(shape.height / slide_h * 100, 3),
            }
            try:
                if shape.rotation:
                    item["rot"] = round(shape.rotation, 1)
            except Exception:
                pass

            try:
                t = shape.shape_type
            except Exception:
                t = None

            if t == MSO_SHAPE_TYPE.GROUP:
                walk(shape.shapes, acc)
                continue
            if t == MSO_SHAPE_TYPE.PICTURE:
                try:
                    blob = shape.image.blob
                    if blob and len(blob) < 3 * 1024 * 1024:
                        item.update({
                            "type": "image",
                            "src": "data:" + shape.image.content_type + ";base64," + base64.b64encode(blob).decode("ascii"),
                        })
                        acc.append(item)
                except Exception:
                    pass
                continue
            if getattr(shape, "has_table", False) and shape.has_table:
                tbl = shape.table
                total = sum(c.width for c in tbl.columns) or 1
                cols = [round(c.width / total * 100, 2) for c in tbl.columns]
                rows = [[_frame_data(c.text_frame) for c in row.cells] for row in tbl.rows]
                item.update({"type": "table", "cols": cols, "rows": rows})
                acc.append(item)
                continue
            if getattr(shape, "has_text_frame", False) and shape.text_frame is not None:
                text = shape.text_frame.text.strip()
                bg = _solid_bg(shape.fill)
                if text:
                    frame = _frame_data(shape.text_frame)
                    item.update({"type": "text", "anchor": frame["anchor"], "paras": frame["paras"]})
                    if bg:
                        item["bg"] = bg
                    acc.append(item)
                elif bg:
                    # colored shape with no text (banner / divider)
                    item.update({"type": "box", "bg": bg})
                    acc.append(item)

    slides_out = []
    for slide in prs.slides:
        bg = None
        try:
            bg = _solid_bg(slide.background.fill)
        except Exception:
            bg = None
        shapes = []
        walk(slide.shapes, shapes)
        slides_out.append({"bg": bg, "shapes": shapes})

    return {"widthPt": sw_pt, "heightPt": sh_pt, "slides": slides_out}


def extract_document(path: str | Path, file_type: str) -> dict:
    file_type = (file_type or "").lower()
    if file_type in {"png", "jpg", "jpeg", "svg"}:
        ocr_status, ocr_text = _check_ocr_status(is_scanned=True)
        return {
            "text": "",
            "pages": [""],
            "method": "none",
            "is_scanned": True,
            "page_count": 1,
            "tables": [],
            "reading_order": [],
            "ocr_status": ocr_status,
            "ocr_text": ocr_text,
        }
    if file_type == "pdf":
        return extract_pdf(path)
    if file_type in ("pptx", "ppt"):
        return extract_pptx(path)
    if file_type == "docx":
        return extract_docx(path)
    # txt / md / other plain text
    try:
        text = Path(path).read_text(encoding="utf-8", errors="ignore")
        pages = [text.strip()]
        return {
            "text": text.strip(),
            "pages": pages,
            "method": "plaintext",
            "is_scanned": False,
            "page_count": 1,
            "tables": _detect_text_tables(text, page_number=1),
            "reading_order": _extract_reading_order(pages),
            "ocr_status": "none",
            "ocr_text": "",
        }
    except Exception:
        return {
            "text": "",
            "pages": [],
            "method": "none",
            "is_scanned": True,
            "page_count": 1,
            "tables": [],
            "reading_order": [],
            "ocr_status": "unavailable",
            "ocr_text": "",
        }
