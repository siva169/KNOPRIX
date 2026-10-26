"""LibreOffice-backed PDF previews for accurate PPTX reading."""
import hashlib
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from ..config import UPLOAD_DIR, cfg

CONVERSION_TIMEOUT_SECONDS = 90
PREVIEW_CACHE_DIR = UPLOAD_DIR / ".presentation-previews"


def preview_cache_path(document_id: str) -> Path:
    cache_key = hashlib.sha256(document_id.encode("utf-8")).hexdigest()
    return PREVIEW_CACHE_DIR / f"{cache_key}.pdf"


def remove_presentation_preview(document_id: str) -> None:
    preview_cache_path(document_id).unlink(missing_ok=True)


def render_presentation_preview(source: Path, document_id: str) -> Path:
    """Convert one presentation once and atomically cache its private PDF."""
    destination = preview_cache_path(document_id)
    if destination.is_file() and destination.stat().st_size:
        return destination

    binary = shutil.which("libreoffice") or shutil.which("soffice")
    if binary is None:
        raise FileNotFoundError("LibreOffice renderer is not installed")

    PREVIEW_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix=".presentation-render-", dir=PREVIEW_CACHE_DIR
    ) as temporary_directory:
        work_dir = Path(temporary_directory)
        output_dir = work_dir / "output"
        output_dir.mkdir()
        profile_dir = work_dir / "profile"
        command = [
            binary,
            "--headless",
            "--nologo",
            "--nodefault",
            "--nolockcheck",
            "--norestore",
            f"-env:UserInstallation={profile_dir.as_uri()}",
            "--convert-to",
            "pdf:impress_pdf_Export",
            "--outdir",
            str(output_dir),
            str(source),
        ]
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=CONVERSION_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            raise TimeoutError("Presentation rendering timed out") from error

        generated = output_dir / f"{source.stem}.pdf"
        if result.returncode != 0 or not generated.is_file():
            raise RuntimeError("LibreOffice could not render the presentation")
        size = generated.stat().st_size
        if size < 5 or size > cfg.MAX_UPLOAD_BYTES:
            raise ValueError("Rendered presentation exceeds the preview size limit")
        with generated.open("rb") as rendered:
            if rendered.read(5) != b"%PDF-":
                raise RuntimeError("LibreOffice returned an invalid PDF preview")

        temporary_pdf = work_dir / "cached-preview.pdf"
        shutil.copyfile(generated, temporary_pdf)
        os.replace(temporary_pdf, destination)

    return destination
