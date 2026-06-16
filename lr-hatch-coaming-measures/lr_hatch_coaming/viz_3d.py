"""3D glTF (.glb) and three.js viewer generation for hatch coaming.

Members → box meshes, Joints → tube/line overlays.
Measure colours layered cumulatively (append-only).
"""

from __future__ import annotations

import json
import math
import os
import struct
from typing import Any, Dict, List, Optional, Tuple, Union

from .models import (
    UNSPECIFIED,
    HatchOpeningBbox,
    MeasureApplication,
    MeasureTarget,
    MemberInput,
    MemberRole,
    JointInput,
    JointType,
)
from .viz_2d import DEFAULT_COLORS

# ── Minimal glTF 2.0 builder ───────────────────────────────────────────────
# We build a .glb (binary glTF) without external dependencies.


def _float32_bytes(vals: List[float]) -> bytes:
    return struct.pack(f"<{len(vals)}f", *vals)


def _uint16_bytes(vals: List[int]) -> bytes:
    return struct.pack(f"<{len(vals)}H", *vals)


def _hex_to_rgb(h: str) -> List[float]:
    h = h.lstrip("#")
    return [int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]


def _box_mesh(
    cx: float, cy: float, cz: float,
    sx: float, sy: float, sz: float,
) -> Tuple[List[float], List[int]]:
    """Return (positions, indices) for an axis-aligned box centered at (cx,cy,cz)."""
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    # 8 vertices
    verts = [
        cx - hx, cy - hy, cz - hz,
        cx + hx, cy - hy, cz - hz,
        cx + hx, cy + hy, cz - hz,
        cx - hx, cy + hy, cz - hz,
        cx - hx, cy - hy, cz + hz,
        cx + hx, cy - hy, cz + hz,
        cx + hx, cy + hy, cz + hz,
        cx - hx, cy + hy, cz + hz,
    ]
    # 12 triangles (36 indices)
    indices = [
        0, 1, 2, 0, 2, 3,  # -Z
        4, 6, 5, 4, 7, 6,  # +Z
        0, 4, 5, 0, 5, 1,  # -Y
        2, 6, 7, 2, 7, 3,  # +Y
        0, 3, 7, 0, 7, 4,  # -X
        1, 5, 6, 1, 6, 2,  # +X
    ]
    return verts, indices


