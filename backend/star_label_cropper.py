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





