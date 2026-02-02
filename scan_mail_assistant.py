#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import mimetypes
import os
import pathlib
import re
import shutil
import smtplib
import ssl
import sys
from email.message import EmailMessage
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


def format_date(value: Optional[dt.date]) -> str:
    return value.isoformat() if value else "unknown"


class SafeDict(dict):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def render_template(template: str, context: Dict[str, str]) -> str:
    return template.format_map(SafeDict(context))


def split_addresses(value: Optional[str]) -> List[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_bool(value: Optional[str]) -> Optional[bool]:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    return None


def resolve_smtp_settings(args: argparse.Namespace) -> Dict[str, object]:
    host = args.smtp_host or os.getenv("SMTP_HOST")
    port = args.smtp_port
    if port is None:
        env_port = os.getenv("SMTP_PORT")
        if env_port:
            try:
                port = int(env_port)
            except ValueError:
                port = None
    use_ssl = args.smtp_ssl
    if use_ssl is None:
        use_ssl = parse_bool(os.getenv("SMTP_SSL")) or False
    starttls = args.smtp_starttls
    if starttls is None:
        starttls_env = parse_bool(os.getenv("SMTP_STARTTLS"))
        if starttls_env is not None:
            starttls = starttls_env
        else:
            starttls = not use_ssl
    if use_ssl:
        starttls = False
    if port is None:
        port = 465 if use_ssl else 587
    user = args.smtp_user or os.getenv("SMTP_USER")
    password = args.smtp_pass or os.getenv("SMTP_PASS")
    from_addr = args.smtp_from or os.getenv("SMTP_FROM") or user
    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "from_addr": from_addr,
        "use_ssl": use_ssl,
        "starttls": starttls,
    }


def build_email_message(
    to_addrs: Sequence[str],
    cc_addrs: Sequence[str],
    from_addr: str,
    subject: str,
    body: str,
    attachments: Sequence[pathlib.Path],
) -> EmailMessage:
    msg = EmailMessage()
    msg["To"] = ", ".join(to_addrs)
    if cc_addrs:
        msg["Cc"] = ", ".join(cc_addrs)
    msg["From"] = from_addr
    msg["Subject"] = subject
    msg.set_content(body)
    for path in attachments:
        ctype, encoding = mimetypes.guess_type(str(path))
        if ctype is None or encoding is not None:
            ctype = "application/octet-stream"
        maintype, subtype = ctype.split("/", 1)
        msg.add_attachment(
            path.read_bytes(),
            maintype=maintype,
            subtype=subtype,
            filename=path.name,
        )
    return msg


def send_email_message(
    msg: EmailMessage,
    host: str,
    port: int,
    user: Optional[str],
    password: Optional[str],
    use_ssl: bool,
    starttls: bool,
    to_addrs: Sequence[str],
) -> None:
    if use_ssl:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, timeout=30, context=context) as server:
            if user and password:
                server.login(user, password)
            server.send_message(msg, from_addr=msg["From"], to_addrs=to_addrs)
        return
    with smtplib.SMTP(host, port, timeout=30) as server:
        server.ehlo()
        if starttls:
            context = ssl.create_default_context()
            server.starttls(context=context)
            server.ehlo()
        if user and password:
            server.login(user, password)
        server.send_message(msg, from_addr=msg["From"], to_addrs=to_addrs)


