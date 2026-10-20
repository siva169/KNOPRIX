# Upload Support Matrix

Uploads are private originals. The API ignores the browser-supplied MIME type,
validates the file contents before parsing, and uses a random storage key
separate from the display filename. The configured `MAX_UPLOAD_MB` limit is
enforced while streaming the request to disk.

| Format | Content validation | Processing |
|---|---|---|
| PDF | `%PDF-` signature, then parser errors are rejected | Text extraction with `pypdf` |
| PPTX | ZIP integrity, required package members, safe member paths | Slide/text extraction with `python-pptx` |
| DOCX | ZIP integrity, required package members, safe member paths | Paragraph/table text extraction with `python-docx` |
| TXT | Strict UTF-8; binary NUL bytes rejected | Plain-text extraction |
| MD | Strict UTF-8; binary NUL bytes rejected | Plain-text extraction |
| PNG | Pillow format verification and full image integrity check | Original retained; no OCR |
| JPG/JPEG | Pillow JPEG verification and full image integrity check | Original retained; no OCR |
| SVG | UTF-8 XML with an SVG root; active scripts, event handlers, external references, DTDs, and entities rejected | Original retained; no OCR |

Empty, malformed, oversized, unsupported, or extension-mismatched files are
rejected before indexing. Legacy `.ppt` is unsupported. All downloads go
through the authenticated, owner-scoped document stream route; browser MIME
claims and display filenames are not used as storage keys.

Ordinary upload, extraction, indexing, and retrieval do not upload files to an
AI provider. AI Wing's document-text mode sends only extracted text after
per-request provider/model confirmation; it does not send original files or
visual content. Existing remote provider copies from the retired feature can
still be revoked and deletion retried; see the BYOK security contract.
