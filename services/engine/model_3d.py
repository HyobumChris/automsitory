"""
model_3d.py – Generate 3D GLB model + viewer.html (Three.js) for hatch coaming visualization.

Generates:
  - hatch_coaming.glb: Parametric 3D model with layered measure overlays
  - viewer.html: Interactive Three.js viewer with legend, layer toggle, and click info
"""
from __future__ import annotations

import json
import logging
import os
import struct
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from services.engine.rules_db import (
    UNSPECIFIED,
    DecisionResults,
    ProjectInput,
)

logger = logging.getLogger(__name__)


def _load_colors() -> dict:
    p = Path("configs/colors.json")
    if p.exists():
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _hex_to_rgb(hex_color: str) -> Tuple[float, float, float]:
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4))


def _create_box_vertices(x, y, z, w, h, d):
    """Create vertices and indices for an axis-aligned box."""
    vertices = np.array([
        [x, y, z], [x+w, y, z], [x+w, y+h, z], [x, y+h, z],
        [x, y, z+d], [x+w, y, z+d], [x+w, y+h, z+d], [x, y+h, z+d],
    ], dtype=np.float32)
    indices = np.array([
        0,1,2, 0,2,3, 4,6,5, 4,7,6,
        0,4,5, 0,5,1, 2,6,7, 2,7,3,
        0,3,7, 0,7,4, 1,5,6, 1,6,2,
    ], dtype=np.uint16)
    normals = np.zeros_like(vertices)
    for i in range(0, len(indices), 3):
        i0, i1, i2 = indices[i], indices[i+1], indices[i+2]
        v0, v1, v2 = vertices[i0], vertices[i1], vertices[i2]
        n = np.cross(v1 - v0, v2 - v0)
        norm = np.linalg.norm(n)
        if norm > 0:
            n = n / norm
        normals[i0] += n
        normals[i1] += n
        normals[i2] += n
    norms = np.linalg.norm(normals, axis=1, keepdims=True)
    norms[norms == 0] = 1
    normals = normals / norms
    return vertices, normals, indices


def _create_line_vertices(points: list) -> np.ndarray:
    """Create line vertices from point list."""
    return np.array(points, dtype=np.float32)


