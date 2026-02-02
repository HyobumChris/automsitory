# Scan Mail Assistant (vehicle number + due date)

This is a small CLI tool to help with scanned payment notices. Given a scan
(JPG/PNG or PDF), it extracts:

1. Vehicle number (plate)
2. Due date (payment deadline)

Then it looks up the employee email from a vehicle database (CSV/JSON).

## Requirements

Python 3.9+.

Install Python dependencies:

```
pip install -r requirements.txt
```

System dependencies (for OCR):

- Tesseract OCR (binary: `tesseract`)
- Poppler utilities (binary: `pdftoppm`) for PDF OCR

## Database format

CSV example (header required):

```
vehicle_number,employee_name,email
12A3456,Jane Doe,jane@example.com
```

JSON example:

```
{
  "12A3456": { "name": "Jane Doe", "email": "jane@example.com" }
}
```

## Usage

```
python scan_mail_assistant.py --file scan.pdf --db vehicle_db.csv
python scan_mail_assistant.py --file scan.jpg --db vehicle_db.csv --json
python scan_mail_assistant.py --file scan.pdf --db vehicle_db.csv --force-ocr
```

Optional CSV column overrides:

```
python scan_mail_assistant.py --file scan.pdf --db vehicle_db.csv \
  --vehicle-col plate --name-col employee --email-col email_address
```

## Notes

- Vehicle plate detection expects 2-3 digits + 1 character + 4 digits.
  Korean plates are supported; ASCII letters are allowed as a fallback.
- Due date detection prioritizes dates near common "due date" keywords.
