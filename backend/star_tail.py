def _build_flipkart_label_cropper_pdf(

    input_path: str,

    output_path: str,

    manual_zones=None,

):

    from pypdf import PdfReader, PdfWriter

    from pypdf.generic import RectangleObject



    reader = PdfReader(input_path)

    writer = PdfWriter()



    if len(reader.pages) == 0:

        raise HTTPException(

            status_code=400,

            detail="Flipkart PDF does not contain any pages.",

        )



    first_page = reader.pages[0]

    reusable_crop_box = _detect_flipkart_crop_box_fast(first_page)

    reusable_page_size = (

        round(float(first_page.mediabox.width), 2),

        round(float(first_page.mediabox.height), 2),

    )



    import fitz
    fitz_doc = fitz.open(input_path)
    for i, page in enumerate(reader.pages):
        page_size = (round(float(page.mediabox.width), 2), round(float(page.mediabox.height), 2))
        if page_size == reusable_page_size:
            crop_box = reusable_crop_box
        else:
            try:
                crop_box = _detect_flipkart_crop_box_fast(page)
            except HTTPException:
                separator_y = _detect_flipkart_separator_y(page)
                crop_box = _detect_flipkart_label_bounds(page, separator_y)
        cb = crop_box
        page_height = float(page.mediabox.height)
        fitz_page = fitz_doc[i]
        fitz_rect = fitz.Rect(cb[0], page_height - cb[3], cb[2], page_height - cb[1])
        fitz_page.set_cropbox(fitz_rect)
    fitz_doc.save(output_path)

    xml_path = _convert_pdf_to_xml(output_path)

    zone_result = _extract_zones_from_xml(

        xml_path,

        manual_zones=manual_zones,

    )



    if zone_result["label_count"] == 0:

        raise HTTPException(

            status_code=400,

            detail=(

                "Could not read Flipkart zones from this PDF. "

                "No 'Not for resale.' label markers were found."

            ),

        )



    if zone_result["missing_pages"]:

        return {

            "label_count": len(reader.pages),

            "cropped_pdf": output_path,

            "zone_counts": dict(zone_result["zone_counts"]),

            "missing_pages": zone_result["missing_pages"],

            "report_date": zone_result["report_date"],

        }

    import tempfile



    excel_path = os.path.join(

        tempfile.gettempdir(),

        f"zone_summary_{uuid.uuid4().hex}.xlsx"

    )



    _generate_zone_summary_excel(

        zone_result["zone_counts"],

        excel_path,

    )



    return {

        "label_count": len(reader.pages),

        "cropped_pdf": output_path,

        "zone_summary_excel": excel_path,

        "zone_counts": dict(zone_result["zone_counts"]),

        "missing_pages": zone_result["missing_pages"],

        "report_date": zone_result["report_date"],

    }



def _convert_pdf_to_xml(pdf_path: str) -> str:

    """

    Convert a PDF into XML using Poppler's pdftohtml.



    Returns:

        Path to the generated XML file.

    """



    temp_dir = tempfile.mkdtemp()



    output_base = os.path.join(

        temp_dir,

        "flipkart_labels"

    )

    hardcoded_poppler = r"F:\Inventory-Management\poppler-26.02.0\Library\bin\pdftohtml.exe"
    if os.path.exists(hardcoded_poppler):
        POPPLER_EXE = hardcoded_poppler
    else:
        import shutil
        if shutil.which("pdftohtml"):
            POPPLER_EXE = "pdftohtml"
        else:
            POPPLER_EXE = "pdftohtml" # Will fallback to FileNotFoundError

    try:

        subprocess.run(

            [

                POPPLER_EXE,

                "-xml",

                "-nodrm",

                "-hidden",

                "-enc",

                "UTF-8",

                pdf_path,

                output_base,

            ],

            check=True,

            stdout=subprocess.DEVNULL,

            stderr=subprocess.DEVNULL,

        )



    except FileNotFoundError:

        raise HTTPException(

            status_code=500,

            detail=(

                "Poppler (pdftohtml) is not installed "

                "or is not available in PATH."

            ),

        )



    except subprocess.CalledProcessError:

        raise HTTPException(

            status_code=500,

            detail="Failed to convert PDF to XML.",

        )



    xml_path = output_base + ".xml"



    if not os.path.exists(xml_path):

        raise HTTPException(

            status_code=500,

            detail="XML file was not generated.",

        )



    return xml_path