def generate_glb(
    project: ProjectInput,
    results: DecisionResults,
    output_dir: str,
) -> str:
    """
    Generate a simple GLB file using pygltflib.

    Creates a parametric 3D model of the hatch coaming with measure overlays.
    """
    from pygltflib import GLTF2, Scene, Node, Mesh, Primitive, Accessor, BufferView, Buffer, Material, Asset

    colors = _load_colors()
    bbox = project.visualization_inputs.get_bbox()

    if bbox:
        L, B, H = bbox.L / 1000.0, bbox.B / 1000.0, bbox.H / 1000.0
    else:
        L, B, H = 10.0, 8.0, 2.0

    deck_thick = 0.03 * max(L, B, H)
    side_thick = 0.02 * max(L, B, H)
    top_thick = 0.015 * max(L, B, H)

    # Geometry definitions: (name, member_id, x, y, z, w, h, d)
    geometries = [
        ("upper_deck", "M01", -L*0.65, -deck_thick, -B*0.65, L*1.3, deck_thick, B*1.3),
        ("coaming_side_left", "M02", -L/2, 0, -B/2-side_thick, L, H, side_thick),
        ("coaming_side_right", "M02", -L/2, 0, B/2, L, H, side_thick),
        ("coaming_side_front", "M02", -L/2-side_thick, 0, -B/2-side_thick, side_thick, H, B+2*side_thick),
        ("coaming_side_back", "M02", L/2, 0, -B/2-side_thick, side_thick, H, B+2*side_thick),
        ("coaming_top", "M03", -L/2-side_thick, H, -B/2-side_thick, L+2*side_thick, top_thick, B+2*side_thick),
    ]

    # Build GLB data
    all_bin = bytearray()
    accessors = []
    buffer_views = []
    meshes_list = []
    materials_list = []
    nodes_list = []

    # Create base materials
    base_material_idx = len(materials_list)
    materials_list.append(Material(
        pbrMetallicRoughness={
            "baseColorFactor": [0.75, 0.75, 0.75, 1.0],
            "metallicFactor": 0.3,
            "roughnessFactor": 0.7,
        },
        name="base_material",
    ))

    # Create measure overlay materials
    measure_material_map = {}
    for mid in [0, 1, 2, 3, 4, 5]:
        m_info = colors.get("measures", {}).get(str(mid), {})
        hex_c = m_info.get("hex", "#888888")
        alpha = m_info.get("alpha", 0.25)
        r, g, b = _hex_to_rgb(hex_c)
        mat = Material(
            pbrMetallicRoughness={
                "baseColorFactor": [r, g, b, alpha],
                "metallicFactor": 0.1,
                "roughnessFactor": 0.9,
            },
            alphaMode="BLEND",
            name=f"measure_{mid}_material",
        )
        measure_material_map[mid] = len(materials_list)
        materials_list.append(mat)

    def _add_mesh(name, verts, normals, indices, material_idx):
        """Add a mesh to the GLB data."""
        offset = len(all_bin)

        verts_bytes = verts.astype(np.float32).tobytes()
        normals_bytes = normals.astype(np.float32).tobytes()
        indices_bytes = indices.astype(np.uint16).tobytes()

        # Pad to 4-byte alignment
        def pad4(data):
            while len(data) % 4 != 0:
                data += b'\x00'
            return data

        verts_bytes = pad4(verts_bytes)
        normals_bytes = pad4(normals_bytes)
        indices_bytes = pad4(indices_bytes)

        all_bin.extend(verts_bytes)
        all_bin.extend(normals_bytes)
        all_bin.extend(indices_bytes)

        verts_bv = BufferView(
            buffer=0, byteOffset=offset,
            byteLength=len(verts_bytes), target=34962
        )
        normals_bv = BufferView(
            buffer=0, byteOffset=offset + len(verts_bytes),
            byteLength=len(normals_bytes), target=34962
        )
        indices_bv = BufferView(
            buffer=0, byteOffset=offset + len(verts_bytes) + len(normals_bytes),
            byteLength=len(indices_bytes), target=34963
        )

        bv_start = len(buffer_views)
        buffer_views.extend([verts_bv, normals_bv, indices_bv])

        vmin = verts.min(axis=0).tolist()
        vmax = verts.max(axis=0).tolist()

        acc_pos = Accessor(
            bufferView=bv_start, componentType=5126, count=len(verts),
            type="VEC3", max=vmax, min=vmin
        )
        acc_norm = Accessor(
            bufferView=bv_start + 1, componentType=5126, count=len(normals),
            type="VEC3", max=[1,1,1], min=[-1,-1,-1]
        )
        acc_idx = Accessor(
            bufferView=bv_start + 2, componentType=5123, count=len(indices),
            type="SCALAR", max=[int(indices.max())], min=[int(indices.min())]
        )

        acc_start = len(accessors)
        accessors.extend([acc_pos, acc_norm, acc_idx])

        prim = Primitive(
            attributes={"POSITION": acc_start, "NORMAL": acc_start + 1},
            indices=acc_start + 2,
            material=material_idx,
        )
        mesh_idx = len(meshes_list)
        meshes_list.append(Mesh(primitives=[prim], name=name))
        node = Node(mesh=mesh_idx, name=name)
        nodes_list.append(node)
        return len(nodes_list) - 1

    # Build base geometry
    node_indices = []
    for (name, member_id, x, y, z, w, h, d) in geometries:
        verts, norms, idxs = _create_box_vertices(x, y, z, w, h, d)
        ni = _add_mesh(name, verts, norms, idxs, base_material_idx)
        node_indices.append(ni)

    # Build measure overlay meshes (slightly scaled up to prevent z-fighting)
    for (name, member_id, x, y, z, w, h, d) in geometries:
        measures = []
        tr = results.member_results.get(member_id)
        if tr:
            measures = [am.measure_id for am in tr.applied_measures]

        for mid in measures:
            mat_idx = measure_material_map.get(mid, base_material_idx)
            scale = 1.005 + mid * 0.002
            cx, cy, cz = x + w/2, y + h/2, z + d/2
            sw, sh, sd = w * scale, h * scale, d * scale
            verts, norms, idxs = _create_box_vertices(
                cx - sw/2, cy - sh/2, cz - sd/2, sw, sh, sd
            )
            ni = _add_mesh(f"{name}_m{mid}", verts, norms, idxs, mat_idx)
            node_indices.append(ni)

    # Joint overlays for butt welds (line-like thin boxes)
    for j in project.joints:
        jtr = results.joint_results.get(j.joint_id)
        if not jtr:
            continue
        j_measures = [am.measure_id for am in jtr.applied_measures]
        if not j_measures:
            continue

        if j.joint_type == "block_to_block_butt":
            jx = 0  # center
            for mid in j_measures:
                mat_idx = measure_material_map.get(mid, base_material_idx)
                tube_w = 0.02 + mid * 0.005
                verts, norms, idxs = _create_box_vertices(
                    jx - tube_w/2, -deck_thick, -B/2,
                    tube_w, H + deck_thick + top_thick, B
                )
                ni = _add_mesh(f"joint_{j.joint_id}_m{mid}", verts, norms, idxs, mat_idx)
                node_indices.append(ni)

    # Assemble GLB
    gltf = GLTF2(
        asset=Asset(version="2.0", generator="LR Hatch Coaming Measure Viewer"),
        scenes=[Scene(nodes=node_indices)],
        nodes=nodes_list,
        meshes=meshes_list,
        materials=materials_list,
        accessors=accessors,
        bufferViews=buffer_views,
        buffers=[Buffer(byteLength=len(all_bin))],
    )

    # Set binary blob
    gltf.set_binary_blob(bytes(all_bin))

    os.makedirs(output_dir, exist_ok=True)
    glb_path = os.path.join(output_dir, "hatch_coaming.glb")
    gltf.save(glb_path)
    logger.info(f"Saved GLB: {glb_path}")
    return glb_path


