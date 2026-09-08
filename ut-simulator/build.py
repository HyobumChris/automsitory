#!/usr/bin/env python3
"""Inline style.css and src/*.js referenced by index.html into one self-contained HTML file.

Usage:  python3 build.py            -> writes ../utman_simulator.html
        python3 build.py out.html   -> writes the given path
Only the Python standard library is used.

The deliverable is ONE offline HTML file, so this script guarantees that what it
writes carries no reference to anything outside itself.  The guarantee is
enforced structurally, not by URL scheme: every <script>/<link> tag in
index.html must be inlined, and every src/*.js on disk must end up inlined.  A
tag this script cannot inline (unknown attribute shape, absolute URL, missing
file) is a hard error — never a silent partial build.
"""
import glob
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(HERE, 'index.html')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'utman_simulator.html')

# One combined pattern, applied in a single pass over index.html, so that the
# text we splice in is never rescanned as if it were markup.
TAG_RE = re.compile(
    r'<link\b(?P<linkattrs>[^>]*)>'
    r'|<script\b(?P<scriptattrs>[^>]*)>(?P<scriptbody>.*?)</script\s*>',
    re.IGNORECASE | re.DOTALL)

# name="value" | name='value' | name=value | name  (a bare boolean attribute)
ATTR_RE = re.compile(
    r'([A-Za-z_:][-\w:.]*)(?:\s*=\s*("[^"]*"|\'[^\']*\'|[^\s"\'>=`]+))?')

# Any leftover tag that still points at a file next to the HTML instead of
# carrying it.  Checked against the tag skeleton of index.html (see main()).
LEFTOVER_RE = re.compile(r'<script\b[^>]*\ssrc\s*=|<link\b[^>]*\shref\s*=', re.IGNORECASE)


def read(rel):
    """Read a UTF-8 text file addressed relative to this script's directory."""
    with open(os.path.join(HERE, rel), encoding='utf-8') as fh:
        return fh.read()


def attrs_of(text):
    """Parse an HTML tag's attribute text into a {lowercased name: value} dict.

    Bare attributes (``defer``) map to the empty string; quotes are stripped.
    """
    out = {}
    for name, val in ATTR_RE.findall(text or ''):
        if val[:1] in ('"', "'"):
            val = val[1:-1]
        out.setdefault(name.lower(), val)
    return out


def local_path(ref, tag):
    """Return ``ref`` as a repo-relative path, or raise if it cannot be inlined.

    Absolute URLs, protocol-relative URLs, root-absolute and parent-escaping
    paths cannot travel inside the single output file, so they are hard errors.
    """
    if not ref:
        raise SystemExit('ERROR: %s has an empty src/href — refusing to write a partial build' % tag)
    if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', ref) or ref.startswith('//'):
        raise SystemExit('ERROR: %s references %s, which cannot be inlined — the build must be '
                         'self-contained (refusing to write a partial build)' % (tag, ref))
    if ref.startswith('/') or ref.split('#')[0].split('?')[0] == '':
        raise SystemExit('ERROR: %s references the site-absolute path %s, which would not travel '
                         'with the HTML — refusing to write a partial build' % (tag, ref))
    rel = os.path.normpath(ref.split('#')[0].split('?')[0])
    if rel.startswith('..') or os.path.isabs(rel):
        raise SystemExit('ERROR: %s references %s outside the project — refusing to write a '
                         'partial build' % (tag, ref))
    if not os.path.exists(os.path.join(HERE, rel)):
        raise SystemExit('ERROR: %s is referenced by index.html but missing — refusing to write '
                         'a partial build' % rel)
    return rel.replace(os.sep, '/')


def css_repl(attrs, inlined):
    """Inline one <link> tag as a <style> block; raise on anything not inlinable."""
    a = attrs_of(attrs)
    if 'href' not in a:
        return None  # e.g. <link rel="preconnect"> with no target: nothing to carry
    tag = '<link%s>' % attrs
    rel = ' '.join(a.get('rel', '').lower().split())
    if 'stylesheet' not in rel.split():
        raise SystemExit('ERROR: %s is a non-stylesheet link with an href; it cannot be inlined — '
                         'refusing to write a partial build' % tag)
    href = local_path(a['href'], tag)
    css = read(href)
    if '</style' in css.lower():
        raise SystemExit('ERROR: %s contains a literal </style> sequence; write it as <\\/style>' % href)
    inlined.append(href)
    media = ' media="%s"' % a['media'] if a.get('media') else ''
    return '<style%s>\n/* ---- %s ---- */\n%s\n</style>' % (media, href, css)


