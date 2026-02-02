#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import pathlib
import re
import shutil
import sys
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


SUPPORTED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}
SUPPORTED_PDF_EXTS = {".pdf"}

# Vehicle plate: 2-3 digits + Hangul + 4 digits (allow ASCII letter fallback).
VEHICLE_RE = re.compile(
    r"\b(?P<num>\d{2,3}\s*[\uAC00-\uD7A3A-Z]\s*\d{4})\b",
    flags=re.IGNORECASE,
)

# Date patterns with explicit year.
DATE_PATTERNS = [
    re.compile(
        r"(?P<y>20\d{2})\s*[./-]\s*"
        r"(?P<m>0?[1-9]|1[0-2])\s*[./-]\s*"
        r"(?P<d>0?[1-9]|[12]\d|3[01])"
    ),
    re.compile(
        r"(?P<y>20\d{2})\s*\uB144\s*"
        r"(?P<m>0?[1-9]|1[0-2])\s*\uC6D4\s*"
        r"(?P<d>0?[1-9]|[12]\d|3[01])\s*(?:\uC77C)?"
    ),
]

# Keywords like "due date" in Korean to prioritize date selection.
KEYWORD_RE = re.compile(
    r"(?:\uB0A9\uBD80\uAE30\uD55C|\uB0A9\uAE30|\uB0A9\uBD80\uC77C|\uAE30\uD55C)",
    flags=re.IGNORECASE,
)


def normalize_vehicle_number(value: str) -> str:
    return re.sub(r"\s+", "", value.strip())


def dedupe_preserve_order(values: Iterable[str]) -> List[str]:
    seen = set()
    result = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def extract_text(file_path: pathlib.Path, force_ocr: bool, lang: str, dpi: int) -> str:
    suffix = file_path.suffix.lower()
    if suffix in SUPPORTED_PDF_EXTS:
        pdf_text = extract_text_from_pdf(file_path)
        if pdf_text.strip() and not force_ocr:
            return pdf_text
        return ocr_pdf(file_path, lang=lang, dpi=dpi)
    if suffix in SUPPORTED_IMAGE_EXTS:
        return ocr_image_path(file_path, lang=lang)
    raise ValueError(f"Unsupported file type: {file_path.suffix}")


def extract_text_from_pdf(file_path: pathlib.Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency: pypdf. Install with: pip install pypdf"
        ) from exc
    reader = PdfReader(str(file_path))
    parts: List[str] = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception:
            parts.append("")
    return "\n".join(parts)


def require_tesseract() -> None:
    if shutil.which("tesseract") is None:
        raise RuntimeError(
            "Tesseract OCR is not installed or not on PATH. "
            "Install it and retry."
        )


def require_poppler() -> None:
    if shutil.which("pdftoppm") is None:
        raise RuntimeError(
            "Poppler tools not found (pdftoppm). "
            "Install poppler and retry."
        )


def ocr_image(image, lang: str) -> str:
    try:
        import pytesseract
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency: pytesseract. Install with: pip install pytesseract"
        ) from exc
    require_tesseract()
    return pytesseract.image_to_string(image, lang=lang)


def ocr_image_path(file_path: pathlib.Path, lang: str) -> str:
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency: pillow. Install with: pip install pillow"
        ) from exc
    with Image.open(file_path) as image:
        return ocr_image(image, lang=lang)


def ocr_pdf(file_path: pathlib.Path, lang: str, dpi: int) -> str:
    try:
        from pdf2image import convert_from_path
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency: pdf2image. Install with: pip install pdf2image"
        ) from exc
    require_poppler()
    require_tesseract()
    images = convert_from_path(str(file_path), dpi=dpi)
    text_parts: List[str] = []
    for image in images:
        text_parts.append(ocr_image(image, lang=lang))
    return "\n".join(text_parts)


def find_vehicle_numbers(text: str) -> List[str]:
    matches = [normalize_vehicle_number(m.group("num")) for m in VEHICLE_RE.finditer(text)]
    return dedupe_preserve_order(matches)


def find_dates(text: str) -> List[Tuple[dt.date, Tuple[int, int], str]]:
    results: List[Tuple[dt.date, Tuple[int, int], str]] = []
    for pattern in DATE_PATTERNS:
        for match in pattern.finditer(text):
            year = int(match.group("y"))
            month = int(match.group("m"))
            day = int(match.group("d"))
            try:
                date_value = dt.date(year, month, day)
            except ValueError:
                continue
            results.append((date_value, match.span(), match.group(0)))
    results.sort(key=lambda entry: entry[1][0])
    return results


def pick_due_date(text: str) -> Optional[dt.date]:
    dates = find_dates(text)
    if not dates:
        return None
    keyword_spans = [match.span() for match in KEYWORD_RE.finditer(text)]
    if not keyword_spans:
        return dates[0][0]
    def span_center(span: Tuple[int, int]) -> float:
        return (span[0] + span[1]) / 2.0
    def distance(date_span: Tuple[int, int]) -> float:
        center = span_center(date_span)
        return min(abs(center - span_center(k)) for k in keyword_spans)
    dates.sort(key=lambda entry: distance(entry[1]))
    return dates[0][0]


def load_db(
    db_path: pathlib.Path,
    vehicle_col: Optional[str],
    name_col: Optional[str],
    email_col: Optional[str],
) -> Dict[str, Dict[str, str]]:
    if db_path.suffix.lower() == ".json":
        return load_db_json(db_path)
    return load_db_csv(db_path, vehicle_col, name_col, email_col)


