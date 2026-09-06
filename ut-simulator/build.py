#!/usr/bin/env python3
"""Inline style.css and src/*.js referenced by index.html into one self-contained HTML file.

Usage:  python3 build.py            -> writes ../utman_simulator.html
        python3 build.py out.html   -> writes the given path
Only the Python standard library is used.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(HERE, 'index.html')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'utman_simulator.html')


def read(rel):
    with open(os.path.join(HERE, rel), encoding='utf-8') as fh:
        return fh.read()


def main():
    html = read('index.html')

    def css_repl(m):
        href = m.group(1)
        css = read(href)
        if '</style' in css.lower():
            raise SystemExit('ERROR: %s contains a literal </style> sequence; write it as <\\/style>' % href)
        return '<style>\n/* ---- %s ---- */\n%s\n</style>' % (href, css)

    def js_repl(m):
        src = m.group(1)
        js = read(src)
        if '</script' in js.lower():
            raise SystemExit('ERROR: %s contains a literal </script> sequence; write it as <\\/script>' % src)
        return '<script>\n// ---- %s ----\n%s\n</script>' % (src, js)

    html = re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>', css_repl, html)
    html = re.sub(r'<script\s+src="([^"]+)"\s*>\s*</script>', js_repl, html)

    # Sanity: no remaining external references
    leftovers = re.findall(r'(?:src|href)="(https?://[^"]+)"', html)
    if leftovers:
        raise SystemExit('ERROR: external references remain: %s' % leftovers)

    out = os.path.abspath(OUT)
    with open(out, 'w', encoding='utf-8') as fh:
        fh.write(html)
    print('wrote %s (%d bytes)' % (out, len(html.encode('utf-8'))))


if __name__ == '__main__':
    main()