def js_repl(attrs, body, inlined):
    """Inline one <script src=...> tag; raise on anything not inlinable."""
    a = attrs_of(attrs)
    if 'src' not in a:
        return None  # an inline <script> is already self-contained
    tag = '<script%s>' % attrs
    if body.strip():
        raise SystemExit('ERROR: %s carries both a src and inline content — refusing to write a '
                         'partial build' % tag)
    src = local_path(a['src'], tag)
    js = read(src)
    if '</script' in js.lower():
        raise SystemExit('ERROR: %s contains a literal </script> sequence; write it as <\\/script>' % src)
    inlined.append(src)
    # Keep every attribute except src (so e.g. type="module" survives); defer and
    # async are inert on an inline script and drop out harmlessly.
    kept = re.sub(r'\s(?:src|defer|async|integrity|crossorigin|referrerpolicy)\s*'
                  r'(?:=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+))?', '', attrs, flags=re.IGNORECASE)
    kept = kept.strip().rstrip('/').rstrip()
    return '<script%s>\n// ---- %s ----\n%s\n</script>' % (' ' + kept if kept else '', src, js)


def main():
    """Build the single-file HTML, refusing to write anything but a complete one."""
    html = read('index.html')
    css_files = []
    js_files = []

    def repl(m):
        if m.group('linkattrs') is not None:
            out = css_repl(m.group('linkattrs'), css_files)
        else:
            body = m.group('scriptbody')
            if re.search(r'<script\b', body, re.IGNORECASE):
                raise SystemExit('ERROR: nested or unterminated <script> tag in index.html near %r '
                                 '— refusing to write a partial build' % m.group(0)[:80])
            out = js_repl(m.group('scriptattrs'), body, js_files)
        return m.group(0) if out is None else out

    built = TAG_RE.sub(repl, html)

    # Structural sanity, evaluated on index.html's own markup only (the tag
    # skeleton), so that JavaScript or CSS text spliced in above can never
    # trip — or mask — these checks.
    skeleton = TAG_RE.sub(lambda m: '<!--inlined-->', html)
    leftovers = LEFTOVER_RE.findall(skeleton)
    if leftovers:
        raise SystemExit('ERROR: index.html still references external files after inlining (%s) — '
                         'refusing to write a partial build' % ', '.join(sorted(set(leftovers))))

    # Every module on disk must actually be in the build: catches a file dropped
    # from index.html, which no scan of the output could ever see.
    on_disk = sorted(os.path.relpath(p, HERE).replace(os.sep, '/')
                     for p in glob.glob(os.path.join(HERE, 'src', '*.js')))
    missing = [p for p in on_disk if p not in js_files]
    if missing:
        raise SystemExit('ERROR: %d module(s) exist but are not referenced by index.html: %s — '
                         'refusing to write a partial build' % (len(missing), ', '.join(missing)))
    if not css_files:
        raise SystemExit('ERROR: no stylesheet was inlined — refusing to write a partial build')

    # Belt and braces: no absolute URL survives anywhere in the output.
    urls = re.findall(r'(?:src|href)\s*=\s*["\'](\s*(?:https?:)?//[^"\']+)["\']', built)
    if urls:
        raise SystemExit('ERROR: external references remain: %s' % urls)

    outputs = [os.path.abspath(OUT)]
    if len(sys.argv) <= 1:
        # GitHub Pages copy (docs/ is deployed as-is by .github/workflows/deploy-pages.yml)
        outputs.append(os.path.abspath(os.path.join(HERE, '..', 'docs', 'utman_simulator.html')))
    for out in outputs:
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, 'w', encoding='utf-8') as fh:
            fh.write(built)
        print('wrote %s (%d bytes, %d modules + %d stylesheet(s) inlined)'
              % (out, len(built.encode('utf-8')), len(js_files), len(css_files)))


if __name__ == '__main__':
    main()