def generate_viewer_html(
    project: ProjectInput,
    results: DecisionResults,
    output_dir: str,
) -> str:
    """Generate Three.js viewer HTML for the 3D model."""
    colors = _load_colors()

    # Build measure info for JS
    measure_info = {}
    for mid in [0, 1, 2, 3, 4, 5]:
        m = colors.get("measures", {}).get(str(mid), {})
        measure_info[mid] = {
            "label": m.get("label", f"Measure {mid}"),
            "hex": m.get("hex", "#888888"),
            "alpha": m.get("alpha", 0.25),
        }

    # Build target data for click popup
    target_data = {}
    for tid, tr in {**results.member_results, **results.joint_results}.items():
        measures = []
        for am in tr.applied_measures:
            reqs = [r.description for r in am.requirements]
            measures.append({
                "measure_id": am.measure_id,
                "status": am.status,
                "requirements": reqs,
                "notes": am.notes,
                "rule_basis": am.rule_basis,
            })
        target_data[tid] = {
            "type": tr.target_type,
            "measures": measures,
        }

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LR Hatch Coaming - 3D Measure Viewer</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: 'Segoe UI', sans-serif; background: #1a1a2e; color: #eee; overflow: hidden; }}
  #canvas-container {{ width: 100vw; height: 100vh; }}
  canvas {{ display: block; }}
  #legend {{
    position: absolute; top: 15px; left: 15px; background: rgba(20,20,40,0.92);
    border-radius: 10px; padding: 15px 18px; min-width: 220px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  }}
  #legend h3 {{ margin-bottom: 10px; font-size: 14px; color: #aaa; }}
  .legend-item {{ display: flex; align-items: center; margin: 6px 0; cursor: pointer; }}
  .legend-swatch {{ width: 16px; height: 16px; border-radius: 3px; margin-right: 8px; border: 1px solid #555; }}
  .legend-label {{ font-size: 12px; }}
  .legend-item.disabled .legend-label {{ text-decoration: line-through; opacity: 0.4; }}
  .legend-item.disabled .legend-swatch {{ opacity: 0.3; }}
  #info-panel {{
    position: absolute; top: 15px; right: 15px; background: rgba(20,20,40,0.95);
    border-radius: 10px; padding: 18px; max-width: 380px; max-height: 80vh;
    overflow-y: auto; display: none;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  }}
  #info-panel h3 {{ margin-bottom: 8px; color: #7ecfff; font-size: 15px; }}
  #info-panel .measure-item {{ margin: 8px 0; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 6px; }}
  #info-panel .measure-item h4 {{ font-size: 12px; color: #ffc107; margin-bottom: 4px; }}
  #info-panel .measure-item p {{ font-size: 11px; color: #ccc; margin: 2px 0; }}
  #info-panel .close-btn {{ position: absolute; top: 8px; right: 12px; cursor: pointer; font-size: 18px; color: #888; }}
  #no-dim-note {{
    position: absolute; bottom: 15px; left: 50%; transform: translateX(-50%);
    background: rgba(255,193,7,0.15); color: #ffc107; padding: 6px 16px;
    border-radius: 6px; font-size: 11px; display: none;
  }}
  #project-label {{
    position: absolute; bottom: 15px; left: 15px;
    font-size: 11px; color: #666;
  }}