INVALID_FLIPKART_ZONE_TOKENS = {
    "ORDER",
    "OD",
    "ITEM",
    "SKU",
    "QTY",
    "PRICE",
    "ZONE",
    "AT",
    "AWB",
    "COD",
    "CPD",
    "CUSTOMER",
    "DATE",
    "DESCRIPTION",
    "GST",
    "GSTIN",
    "HBD",
    "HRS",
    "IGST",
    "INVOICE",
    "NAME",
    "ORDERED",
    "PACKAGING",
    "PREPAID",
    "PRINTED",
    "QTY",
    "SHIPPING",
    "SKU",
    "SOLD",
    "STD",
    "TAX",
    "TRANSPARENT",
    "USE",
    "ZONE",
}





def _normalize_flipkart_zone(value: str):
    value = re.sub(r"\s+", " ", str(value or "").strip().upper())
    match = re.match(r"^([A-Z0-9]{1,10})\b", value)

    if not match:
        return ""

    zone = match.group(1)

    if zone.isdigit():
        return ""

    if len(zone) == 1 and not zone.isalpha():
        return ""

    if zone in INVALID_FLIPKART_ZONE_TOKENS:
        return ""

    return zone





def _parse_flipkart_hbd_date(value: str):

    match = re.search(

        r"\bHBD\s*:\s*(\d{1,2})\s*[-/]\s*(\d{1,2})\b",

        value or "",

        flags=re.IGNORECASE,

    )



    if not match:

        return None



    day, month = match.groups()



    try:

        return date(

            datetime.now().year,

            int(month),

            int(day),

        )

    except ValueError:

        return None





def _extract_flipkart_zone_after_marker(lines, marker_index: int):
    search_range = 10
    
    # 1. Look for explicit packaging prefix anywhere near the marker
    for i in range(max(0, marker_index - search_range), min(len(lines), marker_index + search_range)):
        line = lines[i].strip()
        packaging_prefix = "use transparent packaging"
        if line.lower().startswith(packaging_prefix):
            zone_text = line[len("Use Transparent Packaging"):].strip()
            zone = _normalize_flipkart_zone(zone_text)
            if zone: return zone

    # 2. Look BACKWARDS for any valid zone (catches B6, ZON, etc.)
    for i in range(marker_index - 1, max(-1, marker_index - search_range), -1):
        line = lines[i].strip()
        zone = _normalize_flipkart_zone(line)
        if zone: return zone
        
    # 3. Look FORWARDS for any valid zone
    for i in range(marker_index + 1, min(len(lines), marker_index + search_range)):
        line = lines[i].strip()
        zone = _normalize_flipkart_zone(line)
        if zone: return zone

    return ""





def _flipkart_xml_page_values(page):

    line_nodes = page.findall("line")



    if line_nodes:

        return [

            (line.text or "").strip()

            for line in line_nodes

        ]



    text_items = []



    for node in page.findall("text"):

        text = "".join(node.itertext()).strip()



        if not text:

            continue



        try:

            top = float(node.attrib.get("top", 0))

            left = float(node.attrib.get("left", 0))

        except ValueError:

            top = 0

            left = 0



        text_items.append((top, left, text))



    return [

        text

        for _, _, text in sorted(text_items)

    ]





def _extract_flipkart_first_label_hbd_date(root):

    for page in root.findall("page"):

        lines = _flipkart_xml_page_values(page)



        for text in lines:

            if text.strip().lower() == "not for resale.":

                return None



            hbd_date = _parse_flipkart_hbd_date(text)

            if hbd_date:

                return hbd_date



    return None





def _extract_flipkart_zone_from_text_segment(segment):

    packaging_index = None



    for index, text in enumerate(segment):

        if text.strip().lower().startswith("use transparent packaging"):

            packaging_index = index

            same_item_zone = _normalize_flipkart_zone(

                text[len("Use Transparent Packaging"):]

            )



            if same_item_zone:

                return same_item_zone



            break



    if packaging_index is not None:
        for text in segment[packaging_index + 1:]:
            zone = _normalize_flipkart_zone(text)
            if zone:
                return zone
        
        for text in reversed(segment[:packaging_index]):
            zone = _normalize_flipkart_zone(text)
            if zone:
                return zone



    marker_index = next(

        (

            index

            for index, text in enumerate(segment)

            if "not for resale." in text.strip().lower()

        ),

        None,

    )



    if marker_index is None:

        return ""



    for text in reversed(segment[:marker_index]):

        zone = _normalize_flipkart_zone(text)

        if zone:

            return zone



    for text in segment[marker_index + 1:]:

        zone = _normalize_flipkart_zone(text)

        if zone:

            return zone



    return ""





