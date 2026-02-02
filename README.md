# Scan Mail Helper

This repository provides a lightweight CLI tool that:
1) Extracts text from scanned JPG/PNG/PDF files (or uses pre-extracted text).
2) Detects a vehicle plate and a due date.
3) Looks up the employee email from a CSV mapping table.

The goal is to enable a simple automation flow where a scan file alone is
enough to identify the right recipient and due date.

## Requirements

- Python 3.10+
- Optional external tools for OCR and PDF extraction:
  - `tesseract` (OCR for images and image-based PDFs)
  - `pdftotext` (from Poppler, for text-based PDFs)

The CLI works without external tools if you provide `--text` or `--text-file`.

## CSV format

`vehicle_employee.csv` uses the following columns:

```
plate,employee_name,email
12GA3456,Employee A,employee.a@example.com
123NA4567,Employee B,employee.b@example.com
```

The sample values above are ASCII placeholders; replace them with your real
plate formats when you use the tool.

## Usage

```bash
# From a scan file (OCR tools required for images)
python scan_mail_tool.py --file "/path/to/scan.pdf" --json

# From a text file already produced by OCR
python scan_mail_tool.py --text-file "/path/to/ocr.txt"

# Override the default CSV mapping
python scan_mail_tool.py --file "/path/to/scan.jpg" --db "/path/to/vehicle_employee.csv"
```

## Power Automate integration (outline)

1. Trigger on file creation (OneDrive/SharePoint/Outlook).
2. Use AI Builder or OCR action to extract text.
3. Call this script with `--text` or `--text-file`.
4. Use the returned `email` and `due_date` to compose the outgoing email.

## Notes

- Plate matching assumes Korean plate formats with a Hangul letter between
  digit groups (for example, "12{HANGUL}3456"). If your format differs,
  adjust `PLATE_REGEX` in `scan_mail_tool.py`.
- Due dates are detected from common numeric patterns and ranked higher if
  the line contains "napbu" or "gihan" hints (encoded as unicode escapes).