def build_glb(
    bbox: Optional[HatchOpeningBbox],
    members: List[MemberInput],
    joints: List[JointInput],
    applications: List[MeasureApplication],
    color_overrides: Optional[Dict[int, str]] = None,
) -> bytes:
    """Build a minimal glTF-binary (.glb) with hatch coaming geometry."""
    colors = {**DEFAULT_COLORS, **(color_overrides or {})}

    L = bbox.L if bbox and isinstance(bbox, HatchOpeningBbox) else 12000
    B = bbox.B if bbox and isinstance(bbox, HatchOpeningBbox) else 3600
    Hc = bbox.H if bbox and isinstance(bbox, HatchOpeningBbox) else 2500

    # Scale to metres for glTF convention
    sc = 0.001
    sL, sB, sH = L * sc, B * sc, Hc * sc

    target_measures: Dict[str, List[MeasureApplication]] = {}
    for app in applications:
        target_measures.setdefault(app.target_id, []).append(app)

    # Collect meshes: (positions, indices, color_rgba)
    mesh_data: List[Tuple[List[float], List[int], List[float], str]] = []

    deck_t = 0.04  # 40mm deck plate thickness in m
    coam_w = 0.03  # 30mm coaming plate thickness
    top_t = 0.025  # 25mm top plate

    # Base geometry (grey structural)
    # Upper deck
    mesh_data.append((
        *_box_mesh(0, -deck_t / 2, 0, sL, deck_t, sB),
        [0.75, 0.80, 0.85, 1.0], "upper_deck_base",
    ))
    # Coaming sides
    for sign in [-1, 1]:
        mesh_data.append((
            *_box_mesh(0, sH / 2, sign * (sB / 2 + coam_w / 2), coam_w, sH, coam_w),
            [0.90, 0.75, 0.75, 1.0], f"coaming_side_{'+' if sign > 0 else '-'}",
        ))
    # Coaming top
    mesh_data.append((
        *_box_mesh(0, sH + top_t / 2, 0, sL * 0.3, top_t, sB + 2 * coam_w),
        [0.95, 0.88, 0.70, 1.0], "coaming_top_base",
    ))

    # Overlay meshes for each measure on members
    for m in members:
        apps = target_measures.get(m.member_id, [])
        for layer_idx, app in enumerate(apps):
            rgb = _hex_to_rgb(colors.get(app.measure_id, "#888888"))
            alpha = max(0.2, 0.5 - layer_idx * 0.1)
            rgba = rgb + [alpha]
            inflate = 0.002 * (layer_idx + 1)  # slightly larger each layer

            if m.member_role == MemberRole.upper_deck_plate:
                mesh_data.append((
                    *_box_mesh(0, -deck_t / 2, 0,
                               sL + inflate, deck_t + inflate, sB + inflate),
                    rgba, f"m{app.measure_id}_{m.member_id}_{layer_idx}",
                ))
            elif m.member_role == MemberRole.hatch_coaming_side_plate:
                for sign in [-1, 1]:
                    mesh_data.append((
                        *_box_mesh(0, sH / 2,
                                   sign * (sB / 2 + coam_w / 2),
                                   coam_w + inflate, sH + inflate, coam_w + inflate),
                        rgba, f"m{app.measure_id}_{m.member_id}_s{sign}_{layer_idx}",
                    ))
            elif m.member_role == MemberRole.hatch_coaming_top_plate:
                mesh_data.append((
                    *_box_mesh(0, sH + top_t / 2, 0,
                               sL * 0.3 + inflate, top_t + inflate,
                               sB + 2 * coam_w + inflate),
                    rgba, f"m{app.measure_id}_{m.member_id}_{layer_idx}",
                ))

    # Build glTF JSON + binary buffer
    buffer_parts: List[bytes] = []
    accessors: List[Dict[str, Any]] = []
    buffer_views: List[Dict[str, Any]] = []
    meshes_json: List[Dict[str, Any]] = []
    nodes: List[Dict[str, Any]] = []
    materials: List[Dict[str, Any]] = []

    byte_offset = 0

    for mesh_idx, (positions, indices, rgba, name) in enumerate(mesh_data):
        # Material
        mat_idx = mesh_idx
        materials.append({
            "pbrMetallicRoughness": {
                "baseColorFactor": rgba,
                "metallicFactor": 0.1,
                "roughnessFactor": 0.8,
            },
            "alphaMode": "BLEND" if rgba[3] < 1.0 else "OPAQUE",
            "name": f"mat_{name}",
        })

        # Indices
        idx_bytes = _uint16_bytes(indices)
        # Pad to 4-byte alignment
        pad_idx = (4 - len(idx_bytes) % 4) % 4
        idx_bytes += b"\x00" * pad_idx

        buffer_views.append({
            "buffer": 0,
            "byteOffset": byte_offset,
            "byteLength": len(indices) * 2,
            "target": 34963,  # ELEMENT_ARRAY_BUFFER
        })
        accessors.append({
            "bufferView": len(buffer_views) - 1,
            "componentType": 5123,  # UNSIGNED_SHORT
            "count": len(indices),
            "type": "SCALAR",
            "max": [max(indices)],
            "min": [min(indices)],
        })
        idx_acc = len(accessors) - 1
        buffer_parts.append(idx_bytes)
        byte_offset += len(idx_bytes)

        # Positions
        pos_bytes = _float32_bytes(positions)
        pad_pos = (4 - len(pos_bytes) % 4) % 4
        pos_bytes += b"\x00" * pad_pos

        n_verts = len(positions) // 3
        xs = positions[0::3]
        ys = positions[1::3]
        zs = positions[2::3]

        buffer_views.append({
            "buffer": 0,
            "byteOffset": byte_offset,
            "byteLength": len(positions) * 4,
            "target": 34962,  # ARRAY_BUFFER
        })
        accessors.append({
            "bufferView": len(buffer_views) - 1,
            "componentType": 5126,  # FLOAT
            "count": n_verts,
            "type": "VEC3",
            "max": [max(xs), max(ys), max(zs)],
            "min": [min(xs), min(ys), min(zs)],
        })
        pos_acc = len(accessors) - 1
        buffer_parts.append(pos_bytes)
        byte_offset += len(pos_bytes)

        meshes_json.append({
            "primitives": [{
                "attributes": {"POSITION": pos_acc},
                "indices": idx_acc,
                "material": mat_idx,
            }],
            "name": name,
        })
        nodes.append({"mesh": mesh_idx, "name": name})

    all_buffer = b"".join(buffer_parts)

    gltf_json: Dict[str, Any] = {
        "asset": {"version": "2.0", "generator": "lr_hatch_coaming"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes_json,
        "materials": materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(all_buffer)}],
    }

    json_bytes = json.dumps(gltf_json, separators=(",", ":")).encode("utf-8")
    # Pad JSON to 4-byte alignment
    json_pad = (4 - len(json_bytes) % 4) % 4
    json_bytes += b" " * json_pad

    # Pad binary to 4-byte alignment
    bin_pad = (4 - len(all_buffer) % 4) % 4
    all_buffer += b"\x00" * bin_pad

    # GLB structure
    header = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_bytes) + 8 + len(all_buffer))
    json_chunk = struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    bin_chunk = struct.pack("<II", len(all_buffer), 0x004E4942) + all_buffer

    return header + json_chunk + bin_chunk