def _extract_zones_from_xml(xml_path: str, manual_zones=None):

    """

    Reads the XML generated from the cropped PDF and extracts zones.



    Returns:

        {

            "zone_counts": Counter,

            "missing_pages": [

                {"page": 3},

                {"page": 17},

                ...

            ]

        }

    """



    manual_zones = manual_zones or {}

    tree = ET.parse(xml_path)

    root = tree.getroot()



    zone_counts = Counter()

    missing_pages = []

    label_number = 0

    report_date = _extract_flipkart_first_label_hbd_date(root)



    for page in root.findall("page"):



        page_no = int(page.attrib.get("number", 0))

        line_nodes = page.findall("line")



        lines = _flipkart_xml_page_values(page)



        if not line_nodes:

            marker_indices = [

                index

                for index, text in enumerate(lines)

                if "not for resale." in text.strip().lower()

            ]



            for marker_position, marker_index in enumerate(marker_indices):

                label_number += 1

                segment_start = (

                    marker_indices[marker_position - 1] + 1

                    if marker_position > 0

                    else 0

                )

                segment_end = (

                    marker_indices[marker_position + 1]

                    if marker_position + 1 < len(marker_indices)

                    else len(lines)

                )

                zone = _extract_flipkart_zone_from_text_segment(

                    lines[segment_start:segment_end]

                )

                manual_zone = _normalize_flipkart_zone(

                    manual_zones.get(str(label_number), "")

                )



                if manual_zone:

                    zone = manual_zone



                if not zone:

                    missing_pages.append({

                        "page": page_no,

                        "label_number": label_number,

                    })

                    continue



                zone_counts[zone] += 1



            continue



        for i, text in enumerate(lines):

            if "not for resale." not in text.strip().lower():

                continue



            label_number += 1

            zone = _extract_flipkart_zone_after_marker(lines, i)

            manual_zone = _normalize_flipkart_zone(

                manual_zones.get(str(label_number), "")

            )



            if manual_zone:

                zone = manual_zone



            if not zone:

                missing_pages.append({

                    "page": page_no,

                    "label_number": label_number,

                })

                continue



            zone_counts[zone] += 1



    return {

        "zone_counts": zone_counts,

        "missing_pages": missing_pages,

        "report_date": report_date or datetime.now().date(),

        "label_count": label_number,

    }



from openpyxl import Workbook

from openpyxl.styles import Font





def _generate_zone_summary_excel(zone_counts, output_path):

    """

    Generate Zone Summary.xlsx

    """



    wb = Workbook()

    ws = wb.active

    ws.title = "Zone Summary"



    ws.append(["Zone", "Count"])



    for cell in ws[1]:

        cell.font = Font(bold=True)



    total = 0



    for zone in sorted(zone_counts.keys()):

        count = int(zone_counts[zone])

        ws.append([zone, count])

        total += count



    ws.append([])

    ws.append(["Total Labels Processed", total])



    wb.save(output_path)



    return output_path





def _save_zone_summary_report(
    report_date,
    zone_counts,
    label_count=None,
    source_filename=None,
    platform="Flipkart",
):
    db = SessionLocal()
    try:
        total_labels = sum(int(val or 0) for val in zone_counts.values())
        if total_labels == 0 and label_count is not None:
            # If we don't have zone breakdown, put everything under 'UNKNOWN'
            zone_counts = {'UNKNOWN': int(label_count)}
            
        for zone, count in zone_counts.items():
            count = int(count or 0)
            if count == 0: continue
            
            existing = db.query(ZoneSummaryReport).filter(
                ZoneSummaryReport.report_date == report_date,
                ZoneSummaryReport.platform == platform,
                ZoneSummaryReport.zone == zone
            ).first()
            
            if existing:
                existing.label_count += count
            else:
                db.add(ZoneSummaryReport(
                    report_date=report_date,
                    platform=platform,
                    zone=zone,
                    label_count=count
                ))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error saving zone summary report: {e}")
    finally:
        db.close()

