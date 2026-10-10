"""Regression check: uploads match the formats supported by the parser."""
import unittest

from app.routers.documents import ALLOWED_TYPES


class UploadFormatTests(unittest.TestCase):
    def test_upload_allowlist_matches_supported_parser_formats(self):
        self.assertEqual(ALLOWED_TYPES, {".pdf", ".pptx", ".docx", ".txt", ".md"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
