# -*- coding: utf-8 -*-
"""Build viewer_offline.html: fully self-contained, works from file:// with
no internet. Inlines three.js (UMD r147), embeds STL models and diagram PNGs
as base64."""
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent
html = (ROOT / "viewer.html").read_text(encoding="utf-8")

libs = "".join(
    "<script>\n" + (ROOT / "lib" / f).read_text(encoding="utf-8") + "\n</script>\n"
    for f in ("three.min.js", "OrbitControls.js", "STLLoader.js")
)

models = {
    f: base64.b64encode((ROOT / f).read_bytes()).decode()
    for f in ("outer_NPS3_Sch10S.stl", "inner_NPS2_Sch40.stl",
              "flange_WN_compact.stl", "weld_beads.stl")
}
cards = {
    p.stem: "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()
    for p in ROOT.glob("rt_shot[123].png")
}
cards.update({
    p.stem: "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()
    for p in ROOT.glob("rt_side[123].png")
})
cards.update({
    p.stem: "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()
    for p in ROOT.glob("rt_film[123].png")
})
embed = ("<script>\nconst EMBED = " +
         json.dumps({"models": models, "cards": cards}) + ";\n</script>\n")

# 1) drop the CDN import map, inline the libraries + data instead
html = re.sub(r'<script type="importmap">.*?</script>\n',
              lambda _: libs + embed, html, count=1, flags=re.S)

# 2) plain script instead of ES module (modules are blocked on file://)
html = html.replace('<script type="module">', '<script>')
html = html.replace(
    "import * as THREE from 'three';\n"
    "import { OrbitControls } from 'three/addons/controls/OrbitControls.js';\n"
    "import { STLLoader } from 'three/addons/loaders/STLLoader.js';",
    "const OrbitControls = THREE.OrbitControls;\n"
    "const STLLoader = THREE.STLLoader;"
)

# 3) parse embedded geometry instead of fetching .stl files
html = html.replace(
    """function loadPart(file, material) {
  return new Promise((resolve, reject) => {
    loader.load(file + '?v=' + Date.now(), geometry => {
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.y = Math.PI / 2;
      mesh.position.x = -PIPE_LENGTH / 2;
      mesh.position.y = OUTER_RADIUS;
      scene.add(mesh);
      resolve(mesh);
    }, undefined, reject);
  });
}""",
    """function b64ToBuf(b64) {
  const s = atob(b64);
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a.buffer;
}
function loadPart(file, material) {
  const geometry = loader.parse(b64ToBuf(EMBED.models[file]));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.y = Math.PI / 2;
  mesh.position.x = -PIPE_LENGTH / 2;
  mesh.position.y = OUTER_RADIUS;
  scene.add(mesh);
  return Promise.resolve(mesh);
}"""
)

# 4) r147 color management -> match the r160 sRGB look
html = html.replace(
    "const renderer = new THREE.WebGLRenderer({ antialias: true });",
    "THREE.ColorManagement.legacyMode = false;\n"
    "const renderer = new THREE.WebGLRenderer({ antialias: true });\n"
    "renderer.outputEncoding = THREE.sRGBEncoding;"
)

# 5) diagram cards from data URIs
html = html.replace(
    "cardTop.src = `rt_shot${idx + 1}.png?v=${CARD_V}`;",
    "cardTop.src = EMBED.cards['rt_shot' + (idx + 1)];"
)
html = html.replace(
    "cardSide.src = `rt_side${idx + 1}.png?v=${CARD_V}`;",
    "cardSide.src = EMBED.cards['rt_side' + (idx + 1)];"
)
html = html.replace(
    "cardFilm.src = `rt_film${idx + 1}.png?v=${CARD_V}`;",
    "cardFilm.src = EMBED.cards['rt_film' + (idx + 1)];"
)

out = ROOT / "viewer_offline.html"
out.write_text(html, encoding="utf-8")
print(f"wrote {out.name}: {out.stat().st_size / 1e6:.1f} MB")

# sanity: no CDN references left
assert "cdn.jsdelivr" not in html, "CDN reference still present!"
print("no CDN references - fully standalone")