def _save_zone_summary_report(
    report_date,
    zone_counts,
    label_count=None,
    source_filename=None,
    platform="Flipkart",
):
    db: Session = SessionLocal()
    sf = source_filename or ""

    try:
        # If same file is re-uploaded for same platform+date, delete existing rows for it
        if sf:
            db.query(ZoneSummaryReport).filter(
                ZoneSummaryReport.report_date == report_date,
                ZoneSummaryReport.platform == platform,
                ZoneSummaryReport.source_filename == sf,
            ).delete()

        for zone, count in sorted(zone_counts.items()):
            db.add(ZoneSummaryReport(
                report_date=report_date,
                platform=platform,
                zone=zone,
                label_count=int(count or 0),
                source_filename=sf,
            ))

        db.commit()

    except Exception as e:
        db.rollback()
        print(f"Error saving zone summary report: {e}")
    finally:
        db.close()


def _flipkart_zone_summary_rows(db: Session, report_date):
    rows = (
        db.query(ZoneSummaryReport)
        .filter(ZoneSummaryReport.report_date == report_date)
        .order_by(ZoneSummaryReport.platform, ZoneSummaryReport.zone, ZoneSummaryReport.source_filename)
        .all()
    )

    # Aggregate zone totals across all uploaded files per platform
    totals = {}
    for r in rows:
        key = (r.platform or "Flipkart", r.zone)
        totals[key] = totals.get(key, 0) + int(r.label_count or 0)

    items = [
        {"platform": p, "zone": z, "label_count": c}
        for (p, z), c in sorted(totals.items())
    ]

    # Build batches list: one entry per (platform, source_filename) combination
    batch_map = {}
    for r in rows:
        plat = r.platform or "Flipkart"
        sf = r.source_filename or ""
        key = (plat, sf)
        if key not in batch_map:
            batch_map[key] = {
                "platform": plat,
                "source_filename": sf,
                "label_count": 0,
                "created_at": r.created_at.isoformat() if r.created_at else "",
            }
        batch_map[key]["label_count"] += int(r.label_count or 0)

    batches = list(batch_map.values())

    return {
        "date": str(report_date),
        "items": items,
        "total": sum(item["label_count"] for item in items),
        "batches": batches,
    }





MEESHO_LABEL_SIZE_TOKENS = {

    "XS",

    "S",

    "M",

    "L",

    "XL",

    "XXL",

    "2XL",

    "3XL",

    "4XL",

    "5XL",

    "6XL",

    "FREE",

    "FREESIZE",

    "FREE SIZE",

}



MEESHO_LABEL_SIZE_ORDER = [

    "XS",

    "S",

    "M",

    "L",

    "XL",

    "XXL",

    "3XL",

    "4XL",

]





def _natural_sort_key(value: str):

    return [

        int(part) if part.isdigit() else part.lower()

        for part in re.split(r"(\d+)", str(value or ""))

    ]





def _normalize_meesho_size(value: str):

    size = re.sub(r"\s+", " ", str(value or "").strip().upper())



    if size == "FREE SIZE":

        return size



    return size.replace(" ", "")





def _meesho_size_sort_key(value: str):

    size = _normalize_meesho_size(value)



    try:

        return (

            MEESHO_LABEL_SIZE_ORDER.index(size),

            "",

        )

    except ValueError:

        return (

            len(MEESHO_LABEL_SIZE_ORDER),

            size.lower(),

        )





def _meesho_sku_family_sort_key(value: str):

    sku = str(value or "").strip().upper()



    known_prefixes = [

        "I&D-VEST-POLY-PRNT",

    ]



    for prefix in known_prefixes:

        if sku.startswith(prefix):

            return prefix



    match = re.match(r"^(LSDSPLN|LSDS\d+|SN\d+)(?=[-_]|$)", sku)



    if match:

        return match.group(1)



    return sku





def _meesho_line_start_size(words):

    if not words:

        return None



    first_word = _normalize_meesho_size(words[0])



    if len(words) >= 2:

        first_two_words = _normalize_meesho_size(

            f"{words[0]} {words[1]}"

        )



        if first_two_words in MEESHO_LABEL_SIZE_TOKENS:

            return first_two_words



    if first_word in MEESHO_LABEL_SIZE_TOKENS:

        return first_word



    return None