def build_output(
    vehicle_numbers: List[str],
    due_date: Optional[dt.date],
    match: Optional[Tuple[str, Dict[str, str]]],
    email_info: Optional[Dict[str, object]],
) -> Dict[str, object]:
    output: Dict[str, object] = {
        "vehicle_numbers": vehicle_numbers,
        "due_date": due_date.isoformat() if due_date else None,
        "matched": None,
        "email": email_info,
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
    email_info = output.get("email") if isinstance(output.get("email"), dict) else None
    if email_info:
        print("Email sent:")
        print(f"  To: {email_info.get('to')}")
        if email_info.get("cc"):
            print(f"  Cc: {email_info.get('cc')}")
        print(f"  From: {email_info.get('from')}")
        print(f"  Subject: {email_info.get('subject')}")


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
    parser.add_argument(
        "--send-email",
        action="store_true",
        help="Send the scan via email to matched recipient.",
    )
    parser.add_argument("--email-to", help="Override recipient email address.")
    parser.add_argument("--email-cc", help="Comma-separated CC addresses.")
    parser.add_argument(
        "--subject-template",
        default="Payment notice for {vehicle_number}",
        help="Email subject template (placeholders allowed).",
    )
    parser.add_argument(
        "--body-template",
        default=(
            "Hello {employee_name},\n\n"
            "A payment notice was received.\n"
            "Vehicle: {vehicle_number}\n"
            "Due date: {due_date}\n\n"
            "Please see the attached scan.\n"
        ),
        help="Email body template (placeholders allowed).",
    )
    parser.add_argument(
        "--no-attach-scan",
        dest="attach_scan",
        action="store_false",
        help="Do not attach the scan file to the email.",
    )
    parser.set_defaults(attach_scan=True)
    parser.add_argument("--smtp-host", help="SMTP host (or SMTP_HOST env).")
    parser.add_argument("--smtp-port", type=int, help="SMTP port (or SMTP_PORT env).")
    parser.add_argument("--smtp-user", help="SMTP username (or SMTP_USER env).")
    parser.add_argument("--smtp-pass", help="SMTP password (or SMTP_PASS env).")
    parser.add_argument("--smtp-from", help="From address (or SMTP_FROM env).")
    parser.add_argument(
        "--smtp-ssl",
        dest="smtp_ssl",
        action="store_true",
        default=None,
        help="Use SMTP over SSL (port 465 default).",
    )
    parser.add_argument(
        "--smtp-no-ssl",
        dest="smtp_ssl",
        action="store_false",
        help="Disable SMTP over SSL.",
    )
    parser.add_argument(
        "--smtp-starttls",
        dest="smtp_starttls",
        action="store_true",
        default=None,
        help="Use STARTTLS (default when not using SSL).",
    )
    parser.add_argument(
        "--smtp-no-starttls",
        dest="smtp_starttls",
        action="store_false",
        help="Disable STARTTLS.",
    )
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
    email_info: Optional[Dict[str, object]] = None
    matched_vehicle = ""
    employee_name = ""
    recipient_email = ""
    if match:
        matched_vehicle, entry = match
        employee_name = entry.get("name", "")
        recipient_email = entry.get("email", "")
    if args.email_to:
        recipient_email = args.email_to
    if args.send_email:
        if not recipient_email:
            print(
                "Recipient email not found. Provide --email-to or check the DB.",
                file=sys.stderr,
            )
            return 2
        smtp = resolve_smtp_settings(args)
        host = smtp.get("host")
        from_addr = smtp.get("from_addr")
        if not host:
            print("SMTP host is required (--smtp-host or SMTP_HOST).", file=sys.stderr)
            return 2
        if not from_addr:
            print("SMTP from address is required (--smtp-from or SMTP_FROM).", file=sys.stderr)
            return 2
        primary_vehicle = matched_vehicle or (vehicle_numbers[0] if vehicle_numbers else "")
        context = {
            "vehicle_number": primary_vehicle,
            "due_date": format_date(due_date),
            "employee_name": employee_name,
            "employee_email": recipient_email,
        }
        subject = render_template(args.subject_template, context)
        body = render_template(args.body_template, context)
        cc_addrs = split_addresses(args.email_cc)
        attachments = [file_path] if args.attach_scan else []
        msg = build_email_message(
            [recipient_email],
            cc_addrs,
            from_addr,
            subject,
            body,
            attachments,
        )
        to_addrs = [recipient_email] + cc_addrs
        send_email_message(
            msg,
            host=str(host),
            port=int(smtp["port"]),
            user=smtp.get("user"),
            password=smtp.get("password"),
            use_ssl=bool(smtp.get("use_ssl")),
            starttls=bool(smtp.get("starttls")),
            to_addrs=to_addrs,
        )
        email_info = {
            "to": recipient_email,
            "cc": cc_addrs,
            "from": from_addr,
            "subject": subject,
        }
    output = build_output(vehicle_numbers, due_date, match, email_info)
    print_summary(output)
    if args.json:
        print(json.dumps(output, ensure_ascii=True, indent=2))
    if args.output:
        out_path = pathlib.Path(args.output)
        out_path.write_text(json.dumps(output, ensure_ascii=True, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