</style>
</head>
<body>
<div id="canvas-container"></div>

<div id="legend">
  <h3>Measure Layers</h3>
  <div id="legend-items"></div>
</div>

<div id="info-panel">
  <span class="close-btn" onclick="document.getElementById('info-panel').style.display='none'">&times;</span>
  <h3 id="info-title">Target Info</h3>
  <div id="info-content"></div>
</div>

<div id="no-dim-note">Dimensions unspecified – schematic model</div>
<div id="project-label">Project: {project.project_meta.project_id} | {project.project_meta.vessel_name}</div>

<script type="importmap">
{{
  "imports": {{
    "three": "https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.164.0/examples/jsm/"
  }}
}}
</script>
<script type="module">
import * as THREE from 'three';
import {{ OrbitControls }} from 'three/addons/controls/OrbitControls.js';
import {{ GLTFLoader }} from 'three/addons/loaders/GLTFLoader.js';

const measureInfo = {json.dumps(measure_info)};
const targetData = {json.dumps(target_data)};
const hasBbox = {'true' if project.visualization_inputs.get_bbox() else 'false'};

if (!hasBbox) document.getElementById('no-dim-note').style.display = 'block';

// Scene setup
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(15, 10, 15);

const renderer = new THREE.WebGLRenderer({{ antialias: true }});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 15, 10);
scene.add(dirLight);
const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
dirLight2.position.set(-10, 5, -10);
scene.add(dirLight2);

// Grid
const grid = new THREE.GridHelper(30, 30, 0x333355, 0x222244);
scene.add(grid);

// Layer management
const measureLayers = {{}};
const layerEnabled = {{}};

for (const [mid, info] of Object.entries(measureInfo)) {{
  measureLayers[mid] = [];
  layerEnabled[mid] = true;
}}

// Load GLB
const loader = new GLTFLoader();
loader.load('hatch_coaming.glb', (gltf) => {{
  const model = gltf.scene;
  scene.add(model);

  model.traverse((child) => {{
    if (child.isMesh) {{
      const name = child.name || '';
      const match = name.match(/_m(\\d+)$/);
      if (match) {{
        const mid = match[1];
        if (measureLayers[mid]) measureLayers[mid].push(child);
      }}

      // Make base geometry clickable
      child.userData.clickable = true;
      const parts = name.split('_m');
      if (parts.length > 1) {{
        child.userData.baseName = parts[0];
      }} else {{
        child.userData.baseName = name;
      }}
    }}
  }});

  // Center camera
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  camera.position.set(center.x + maxDim, center.y + maxDim * 0.7, center.z + maxDim);
  controls.target.copy(center);
  controls.update();
}});