def load_db_json(db_path: pathlib.Path) -> Dict[str, Dict[str, str]]:
    with db_path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            if isinstance(value, dict):
                result[normalize_vehicle_number(key)] = {
                    "name": str(value.get("name", "")),
                    "email": str(value.get("email", "")),
                }
            else:
                result[normalize_vehicle_number(key)] = {"name": "", "email": str(value)}
        return result
    if isinstance(data, list):
        result = {}
        for row in data:
            if not isinstance(row, dict):
                continue
            vehicle = normalize_vehicle_number(str(row.get("vehicle_number", "")))
            if not vehicle:
                continue
            result[vehicle] = {
                "name": str(row.get("name", "")),
                "email": str(row.get("email", "")),
            }
        return result
    raise ValueError("Unsupported JSON DB format.")


def pick_column(fieldnames: Sequence[str], candidates: Sequence[str]) -> Optional[str]:
    lower_map = {name.lower(): name for name in fieldnames}
    for candidate in candidates:
        if candidate.lower() in lower_map:
            return lower_map[candidate.lower()]
    return None


def load_db_csv(
    db_path: pathlib.Path,
    vehicle_col: Optional[str],
    name_col: Optional[str],
    email_col: Optional[str],
) -> Dict[str, Dict[str, str]]:
    with db_path.open("r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError("CSV file has no header row.")
        fields = reader.fieldnames
        vehicle_col = vehicle_col or pick_column(
            fields, ["vehicle_number", "vehicle", "plate", "car_number"]
        )
        name_col = name_col or pick_column(fields, ["employee", "name", "employee_name"])
        email_col = email_col or pick_column(fields, ["email", "email_address"])
        if not vehicle_col:
            raise ValueError("Could not find vehicle number column in CSV.")
        if not email_col:
            raise ValueError("Could not find email column in CSV.")
        result: Dict[str, Dict[str, str]] = {}
        for row in reader:
            vehicle = normalize_vehicle_number(row.get(vehicle_col, ""))
            if not vehicle:
                continue
            result[vehicle] = {
                "name": (row.get(name_col, "") if name_col else "") or "",
                "email": row.get(email_col, "") or "",
            }
    return result


def lookup_vehicle(
    vehicle_numbers: Sequence[str],
    db: Dict[str, Dict[str, str]],
) -> Optional[Tuple[str, Dict[str, str]]]:
    for vehicle in vehicle_numbers:
        entry = db.get(vehicle)
        if entry:
            return vehicle, entry
    return None


def build_output(
    vehicle_numbers: List[str],
    due_date: Optional[dt.date],
    match: Optional[Tuple[str, Dict[str, str]]],
) -> Dict[str, object]:
    output: Dict[str, object] = {
        "vehicle_numbers": vehicle_numbers,
        "due_date": due_date.isoformat() if due_date else None,
        "matched": None,
    }
    if match:
        vehicle, entry = match
        output["matched"] = {
            "vehicle_number": vehicle,
            "employee_name": entry.get("name", ""),
            "email": entry.get("email", ""),
        }
    return output


def print_summary(output: Dict[str, object]) -> None:
    print("Vehicle numbers:")
    for number in output.get("vehicle_numbers", []):
        print(f"  - {number}")
    print(f"Due date: {output.get('due_date')}")
    matched = output.get("matched")
    if matched:
        print("Matched employee:")
        print(f"  Vehicle: {matched.get('vehicle_number')}")
        print(f"  Name: {matched.get('employee_name')}")
        print(f"  Email: {matched.get('email')}")
    else:
        print("Matched employee: None")


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Extract vehicle number and due date from a scan, "
            "then look up email from a vehicle database."
        )
    )
    parser.add_argument("--file", required=True, help="Path to scan file (pdf/jpg/png).")
    parser.add_argument("--db", help="Path to vehicle database (csv/json).")
    parser.add_argument("--vehicle-col", help="CSV column name for vehicle number.")
    parser.add_argument("--name-col", help="CSV column name for employee name.")
    parser.add_argument("--email-col", help="CSV column name for email.")
    parser.add_argument("--lang", default="kor+eng", help="Tesseract language.")
    parser.add_argument("--dpi", type=int, default=300, help="DPI for PDF OCR.")
    parser.add_argument(
        "--force-ocr",
        action="store_true",
        help="Force OCR for PDFs even if text layer exists.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print JSON to stdout (in addition to summary).",
    )
    parser.add_argument("--output", help="Write JSON output to file.")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    file_path = pathlib.Path(args.file)
    if not file_path.exists():
        print(f"File not found: {file_path}", file=sys.stderr)
        return 2
    text = extract_text(file_path, force_ocr=args.force_ocr, lang=args.lang, dpi=args.dpi)
    if not text.strip():
        print("No text extracted from file.", file=sys.stderr)
    vehicle_numbers = find_vehicle_numbers(text)
    due_date = pick_due_date(text)
    db: Dict[str, Dict[str, str]] = {}
    if args.db:
        db_path = pathlib.Path(args.db)
        if not db_path.exists():
            print(f"DB file not found: {db_path}", file=sys.stderr)
            return 2
        db = load_db(db_path, args.vehicle_col, args.name_col, args.email_col)
    match = lookup_vehicle(vehicle_numbers, db) if db else None
    output = build_output(vehicle_numbers, due_date, match)
    print_summary(output)
    if args.json:
        print(json.dumps(output, ensure_ascii=True, indent=2))
    if args.output:
        out_path = pathlib.Path(args.output)
        out_path.write_text(json.dumps(output, ensure_ascii=True, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
