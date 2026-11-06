# Unpublished

Nothing in this folder is built or served. The owner's call on 2026-11-05: publish chapter 1 only,
as the picture book and the 3-D book.

- `chapter-1.md` and `chapter-5.md` are the older prose chapters, with chapter 1 superseded by
  `../picture-1.json`.
- `chapters.json` holds their old `book.json` entries, with picture slots and alt text.
- `art/` holds their pictures, which sat under `public/stories/the-duck-who-stayed/art/`.

To publish any of this, change `PUBLISHED` in `scripts/check_story.py` on purpose, along with the
sitemap and `public/_headers`. Until then `scripts/check_story.py` fails if a page or a picture
from here comes back to `public/`.
