#!/usr/bin/env python3
"""
scan_mail_tool.py

CLI helper to extract a vehicle plate, look up an employee email,
and find a due date from scanned JPG/PNG/PDF files or pre-extracted text.

This script is designed to be a lightweight core that can be called from
Power Automate or other orchestration tools.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime


PLATE_REGEX = re.compile(r"(\d{2,3})\s*([\uAC00-\uD7A3])\s*(\d{4})")
DATE_REGEX = re.compile(r"(\d{4})[./-](\d{1,2})[./-](\d{1,2})")
DATE_SHORT_REGEX = re.compile(r"(\d{2})[./-](\d{1,2})[./-](\d{1,2})")
KOREAN_DATE_REGEX = re.compile(
    r"(\d{4})\s*\uB144\s*(\d{1,2})\s*\uC6D4\s*(\d{1,2})\s*\uC77C"
)

HINT_NAPBU = re.compile(r"\uB0A9\uBD80")
HINT_GIHAN = re.compile(r"\uAE30\uD55C")


def read_text_file(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="ignore") as handle:
        return handle.read()


def normalize_plate(raw: str) -> str:
    if not raw:
        return ""
    cleaned = re.sub(r"[\s-]+", "", raw)
    match = PLATE_REGEX.search(cleaned)
    if not match:
        return ""
    return f"{match.group(1)}{match.group(2)}{match.group(3)}"


def extract_plate(text: str) -> str:
    if not text:
        return ""
    match = PLATE_REGEX.search(text)
    if not match:
        return ""
    return f"{match.group(1)}{match.group(2)}{match.group(3)}"


def normalize_date(year: int, month: int, day: int) -> str | None:
    if year < 100:
        year += 2000
    try:
        parsed = datetime(year, month, day)
    except ValueError:
        return None
    return parsed.strftime("%Y-%m-%d")


def date_candidates_from_line(line: str) -> list[tuple[str, str]]:
    candidates: list[tuple[str, str]] = []
    for match in DATE_REGEX.finditer(line):
        normalized = normalize_date(
            int(match.group(1)),
            int(match.group(2)),
            int(match.group(3)),
        )
        if normalized:
            candidates.append((match.group(0), normalized))
    for match in DATE_SHORT_REGEX.finditer(line):
        normalized = normalize_date(
            int(match.group(1)),
            int(match.group(2)),
            int(match.group(3)),
        )
        if normalized:
            candidates.append((match.group(0), normalized))
    for match in KOREAN_DATE_REGEX.finditer(line):
        normalized = normalize_date(
            int(match.group(1)),
            int(match.group(2)),
            int(match.group(3)),
        )
        if normalized:
            candidates.append((match.group(0), normalized))
    return candidates


def score_due_date_line(line: str) -> int:
    score = 0
    if HINT_NAPBU.search(line):
        score += 10
    if HINT_GIHAN.search(line):
        score += 5
    return score


def find_due_date(text: str) -> str:
    if not text:
        return ""
    best_score = -1
    best_date = ""
    best_index = -1
    lines = text.splitlines()
    for idx, line in enumerate(lines):
        candidates = date_candidates_from_line(line)
        if not candidates:
            continue
        score = score_due_date_line(line)
        for _raw, normalized in candidates:
            if score > best_score or (score == best_score and best_index == -1):
                best_score = score
                best_date = normalized
                best_index = idx
    if best_date:
        return best_date
    # Fallback: search the entire text and return the first date-like match.
    for _raw, normalized in date_candidates_from_line(text):
        return normalized
    return ""


def load_vehicle_db(path: str) -> dict[str, dict[str, str]]:
    db: dict[str, dict[str, str]] = {}
    with open(path, "r", encoding="utf-8", errors="ignore", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            plate = normalize_plate(row.get("plate", ""))
            if not plate:
                continue
            db[plate] = {
                "employee_name": row.get("employee_name", "").strip(),
                "email": row.get("email", "").strip(),
            }
    return db


def check_tool_exists(tool: str) -> bool:
    return shutil.which(tool) is not None


def run_command(command: list[str]) -> str:
    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="ignore").strip()
        raise RuntimeError(stderr or f"Command failed: {' '.join(command)}")
    return result.stdout.decode("utf-8", errors="ignore")


def extract_text_from_pdf(path: str) -> str:
    if not check_tool_exists("pdftotext"):
        return ""
    return run_command(["pdftotext", path, "-"])


def ocr_with_tesseract(path: str, lang: str) -> str:
    if not check_tool_exists("tesseract"):
        raise RuntimeError("tesseract not found in PATH")
    return run_command(["tesseract", path, "stdout", "-l", lang])


def extract_text_from_file(path: str, lang: str) -> str:
    extension = os.path.splitext(path)[1].lower()
    if extension == ".txt":
        return read_text_file(path)
    if extension == ".pdf":
        extracted = extract_text_from_pdf(path)
        if extracted.strip():
            return extracted
        return ocr_with_tesseract(path, lang)
    if extension in {".jpg", ".jpeg", ".png", ".tif", ".tiff"}:
        return ocr_with_tesseract(path, lang)
    raise ValueError(f"Unsupported file extension: {extension}")


def resolve_text(args: argparse.Namespace) -> str:
    if args.text:
        return args.text
    if args.text_file:
        return read_text_file(args.text_file)
    if not args.file:
        raise ValueError("Either --file, --text, or --text-file is required.")
    if not os.path.exists(args.file):
        raise FileNotFoundError(f"Input not found: {args.file}")
    return extract_text_from_file(args.file, args.lang)


def format_human_output(result: dict[str, str]) -> str:
    lines = [
        f"plate: {result.get('plate') or 'NOT_FOUND'}",
        f"due_date: {result.get('due_date') or 'NOT_FOUND'}",
        f"employee_name: {result.get('employee_name') or 'NOT_FOUND'}",
        f"email: {result.get('email') or 'NOT_FOUND'}",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract plate/email/due date from scan files or text."
    )
    parser.add_argument("--file", help="Path to scan file (jpg/png/pdf).")
    parser.add_argument("--text", help="Raw OCR text (string).")
    parser.add_argument("--text-file", help="Path to a text file with OCR output.")
    parser.add_argument(
        "--db",
        help="CSV with columns: plate, employee_name, email.",
    )
    parser.add_argument("--lang", default="kor+eng", help="tesseract language.")
    parser.add_argument("--json", action="store_true", help="Output JSON.")
    parser.add_argument("--text-out", help="Write extracted text to file.")
    args = parser.parse_args()

    if sum(bool(x) for x in [args.file, args.text, args.text_file]) != 1:
        print("Provide exactly one of --file, --text, or --text-file.", file=sys.stderr)
        return 2

    try:
        text = resolve_text(args)
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 2

    if args.text_out:
        with open(args.text_out, "w", encoding="utf-8") as handle:
            handle.write(text)

    plate = extract_plate(text)
    due_date = find_due_date(text)

    db_path = args.db
    if not db_path:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        default_db = os.path.join(script_dir, "vehicle_employee.csv")
        if os.path.exists(default_db):
            db_path = default_db

    employee_name = ""
    email = ""
    if db_path:
        if not os.path.exists(db_path):
            print(f"DB not found: {db_path}", file=sys.stderr)
            return 2
        db = load_vehicle_db(db_path)
        entry = db.get(plate or "")
        if entry:
            employee_name = entry.get("employee_name", "")
            email = entry.get("email", "")

    result = {
        "plate": plate,
        "due_date": due_date,
        "employee_name": employee_name,
        "email": email,
    }

    if args.json:
        print(json.dumps(result, ensure_ascii=True))
    else:
        print(format_human_output(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
