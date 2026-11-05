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
        "label_count": len(writer.pages),
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





