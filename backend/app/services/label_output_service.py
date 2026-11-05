"""Label output names and the full-page Flipkart SKU sorting mode."""
from datetime import datetime, timedelta, timezone
import re


def label_output_filename(platform, order_count, today=None):
    today = today or datetime.now(timezone(timedelta(hours=5, minutes=30)))
    return f"{today:%d-%m} - {platform} - {order_count} orders.pdf"


def extract_flipkart_sku(page, page_number):
    lines = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = " ".join(span["text"] for span in line["spans"]).strip()
            lines.append((line["bbox"], text))
    headers = [item for item in lines if re.fullmatch(r"SKU\s+ID", item[1], re.I)]
    if not headers:
        raise ValueError(f"Flipkart page {page_number}: SKU ID heading not found. Turn off Sort by SKU for the original label format.")
    header = headers[0][0]
    rows = sorted(
        (item for item in lines if "|" in item[1] and 0 < item[0][1] - header[1] < 60),
        key=lambda item: (item[0][1], item[0][0]),
    )
    sku = re.sub(r"^\d+\s+", "", rows[0][1].split("|")[0]).strip() if rows else ""
    if not sku:
        raise ValueError(f"Flipkart page {page_number}: SKU could not be read. Use the original text PDF or turn off Sort by SKU.")
    return sku


def build_flipkart_sku_sorted_pdf(input_path, output_path):
    import pymupdf as fitz

    with fitz.open(input_path) as source:
        if not source.page_count:
            raise ValueError("Flipkart PDF does not contain any pages.")
        # Read every SKU before writing, so unreadable pages never disappear silently.
        labels = [
            (extract_flipkart_sku(page, index + 1), index, flipkart_ink_translation(page))
            for index, page in enumerate(source)
        ]
        labels.sort(key=lambda item: (item[0].upper(), item[1]))
        with fitz.open() as output:
            for _, index, (dx, dy) in labels:
                page = source[index]
                centered = output.new_page(width=page.rect.width, height=page.rect.height)
                centered.show_pdf_page(
                    page.rect + (dx, dy, dx, dy), source, index,
                    keep_proportion=False,
                )
            output.save(output_path)
        return len(labels)


def flipkart_ink_translation(page):
    """Match the reference app's printed-content bounds, then center on both axes."""
    import pymupdf as fitz
    from PIL import Image, ImageChops

    scale = min(2, 4096 / max(page.rect.width, page.rect.height))
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csRGB, alpha=False)
    with Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples) as image:
        red, green, blue = image.split()
        darkest = ImageChops.darker(ImageChops.darker(red, green), blue)
        bounds = darkest.point(lambda value: 255 if value < 245 else 0).getbbox()
    if bounds is None:
        raise ValueError("A blank Flipkart label page was found. No labels were saved.")
    left, top, right, bottom = bounds
    return (
        (pixmap.width - left - right) / (2 * scale),
        (pixmap.height - top - bottom) / (2 * scale),
    )
