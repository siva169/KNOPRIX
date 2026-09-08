"""Document text extraction — PDF (pypdf), PPTX (python-pptx), DOCX (python-docx)
and plain text (TXT / MD)."""
from __future__ import annotations

from pathlib import Path


def extract_pdf(path: str | Path) -> dict:
    """Return {text, pages: [str], method, is_scanned}."""
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    pages: list[str] = []
    for page in reader.pages:
        try:
            pages.append((page.extract_text() or "").strip())
        except Exception:
            pages.append("")
    full = "\n\n".join(p for p in pages if p).strip()
    is_scanned = len(full) < 50  # image-only PDFs yield no text layer
    return {
        "text": full,
        "pages": pages,
        "method": "pypdf",
        "is_scanned": is_scanned,
        "page_count": max(len(pages), 1),
    }


def extract_pptx(path: str | Path) -> dict:
    from pptx import Presentation

    prs = Presentation(str(path))
    pages: list[str] = []
    for slide in prs.slides:
        lines: list[str] = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    text = "".join(run.text for run in para.runs).strip()
                    if text:
                        lines.append(text)
        pages.append("\n".join(lines))
    full = "\n\n".join(p for p in pages if p).strip()
    return {
        "text": full,
        "pages": pages,
        "method": "python-pptx",
        "is_scanned": len(full) < 20,
        "page_count": max(len(pages), 1),
    }


def extract_docx(path: str | Path) -> dict:
    """DOCX (modern Word) — paragraphs + tables. Legacy .doc is not supported."""
    from docx import Document

    try:
        doc = Document(str(path))
    except Exception:
        return {"text": "", "pages": [], "method": "none",
                "is_scanned": True, "page_count": 1}
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    table_lines: list[str] = []
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                table_lines.append(" | ".join(cells))
    pages: list[str] = ["\n".join(paragraphs + table_lines)]
    full = "\n\n".join(p for p in pages if p).strip()
    return {
        "text": full,
        "pages": pages,
        "method": "python-docx",
        "is_scanned": len(full) < 20,
        "page_count": max(len(pages), 1),
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

    def walk(shapes, acc, depth=0):
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
                walk(shape.shapes, acc, depth + 1)
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
    if file_type == "pdf":
        return extract_pdf(path)
    if file_type in ("pptx", "ppt"):
        return extract_pptx(path)
    if file_type == "docx":
        return extract_docx(path)
    # txt / md / other plain text
    try:
        text = Path(path).read_text(encoding="utf-8", errors="ignore")
        return {
            "text": text.strip(),
            "pages": [text.strip()],
            "method": "plaintext",
            "is_scanned": False,
            "page_count": 1,
        }
    except Exception:
        return {"text": "", "pages": [], "method": "none",
                "is_scanned": True, "page_count": 1}