def _find_meesho_size_in_words(words, start_index=0):

    for index in range(start_index, len(words)):

        size = _meesho_line_start_size(words[index:index + 2])



        if size:

            return index, size



    return None, None





def _extract_meesho_label_product(text: str):

    product_match = re.search(

        r"Product\s+Details",

        text or "",

        flags=re.IGNORECASE,

    )



    if not product_match:

        return None



    section = text[product_match.end():]

    header_match = re.search(

        r"SKU\s+Size\s+Qty\s+Color\s+Order\s+No\.?",

        section,

        flags=re.IGNORECASE,

    )



    if header_match:

        section = section[header_match.end():]



    section = re.split(

        r"TAX\s+INVOICE|BILL\s+TO|SHIP\s+TO|Purchase\s+Order",

        section,

        maxsplit=1,

        flags=re.IGNORECASE,

    )[0]



    lines = [

        line.strip()

        for line in section.splitlines()

        if line.strip()

    ]

    sku_parts = []

    size = None



    for line in lines[:8]:

        words = line.split()



        if not words:

            continue



        line_start_size = _meesho_line_start_size(words)

        if sku_parts and (

            line_start_size

            or re.fullmatch(r"\d+", words[0])

        ):

            size = size or line_start_size

            break



        size_index, line_size = _find_meesho_size_in_words(

            words,

            start_index=1,

        )



        if size_index is not None:

            sku_parts.append(

                " ".join(words[:size_index])

            )

            size = size or line_size

            break



        sku_parts.append(line)



    sku = "".join(sku_parts).replace(" ", "").strip(":-")

    return {

        "sku": sku or None,

        "size": size,

    }











def _extract_meesho_label_carrier(text: str):
    match = re.search(r"(Valmo|Xpress Bees|Delhivery|Shadowfax|Ecom Express)", str(text or ""), flags=re.IGNORECASE)
    if match:
        return match.group(1).strip().upper()
    return "UNKNOWN"

def _build_meesho_label_sorted_pdf(input_paths, output_path: str):

    from pypdf import PdfReader, PdfWriter



    writer = PdfWriter()
    page_entries = []
    zone_counts = Counter()
    input_paths = input_paths if isinstance(input_paths, list) else [input_paths]

    for file_index, input_path in enumerate(input_paths):
        reader = PdfReader(input_path)

        for page_index, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            product = _extract_meesho_label_product(text)
            carrier_name = _extract_meesho_label_carrier(text)
            zone_counts[carrier_name] += 1

            page_entries.append({
                "index": len(page_entries),
                "file_index": file_index,
                "page_index": page_index,
                "page": page,
                "sku": product["sku"],
                "size": product["size"],
                "carrier_name": carrier_name,
            })



    if not page_entries:

        raise HTTPException(

            status_code=400,

            detail="Meesho PDF does not contain any pages.",

        )



    sorted_entries = sorted(

        page_entries,

        key=lambda item: (

            item["sku"] is None,

            _natural_sort_key(

                _meesho_sku_family_sort_key(item["sku"] or "")

            ),

            item["size"] is None,

            _meesho_size_sort_key(item["size"] or ""),

            _natural_sort_key(item["sku"] or ""),

            item["index"],

        ),

    )



    for entry in sorted_entries:

        writer.add_page(entry["page"])



    if reader.metadata:

        writer.add_metadata(

            {

                key: value

                for key, value in reader.metadata.items()

                if value is not None

            }

        )



    with open(output_path, "wb") as output_file:

        writer.write(output_file)



    return {
        "label_count": len(reader.pages),
        "zone_counts": zone_counts,
        "missing_pages": [],
        "report_date": datetime.now().date(),
        "readable_sku_count": sum(
            1
            for entry in page_entries
            if entry["sku"]
        ),
        "readable_size_count": sum(
            1
            for entry in page_entries
            if entry["size"]
        ),
    }





def _cropped_output_filename(upload_file: UploadFile):

    clean_name = _clean_upload_filename(

        upload_file.filename

    )

    name_without_extension, _ = os.path.splitext(clean_name)

    return f"{name_without_extension} - cropped.pdf"





def _meesho_sorted_output_filename(upload_files):

    clean_names = [

        os.path.splitext(_clean_upload_filename(file.filename))[0]

        for file in upload_files

        if file and file.filename

    ]

    base_name = " + ".join(clean_names) or "meesho-labels"



    if len(base_name) > 140:

        base_name = f"{clean_names[0]} + {len(clean_names) - 1} more"



    return f"{base_name} sorted.pdf"