// Legend
const legendContainer = document.getElementById('legend-items');
for (const [mid, info] of Object.entries(measureInfo)) {{
  const item = document.createElement('div');
  item.className = 'legend-item';
  item.innerHTML = `
    <div class="legend-swatch" style="background:${{info.hex}};opacity:0.8"></div>
    <span class="legend-label">${{info.label}}</span>
  `;
  item.addEventListener('click', () => {{
    layerEnabled[mid] = !layerEnabled[mid];
    item.classList.toggle('disabled', !layerEnabled[mid]);
    for (const mesh of (measureLayers[mid] || [])) {{
      mesh.visible = layerEnabled[mid];
    }}
  }});
  legendContainer.appendChild(item);
}}

// Click / raycasting
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

renderer.domElement.addEventListener('click', (event) => {{
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);

  for (const hit of intersects) {{
    if (hit.object.userData.clickable) {{
      const baseName = hit.object.userData.baseName || hit.object.name;
      showInfoPanel(baseName);
      break;
    }}
  }}
}});

function showInfoPanel(meshName) {{
  const panel = document.getElementById('info-panel');
  const title = document.getElementById('info-title');
  const content = document.getElementById('info-content');

  // Map mesh names to member/joint IDs
  const nameMap = {{
    'upper_deck': 'M01',
    'coaming_side_left': 'M02', 'coaming_side_right': 'M02',
    'coaming_side_front': 'M02', 'coaming_side_back': 'M02',
    'coaming_top': 'M03',
  }};

  let targetId = nameMap[meshName];
  if (!targetId) {{
    const jmatch = meshName.match(/joint_(J\\d+)/);
    if (jmatch) targetId = jmatch[1];
  }}

  if (!targetId || !targetData[targetId]) {{
    title.textContent = meshName;
    content.innerHTML = '<p style="color:#888">No measure data for this element.</p>';
    panel.style.display = 'block';
    return;
  }}

  const data = targetData[targetId];
  title.textContent = `${{targetId}} (${{data.type}})`;

  let html = '';
  for (const m of data.measures) {{
    const info = measureInfo[m.measure_id] || {{ label: 'M' + m.measure_id, hex: '#888' }};
    html += `<div class="measure-item">
      <h4 style="color:${{info.hex}}">${{info.label}} [${{m.status}}]</h4>`;
    for (const req of m.requirements) {{
      html += `<p>• ${{req}}</p>`;
    }}
    for (const note of m.notes) {{
      html += `<p style="color:#999;font-style:italic">⟶ ${{note}}</p>`;
    }}
    if (m.rule_basis && m.rule_basis !== '미지정') {{
      html += `<p style="color:#666;font-size:10px">Rule: ${{m.rule_basis}}</p>`;
    }}
    html += '</div>';
  }}

  content.innerHTML = html || '<p style="color:#888">No measures applied.</p>';
  panel.style.display = 'block';
}}

// Resize
window.addEventListener('resize', () => {{
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}});

// Animate
function animate() {{
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}}
animate();
</script>
</body>
</html>"""

    os.makedirs(output_dir, exist_ok=True)
    html_path = os.path.join(output_dir, "viewer.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    logger.info(f"Saved viewer HTML: {html_path}")
    return html_path


def generate_3d_model(
    project: ProjectInput,
    results: DecisionResults,
    output_dir: str,
) -> List[str]:
    """Generate 3D GLB model and viewer HTML."""
    paths = []
    paths.append(generate_glb(project, results, output_dir))
    paths.append(generate_viewer_html(project, results, output_dir))
    return paths
