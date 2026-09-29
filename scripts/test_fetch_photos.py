"""Small image fixtures for the photo thumbnail pipeline."""

import io
import unittest

from PIL import Image, UnidentifiedImageError

from fetch_photos import THUMB_MAX_SIDE, make_thumbnail


class ThumbnailTests(unittest.TestCase):
    def test_large_photo_becomes_small_jpeg(self):
        source = Image.new("RGB", (1500, 1125), "steelblue")
        content = io.BytesIO()
        source.save(content, "JPEG")

        thumbnail = make_thumbnail(content.getvalue())

        with Image.open(io.BytesIO(thumbnail)) as image:
            self.assertEqual(image.format, "JPEG")
            self.assertEqual(image.size, (THUMB_MAX_SIDE, 480))
        self.assertLess(len(thumbnail), len(content.getvalue()))

    def test_exif_orientation_is_applied(self):
        source = Image.new("RGB", (800, 400), "steelblue")
        exif = source.getexif()
        exif[274] = 6  # rotate 90 degrees clockwise
        content = io.BytesIO()
        source.save(content, "JPEG", exif=exif)

        with Image.open(io.BytesIO(make_thumbnail(content.getvalue()))) as image:
            self.assertEqual(image.size, (320, THUMB_MAX_SIDE))
            self.assertIsNone(image.getexif().get(274))

    def test_unreadable_photo_is_rejected(self):
        with self.assertRaises(UnidentifiedImageError):
            make_thumbnail(b"not an image")


if __name__ == "__main__":
    unittest.main()