@router.post("/label-cropper")

def label_cropper(

    flipkart_file: UploadFile = File(None),

    amazon_file: UploadFile = File(None),

    ajio_label_file: UploadFile = File(None),

    ajio_label_files: Optional[List[UploadFile]] = File(None),

    ajio_invoice_file: UploadFile = File(None),

    ajio_invoice_files: Optional[List[UploadFile]] = File(None),

    meesho_file: UploadFile = File(None),

    meesho_files: Optional[List[UploadFile]] = File(None),

    amazon_manual_entries: str = Form(None),

    flipkart_manual_zones: str = Form(None),

):

    ajio_label_uploads = [

        file

        for file in (

            ([ajio_label_file] if ajio_label_file else [])

            + (ajio_label_files or [])

        )

        if file

    ]

    ajio_invoice_uploads = [

        file

        for file in (

            ([ajio_invoice_file] if ajio_invoice_file else [])

            + (ajio_invoice_files or [])

        )

        if file

    ]

    meesho_uploads = [

        file

        for file in ([meesho_file] if meesho_file else []) + (meesho_files or [])

        if file

    ]

    uploaded_files = [

        file

        for file in (

            amazon_file,

            flipkart_file,

            *ajio_label_uploads,

            *ajio_invoice_uploads,

            *meesho_uploads,

        )

        if file

    ]



    if not uploaded_files:

        raise HTTPException(

            status_code=400,

            detail="Upload a Flipkart, Amazon, AJIO, or Meesho label PDF.",

        )



    selected_platform_count = sum(

        [

            bool(amazon_file),

            bool(flipkart_file),

            bool(ajio_label_uploads or ajio_invoice_uploads),

            bool(meesho_uploads),

        ]

    )



    if selected_platform_count > 1:

        raise HTTPException(

            status_code=400,

            detail="Upload one platform label type per request.",

        )



    if (ajio_label_uploads and not ajio_invoice_uploads) or (

        ajio_invoice_uploads and not ajio_label_uploads

    ):

        raise HTTPException(

            status_code=400,

            detail="Upload AJIO shipping labels and customer invoices together.",

        )



    if amazon_file and not amazon_file.filename.lower().endswith(".pdf"):

        raise HTTPException(

            status_code=400,

            detail="Amazon label cropper accepts PDF files only.",

        )



    if flipkart_file and not flipkart_file.filename.lower().endswith(".pdf"):

        raise HTTPException(

            status_code=400,

            detail="Flipkart label cropper accepts PDF files only.",

        )



    for file in ajio_label_uploads + ajio_invoice_uploads:

        if not file.filename.lower().endswith(".pdf"):

            raise HTTPException(

                status_code=400,

                detail="AJIO label cropper accepts PDF files only.",

            )



    for file in meesho_uploads:

        if not file.filename.lower().endswith(".pdf"):

            raise HTTPException(

                status_code=400,

                detail="Meesho label sorter accepts PDF files only.",

            )



    upload_file = (

        amazon_file

        or flipkart_file

        or (ajio_label_uploads[0] if ajio_label_uploads else None)

        or (meesho_uploads[0] if meesho_uploads else None)

    )

    input_path = _save_upload(upload_file) if (amazon_file or flipkart_file) else None

    ajio_label_input_paths = [

        _save_upload(file)

        for file in ajio_label_uploads

    ]

    ajio_invoice_input_paths = [

        _save_upload(file)

        for file in ajio_invoice_uploads

    ]

    meesho_input_paths = [

        _save_upload(file)

        for file in meesho_uploads

    ]

    timestamp = datetime.now().strftime("%d-%m-%Y_%H%M%S")

    platform = (

        "amazon" if amazon_file

        else "flipkart" if flipkart_file

        else "ajio" if ajio_label_uploads

        else "meesho"

    )

    output_filename = (

        _meesho_sorted_output_filename(meesho_uploads)

        if meesho_uploads

        else _cropped_output_filename(upload_file)

    )

    output_path = os.path.join(

        UPLOAD_FOLDER,

        f"{platform}_{timestamp}_{output_filename}",

    )



    try:

        if amazon_file:

            manual_entries = {}



            if amazon_manual_entries:

                try:

                    manual_entries = json.loads(amazon_manual_entries)

                except json.JSONDecodeError as error:

                    raise HTTPException(

                        status_code=400,

                        detail="Invalid manual SKU entries.",

                    ) from error



            _build_amazon_label_cropper_pdf(

                input_path,

                output_path,

                manual_entries=manual_entries,

            )

        elif flipkart_file:

            manual_zones = {}



            if flipkart_manual_zones:

                try:

                    manual_zones = json.loads(flipkart_manual_zones)

                except json.JSONDecodeError as error:

                    raise HTTPException(

                        status_code=400,

                        detail="Invalid manual Flipkart zones.",

                    ) from error



            flipkart_result = _build_flipkart_label_cropper_pdf(

                input_path,

                output_path,

                manual_zones=manual_zones,

            )

        elif ajio_label_uploads:
            ajio_result = _build_ajio_label_cropper_pdf(
                ajio_label_input_paths,
                ajio_invoice_input_paths,
                output_path,
            )
        else:
            meesho_result = _build_meesho_label_sorted_pdf(meesho_input_paths, output_path)

    except ImportError as error:
        import traceback
        traceback.print_exc()   # prints the real error in terminal
        raise HTTPException(
            status_code=500,
            detail=(
                "PDF tools are missing. Install pypdf and reportlab, then try again."
            ),
        ) from error

    if flipkart_file or ajio_label_uploads or meesho_uploads:
        result = flipkart_result if flipkart_file else (ajio_result if ajio_label_uploads else meesho_result)
        source_file = flipkart_file if flipkart_file else (ajio_label_uploads[0] if ajio_label_uploads else meesho_uploads[0])
        if result.get("missing_pages"):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "FLIPKART_ZONES_MISSING",
                    "items": result["missing_pages"],
                    "zone_counts": result["zone_counts"],
                    "label_count": result["label_count"],
                },
            )

        platform_name = "Flipkart" if flipkart_file else ("Ajio" if ajio_label_uploads else "Meesho")
        _save_zone_summary_report(
            result["report_date"],
            result["zone_counts"],
            label_count=result["label_count"],
            source_filename=_clean_upload_filename(source_file.filename),
            platform=platform_name,
        )
        zone_summary_header = json.dumps(
            {
                "report_date": str(result["report_date"]),
                "label_count": sum(
                    int(value or 0)
                    for value in result["zone_counts"].values()
                ),
                "zone_counts": result["zone_counts"],
            }
        )

        return FileResponse(
            output_path,
            media_type="application/pdf",
            filename=output_filename,
            headers={
                "X-Flipkart-Zone-Summary": zone_summary_header,
            },
        )

    return FileResponse(

        output_path,

        media_type="application/pdf",

        filename=output_filename,

    )