# ── Three.js viewer HTML ───────────────────────────────────────────────────

_VIEWER_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>LR Hatch Coaming – 3D Viewer</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #1a1a2e; overflow: hidden; }
  #canvas-container { width: 100vw; height: 100vh; }
  #panel {
    position: fixed; left: 0; top: 0; width: 280px; height: 100vh;
    background: rgba(26,26,46,0.95); color: #eee; padding: 16px;
    overflow-y: auto; z-index: 10; border-right: 1px solid #333;
  }
  #panel h2 { font-size: 14px; margin-bottom: 12px; color: #64ffda; }
  .measure-toggle {
    display: flex; align-items: center; padding: 6px 0;
    border-bottom: 1px solid #333; cursor: pointer;
  }
  .measure-toggle input { margin-right: 8px; }
  .color-dot {
    width: 14px; height: 14px; border-radius: 50%;
    display: inline-block; margin-right: 8px; flex-shrink: 0;
  }
  .measure-label { font-size: 12px; }
  .detail-popup {
    display: none; position: fixed; right: 20px; top: 20px;
    width: 320px; background: rgba(26,26,46,0.95); color: #eee;
    padding: 16px; border-radius: 8px; border: 1px solid #64ffda;
    z-index: 20; font-size: 12px; max-height: 60vh; overflow-y: auto;
  }
  .detail-popup.active { display: block; }
  .detail-popup h3 { color: #64ffda; margin-bottom: 8px; }
  .detail-popup pre { white-space: pre-wrap; font-size: 11px; color: #ccc; }
</style>
</head>
<body>
<div id="panel">
  <h2>Applied Measures (Cumulative)</h2>
  <div id="toggles"></div>
</div>
<div id="detail-popup" class="detail-popup">
  <h3 id="popup-title">Details</h3>
  <pre id="popup-content"></pre>
</div>
<div id="canvas-container"></div>

<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }
}
</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(15, 10, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 15);
scene.add(dirLight);
scene.add(new THREE.GridHelper(30, 30, 0x444444, 0x333333));

// Load GLB
const loader = new GLTFLoader();
const modelData = MEASURES_DATA;

