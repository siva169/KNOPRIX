# Upload Support Matrix

Uploads are private originals. The API ignores the browser-supplied MIME type,
validates the file contents before parsing, and uses a random storage key
separate from the display filename. The configured `MAX_UPLOAD_MB` limit is
enforced while streaming the request to disk.

| Format | Content validation | Processing | Limits and delivery |
|---|---|---|---|
| PDF | `%PDF-` signature, then parser errors are rejected | Text extraction with `pypdf` | Configured upload-size limit; owner-authorized stream |
| PPTX | ZIP integrity, required package members, safe member paths | Slide/text extraction with `python-pptx` | At most 10,000 entries and 256 MiB uncompressed |
| DOCX | ZIP integrity, required package members, safe member paths | Paragraph/table text extraction with `python-docx` | At most 10,000 entries and 256 MiB uncompressed |
| TXT | Strict UTF-8; binary NUL bytes rejected | Plain-text extraction | Configured upload-size limit |
| MD | Strict UTF-8; binary NUL bytes rejected | Plain-text extraction | Configured upload-size limit |
| PNG | Pillow format verification and full image integrity check | Original retained; no OCR | At most 40 million pixels |
| JPG/JPEG | Pillow JPEG verification and full image integrity check | Original retained; no OCR | At most 40 million pixels |
| SVG | UTF-8 XML with an SVG root; active scripts, event handlers, external references, DTDs, and entities rejected | Original retained; no OCR | At most 10 MiB, 100,000 elements, and 64 levels; served as an attachment |

Empty, malformed, oversized, unsupported, or extension-mismatched files are
rejected before indexing. Legacy `.ppt` is unsupported. All downloads go
through the authenticated, owner-scoped document stream route; browser MIME
claims and display filenames are not used as storage keys.