@router.get(

    "/current-sku-master"

)

def current_sku_master():



    upload_folder = UPLOAD_FOLDER



    if not os.path.exists(

        upload_folder

    ):



        return {

            "filename": None

        }



    files = os.listdir(

        upload_folder

    )



    sku_files = [



        file for file in files



        if (

            "sku" in file.lower()

            or

            "master" in file.lower()

        )

    ]



    if not sku_files:



        return {

            "filename": None

        }



    latest_file = max(



        sku_files,



        key=lambda f: os.path.getctime(

            os.path.join(

                upload_folder,

                f

            )

        )

    )



    return {

        "filename": latest_file

    }



@router.get("/stock-alerts")

def stock_alerts(

    threshold: int = Query(250)

):

    db: Session = SessionLocal()



    try:

        

        ensure_sticker_inventory(db)



        stock_rows = (

            db.query(StockInventory)

            .join(

                SKUMaster, 

                (StockInventory.style == SKUMaster.style) & (StockInventory.size == SKUMaster.size)

            )

            .join(

                SKUPiece, 

                (SKUMaster.id == SKUPiece.sku_master_id) & (StockInventory.color == SKUPiece.color)

            )

            .filter(

                StockInventory.qty < threshold

            )

            .order_by(

                StockInventory.qty.asc(),

                StockInventory.style.asc(),

                StockInventory.color.asc(),

                StockInventory.size.asc(),

            )

            .all()

        )



        sticker_rows = (

            db.query(StickerInventory)

            .filter(

                StickerInventory.qty < threshold

            )

            .order_by(

                StickerInventory.qty.asc(),

                StickerInventory.style.asc(),

                StickerInventory.color.asc(),

            )

            .all()

        )



        stock_items = [

            {

                "id": row.id,

                "style": row.style,

                "color": row.color,

                "size": row.size,

                "qty": row.qty,

                "type": "piece",

            }

            for row in stock_rows

        ]



        sticker_items = [

            {

                "id": row.id,

                "style": row.style,

                "color": row.color,

                "qty": row.qty,

                "type": "sticker",

            }

            for row in sticker_rows

        ]



        return {

            "count": len(stock_items) + len(sticker_items),

            "stock_count": len(stock_items),

            "sticker_count": len(sticker_items),

            "threshold": threshold,

            "items": stock_items + sticker_items,

            "stock_items": stock_items,

            "sticker_items": sticker_items,

        }



    finally:

        db.close()



