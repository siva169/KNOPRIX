# Upload Support Matrix

Uploads are private originals. The API ignores the browser-supplied MIME type,
validates the file contents before parsing, and uses a random storage key
separate from the display filename. The configured `MAX_UPLOAD_MB` limit is
enforced while streaming the request to disk.

| Format | Content validation | Processing | Full-document provider transfer |
|---|---|---|---|
| PDF | `%PDF-` signature, then parser errors are rejected | Text extraction with `pypdf` | Original pages uploaded in ordered 20-page PDF parts (each <=50 MB) |
| PPTX | ZIP integrity, required package members, safe member paths | Slide/text extraction with `python-pptx` | Converted to PDF, then split into 20-page parts (each <=50 MB) |
| DOCX | ZIP integrity, required package members, safe member paths | Paragraph/table text extraction with `python-docx` | Converted to PDF, then split into 20-page parts (each <=50 MB) |
| TXT | Strict UTF-8; binary NUL bytes rejected | Plain-text extraction | Converted to PDF, then split into 20-page parts (each <=50 MB) |
| MD | Strict UTF-8; binary NUL bytes rejected | Plain-text extraction | Converted to PDF, then split into 20-page parts (each <=50 MB) |
| PNG | Pillow format verification and full image integrity check | Original retained; no OCR | Converted to PDF, then split into 20-page parts (each <=50 MB) |
| JPG/JPEG | Pillow JPEG verification and full image integrity check | Original retained; no OCR | Converted to PDF, then split into 20-page parts (each <=50 MB) |
| SVG | UTF-8 XML with an SVG root; active scripts, event handlers, external references, DTDs, and entities rejected | Original retained; no OCR | Converted to PDF, then split into 20-page parts (each <=50 MB) |

Empty, malformed, oversized, unsupported, or extension-mismatched files are
rejected before indexing. Legacy `.ppt` is unsupported. All downloads go
through the authenticated, owner-scoped document stream route; browser MIME
claims and display filenames are not used as storage keys.

Full-document transfer is a separate, explicit provider/model authorization;
ordinary upload, extraction, indexing, and retrieval do not upload files to an
AI provider. Provider conversion preserves rendered visual content where
possible but cannot guarantee perfect fidelity for every source. The backend
container installs LibreOffice and Poppler for conversion and page rendering.
NVIDIA processes all rendered pages in four-page image batches per question;
other supported providers reuse uploaded files where available. Provider
limits, retention, and terms still apply.