loader.load('./hatch_coaming.glb', (gltf) => {
  const model = gltf.scene;
  scene.add(model);

  // Build toggle panel
  const togglesEl = document.getElementById('toggles');
  const meshGroups = {};

  model.traverse((child) => {
    if (child.isMesh && child.name) {
      const mMatch = child.name.match(/^m(\\d+)_/);
      if (mMatch) {
        const mid = parseInt(mMatch[1]);
        if (!meshGroups[mid]) meshGroups[mid] = [];
        meshGroups[mid].push(child);
      }
    }
  });

  const COLORS = __COLORS_JSON__;
  for (const [mid, label] of Object.entries(modelData.measureLabels)) {
    const div = document.createElement('div');
    div.className = 'measure-toggle';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.addEventListener('change', () => {
      const meshes = meshGroups[parseInt(mid)] || [];
      meshes.forEach(m => m.visible = cb.checked);
    });

    const dot = document.createElement('span');
    dot.className = 'color-dot';
    dot.style.background = COLORS[mid] || '#888';

    const lbl = document.createElement('span');
    lbl.className = 'measure-label';
    lbl.textContent = `M${mid}: ${label}`;

    div.appendChild(cb);
    div.appendChild(dot);
    div.appendChild(lbl);

    div.addEventListener('click', (e) => {
      if (e.target === cb) return;
      showDetail(mid, label);
    });
    togglesEl.appendChild(div);
  }

  // Raycaster for click-to-detail
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  renderer.domElement.addEventListener('dblclick', (event) => {
    mouse.x = ((event.clientX - 280) / (window.innerWidth - 280)) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(model.children, true);
    if (intersects.length > 0) {
      const name = intersects[0].object.name;
      const mMatch = name.match(/^m(\\d+)_/);
      if (mMatch) {
        const mid = mMatch[1];
        showDetail(mid, modelData.measureLabels[mid] || name);
      }
    }
  });
}, undefined, (err) => console.error('GLB load error:', err));

function showDetail(mid, label) {
  const popup = document.getElementById('detail-popup');
  const title = document.getElementById('popup-title');
  const content = document.getElementById('popup-content');
  const apps = modelData.applications.filter(a => a.measure_id === parseInt(mid));
  title.textContent = `Measure ${mid}: ${label}`;
  content.textContent = JSON.stringify(apps, null, 2);
  popup.classList.add('active');
  setTimeout(() => popup.classList.remove('active'), 8000);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
</script>
</body>
</html>
"""


def generate_viewer_html(
    applications: List[MeasureApplication],
    color_overrides: Optional[Dict[int, str]] = None,
) -> str:
    """Generate three.js viewer HTML with embedded measure data."""
    colors = {**DEFAULT_COLORS, **(color_overrides or {})}

    measure_labels: Dict[str, str] = {}
    apps_serializable: List[Dict[str, Any]] = []

    for app in applications:
        mid_str = str(app.measure_id)
        if mid_str not in measure_labels:
            measure_labels[mid_str] = app.measure_name
        apps_serializable.append({
            "measure_id": app.measure_id,
            "measure_name": app.measure_name,
            "target_type": app.target_type.value,
            "target_id": app.target_id,
            "status": app.status.value,
            "details": app.details,
            "rule_ref": app.rule_ref,
        })

    data = {
        "measureLabels": measure_labels,
        "applications": apps_serializable,
    }

    colors_json = json.dumps({str(k): v for k, v in colors.items()})

    html = _VIEWER_HTML.replace(
        "MEASURES_DATA",
        json.dumps(data, indent=2),
    ).replace(
        "__COLORS_JSON__",
        colors_json,
    )

    return html


# ── File output ─────────────────────────────────────────────────────────────

def write_3d_outputs(
    output_dir: str,
    bbox: Optional[HatchOpeningBbox],
    members: List[MemberInput],
    joints: List[JointInput],
    applications: List[MeasureApplication],
    color_overrides: Optional[Dict[int, str]] = None,
) -> Dict[str, str]:
    """Write .glb and viewer.html to output directory."""
    model3d_dir = os.path.join(output_dir, "model3d")
    os.makedirs(model3d_dir, exist_ok=True)

    paths: Dict[str, str] = {}

    glb_data = build_glb(bbox, members, joints, applications, color_overrides)
    glb_path = os.path.join(model3d_dir, "hatch_coaming.glb")
    with open(glb_path, "wb") as f:
        f.write(glb_data)
    paths["glb"] = glb_path

    viewer_html = generate_viewer_html(applications, color_overrides)
    viewer_path = os.path.join(model3d_dir, "viewer.html")
    with open(viewer_path, "w", encoding="utf-8") as f:
        f.write(viewer_html)
    paths["viewer_html"] = viewer_path

    return paths