@router.delete(

    "/delete-sku-master"

)

def delete_sku_master(db: Session = Depends(get_db)):



    upload_folder = UPLOAD_FOLDER



    if os.path.exists(

        upload_folder

    ):



        files = os.listdir(

            upload_folder

        )



        for file in files:



            if (

                "sku" in file.lower()

                or

                "master" in file.lower()

            ):



                file_path = os.path.join(

                    upload_folder,

                    file

                )



                if os.path.exists(

                    file_path

                ):



                    try:



                        os.remove(

                            file_path

                        )



                    except PermissionError:



                        raise HTTPException(

                            status_code=409,

                            detail=(

                                "Cannot delete SKU master because the uploaded "

                                f"file is still open or locked: {file}. Close "

                                "Excel if it is open, restart the backend if "

                                "needed, then try again."

                            ),

                        )



                    except OSError as e:



                        raise HTTPException(

                            status_code=500,

                            detail=f"Could not delete SKU master file {file}: {e}",

                        )



    db.query(

        SKUPiece

    ).delete()



    db.query(

        SKUMaster

    ).delete()



    db.commit()



    return {



        "message":

        "SKU master deleted successfully"

    }





@router.delete("/clear-cache")
def api_clear_cache():
    import tempfile
    import glob
    snapshot_dir = os.path.join(tempfile.gettempdir(), "inventory_snapshot_cache")
    count = 0
    if os.path.exists(snapshot_dir):
        for f in glob.glob(os.path.join(snapshot_dir, "*.json")):
            try:
                os.remove(f)
                count += 1
            except:
                pass
    return {"message": f"Successfully cleared {count} JSON cache files."}



@router.get("/dashboard-stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    from app.models.daily_sales_report import DailySalesReport
    from sqlalchemy import func
    
    total_orders = db.query(func.sum(DailySalesReport.total_orders)).scalar() or 0
    total_pieces = db.query(func.sum(DailySalesReport.total_piece_qty)).scalar() or 0
    
    latest_date = db.query(func.max(DailySalesReport.report_date)).scalar()
    daily_orders = 0
    if latest_date:
        daily_orders = db.query(func.sum(DailySalesReport.total_orders)).filter(DailySalesReport.report_date == latest_date).scalar() or 0
        
    return {
        "total_orders": total_orders,
        "total_pieces": total_pieces,
        "daily_orders": daily_orders,
        "latest_date": latest_date.isoformat() if latest_date else None
    }


@router.get("/packing-inventory/usage-history")
def get_packing_usage_history(item_type: str = Query(None)):
    db: Session = SessionLocal()
    try:
        from datetime import timedelta, date
        start_date = date.today() - timedelta(days=30)
        
        query = db.query(PackingInventoryUsage).filter(PackingInventoryUsage.usage_date >= start_date)
        if item_type and item_type != "all":
            query = query.filter(PackingInventoryUsage.item_type == item_type)
            
        rows = query.order_by(PackingInventoryUsage.usage_date.asc()).all()
        
        # Group by date for the chart
        grouped = {}
        for r in rows:
            d_str = r.usage_date.strftime("%Y-%m-%d")
            if d_str not in grouped:
                grouped[d_str] = {"date": d_str, "used": 0, "restocked": 0}
            grouped[d_str]["used"] += (r.used_qty or 0)
            grouped[d_str]["restocked"] += (r.restocked_qty or 0)
            
        history = list(grouped.values())
        history.sort(key=lambda x: x["date"])
        
        return {"history": history}
    finally:
        db.close()
