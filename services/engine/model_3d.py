"""
3D model generator (GLB + viewer.html) for hatch coaming measure visualization.

Uses trimesh to create parametric geometry and exports as GLB.
Generates a three.js HTML viewer with:
  - Measure layer toggle
  - Target click info popup
  - Legend
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from .rules_db import (
    AppliedMeasure,
    DecisionResults,
    HatchOpeningBbox,
    ProjectInput,
    TargetType,
    is_unspecified,
)

logger = logging.getLogger(__name__)

try:
    import trimesh
    _TRIMESH_AVAILABLE = True
except ImportError:
    _TRIMESH_AVAILABLE = False
    trimesh = None  # type: ignore


# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------

def _load_colors(path: str = "configs/colors.json") -> Dict[str, Any]:
    if Path(path).exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _hex_to_rgba(hex_color: str, alpha: float = 0.25) -> List[int]:
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i+2], 16) for i in (0, 2, 4))
    return [r, g, b, int(alpha * 255)]


def _measure_color_rgba(colors: Dict, measure_id: int) -> List[int]:
    key = str(measure_id)
    cfg = colors.get("measures", {}).get(key, {})
    hex_c = cfg.get("hex", "#888888")
    alpha = cfg.get("alpha", 0.25)
    return _hex_to_rgba(hex_c, alpha)


# ---------------------------------------------------------------------------
# Geometry builders
# ---------------------------------------------------------------------------

def _create_box(center: Tuple[float, float, float], size: Tuple[float, float, float]) -> Any:
    """Create a box mesh centered at center with given size."""
    if not _TRIMESH_AVAILABLE:
        return None
    box = trimesh.creation.box(extents=size)
    box.apply_translation(center)
    return box


def _create_line_tube(start: Tuple[float, ...], end: Tuple[float, ...], radius: float = 5.0) -> Any:
    """Create a cylinder (tube) between two points for joint visualization."""
    if not _TRIMESH_AVAILABLE:
        return None

    s = np.array(start, dtype=float)
    e = np.array(end, dtype=float)
    vec = e - s
    length = float(np.linalg.norm(vec))
    if length < 1e-6:
        return None

    cyl = trimesh.creation.cylinder(radius=radius, height=length, sections=12)

    # Align cylinder along vector
    direction = vec / length
    up = np.array([0, 0, 1], dtype=float)
    if abs(np.dot(direction, up)) > 0.999:
        up = np.array([1, 0, 0], dtype=float)

    z_axis = direction
    x_axis = np.cross(up, z_axis)
    x_axis = x_axis / (np.linalg.norm(x_axis) + 1e-12)
    y_axis = np.cross(z_axis, x_axis)

    rot = np.eye(4)
    rot[:3, 0] = x_axis
    rot[:3, 1] = y_axis
    rot[:3, 2] = z_axis
    rot[:3, 3] = (s + e) / 2

    cyl.apply_transform(rot)
    return cyl


# ---------------------------------------------------------------------------
# Build scene
# ---------------------------------------------------------------------------

def _build_scene(
    project: ProjectInput,
    dr: DecisionResults,
    colors: Dict,
) -> Optional[Any]:
    """Build a trimesh Scene with measure-colored layers."""
    if not _TRIMESH_AVAILABLE:
        logger.warning("trimesh not available; skipping 3D model generation")
        return None

    bbox = project.visualization_inputs.hatch_opening_bbox
    if is_unspecified(bbox):
        L, B, H = 1.0, 0.8, 0.2  # normalized
        scale_label = "normalized"
    else:
        L = float(bbox.L) / 1000 if not is_unspecified(bbox.L) else 1.0
        B = float(bbox.B) / 1000 if not is_unspecified(bbox.B) else 0.8
        H = float(bbox.H) / 1000 if not is_unspecified(bbox.H) else 0.2
        scale_label = "meters"

    scene = trimesh.Scene()
    tmap: Dict[str, List[AppliedMeasure]] = {}
    for am in dr.applied_measures:
        tmap.setdefault(am.target_id, [])
        tmap[am.target_id].append(am)

    member_map = {m.member_id: m for m in project.members}
    deck_thick = H * 0.05
    coaming_thick = H * 0.04
    top_thick = H * 0.03

    # --- Member geometry ---
    for m in project.members:
        role = str(m.member_role) if not is_unspecified(m.member_role) else "unknown"

        if role == "upper_deck_plate":
            mesh = _create_box(
                center=(0, 0, -deck_thick / 2),
                size=(L * 1.2, B * 1.2, deck_thick),
            )
        elif role == "hatch_coaming_side_plate":
            mesh = _create_box(
                center=(-L / 2 - coaming_thick / 2, 0, H / 2),
                size=(coaming_thick, B, H),
            )
        elif role == "hatch_coaming_top_plate":
            mesh = _create_box(
                center=(-L / 2 - coaming_thick / 2, 0, H + top_thick / 2),
                size=(coaming_thick + 0.05, B + 0.05, top_thick),
            )
        elif role == "attached_longitudinal":
            mesh = _create_box(
                center=(0, -B / 2 - 0.02, -deck_thick),
                size=(L * 0.3, 0.02, deck_thick * 3),
            )
        else:
            mesh = _create_box(
                center=(L / 2 + 0.05, 0, 0),
                size=(0.05, 0.05, 0.05),
            )

        if mesh is None:
            continue

        measures = tmap.get(m.member_id, [])
        if measures:
            # Apply first measure color as base
            rgba = _measure_color_rgba(colors, measures[0].measure_id)
            mesh.visual.face_colors = rgba
            scene.add_geometry(mesh, node_name=f"member_{m.member_id}_m{measures[0].measure_id}")

            # Add additional measure layers as duplicate meshes with offset
            for i, am in enumerate(measures[1:], 1):
                layer = mesh.copy()
                layer.apply_scale(1.0 + i * 0.01)  # slightly larger for visibility
                rgba = _measure_color_rgba(colors, am.measure_id)
                layer.visual.face_colors = rgba
                scene.add_geometry(layer, node_name=f"member_{m.member_id}_m{am.measure_id}")
        else:
            mesh.visual.face_colors = [200, 200, 200, 128]
            scene.add_geometry(mesh, node_name=f"member_{m.member_id}_base")

    # --- Joint geometry (line tubes) ---
    for j in project.joints:
        jt = str(j.joint_type) if not is_unspecified(j.joint_type) else "other"

        if jt == "block_to_block_butt":
            start = (0, -B / 2 - 0.02, -deck_thick / 2)
            end = (0, B / 2 + 0.02, -deck_thick / 2)
        elif jt == "coaming_to_deck_connection":
            start = (-L / 2 - coaming_thick, -B / 2, 0)
            end = (-L / 2 - coaming_thick, B / 2, 0)
        else:
            start = (0, 0, 0)
            end = (0.05, 0.05, 0.05)

        measures = tmap.get(j.joint_id, [])
        radius = 0.005

        if measures:
            for i, am in enumerate(measures):
                tube = _create_line_tube(start, end, radius=radius + i * 0.003)
                if tube is None:
                    continue
                rgba = _measure_color_rgba(colors, am.measure_id)
                tube.visual.face_colors = rgba
                scene.add_geometry(tube, node_name=f"joint_{j.joint_id}_m{am.measure_id}")
        else:
            tube = _create_line_tube(start, end, radius=radius)
            if tube:
                tube.visual.face_colors = [100, 100, 100, 180]
                scene.add_geometry(tube, node_name=f"joint_{j.joint_id}_base")

    return scene


# ---------------------------------------------------------------------------
# Export GLB
# ---------------------------------------------------------------------------

def _export_glb(scene: Any, output_path: Path) -> str:
    """Export trimesh scene to GLB."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    scene.export(str(output_path), file_type="glb")
    return str(output_path)


# ---------------------------------------------------------------------------
# Generate viewer.html
# ---------------------------------------------------------------------------

def _generate_viewer_html(
    project: ProjectInput,
    dr: DecisionResults,
    colors: Dict,
    glb_path: str,
    output_path: Path,
) -> str:
    """Generate three.js viewer HTML."""
    glb_filename = Path(glb_path).name

    # Build measure info JSON for popup
    target_info: Dict[str, Any] = {}
    for am in dr.applied_measures:
        tid = am.target_id
        if tid not in target_info:
            target_info[tid] = {
                "target_id": tid,
                "target_type": am.target_type.value if hasattr(am.target_type, 'value') else str(am.target_type),
                "measures": [],
            }
        target_info[tid]["measures"].append({
            "measure_id": am.measure_id,
            "status": am.status.value if hasattr(am.status, 'value') else str(am.status),
            "requirements": am.requirements,
            "rule_ref": am.rule_ref,
            "notes": am.notes,
        })

    # Legend data
    measure_colors = colors.get("measures", {})
    legend_items = []
    active = set(am.measure_id for am in dr.applied_measures)
    for mid in sorted(active):
        cfg = measure_colors.get(str(mid), {})
        legend_items.append({
            "id": mid,
            "label": cfg.get("label", f"Measure {mid}"),
            "color": cfg.get("hex", "#888"),
        })

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hatch Coaming 3D Viewer – {dr.project_id}</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #1a1a2e; color: #eee; overflow: hidden; }}
  #canvas-container {{ width: 100vw; height: 100vh; }}
  canvas {{ display: block; }}
  #legend {{
    position: absolute; top: 16px; right: 16px;
    background: rgba(30,30,60,0.92); border-radius: 10px;
    padding: 16px; min-width: 200px; box-shadow: 0 2px 16px rgba(0,0,0,0.4);
  }}
  #legend h3 {{ margin-bottom: 10px; font-size: 14px; color: #aaa; }}
  .legend-item {{
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 6px; cursor: pointer; user-select: none;
  }}
  .legend-swatch {{ width: 16px; height: 16px; border-radius: 3px; border: 1px solid #555; }}
  .legend-label {{ font-size: 12px; }}
  .legend-item.disabled .legend-label {{ text-decoration: line-through; opacity: 0.4; }}
  .legend-item.disabled .legend-swatch {{ opacity: 0.3; }}
  #popup {{
    display: none; position: absolute; bottom: 20px; left: 20px;
    background: rgba(30,30,60,0.95); border-radius: 10px;
    padding: 16px; max-width: 420px; max-height: 60vh; overflow-y: auto;
    box-shadow: 0 2px 16px rgba(0,0,0,0.5); font-size: 12px;
  }}
  #popup h3 {{ color: #4fc3f7; margin-bottom: 8px; }}
  #popup .measure-block {{ margin-bottom: 10px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 6px; }}
  #popup .measure-block h4 {{ color: #ffb74d; }}
  #popup .req {{ margin: 4px 0; padding-left: 10px; border-left: 2px solid #666; }}
  #popup .close-btn {{
    position: absolute; top: 8px; right: 12px; cursor: pointer;
    font-size: 18px; color: #888;
  }}
  #popup .close-btn:hover {{ color: #fff; }}
  #info-bar {{
    position: absolute; bottom: 0; left: 0; right: 0;
    background: rgba(30,30,60,0.85); padding: 8px 16px;
    font-size: 11px; color: #888; text-align: center;
  }}
</style>
</head>
<body>
<div id="canvas-container"></div>
<div id="legend">
  <h3>Measure Legend</h3>
  <div id="legend-items"></div>
</div>
<div id="popup">
  <span class="close-btn" onclick="document.getElementById('popup').style.display='none'">&times;</span>
  <div id="popup-content"></div>
</div>
<div id="info-bar">
  Project: {dr.project_id} | t_control: {dr.control_values.t_control_mm} mm |
  y_control: {dr.control_values.y_control_nmm2} N/mm² |
  Global measures: {dr.control_values.required_measures_global} |
  Click on objects for measure details
</div>

<script type="importmap">
{{
  "imports": {{
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }}
}}
</script>
<script type="module">
import * as THREE from 'three';
import {{ OrbitControls }} from 'three/addons/controls/OrbitControls.js';
import {{ GLTFLoader }} from 'three/addons/loaders/GLTFLoader.js';

const targetInfo = {json.dumps(target_info, ensure_ascii=False)};
const legendData = {json.dumps(legend_items, ensure_ascii=False)};

// Scene setup
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(2, 1.5, 2);

const renderer = new THREE.WebGLRenderer({{ antialias: true }});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 5, 5);
scene.add(dirLight);

// Grid
const grid = new THREE.GridHelper(4, 20, 0x444444, 0x333333);
scene.add(grid);

// Layer visibility
const measureVisibility = {{}};
legendData.forEach(item => {{ measureVisibility[item.id] = true; }});

// Load GLB
const loader = new GLTFLoader();
let loadedScene = null;
loader.load('{glb_filename}', (gltf) => {{
  loadedScene = gltf.scene;
  scene.add(gltf.scene);

  // Center the model
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const center = box.getCenter(new THREE.Vector3());
  controls.target.copy(center);
  camera.lookAt(center);
}}, undefined, (error) => {{
  console.warn('GLB load error:', error);
  // Add placeholder geometry
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.8, 0.2),
    new THREE.MeshStandardMaterial({{ color: 0x888888, transparent: true, opacity: 0.5 }})
  );
  scene.add(box);
}});

// Legend
const legendContainer = document.getElementById('legend-items');
legendData.forEach(item => {{
  const div = document.createElement('div');
  div.className = 'legend-item';
  div.innerHTML = `<div class="legend-swatch" style="background:${{item.color}}"></div><span class="legend-label">${{item.label}}</span>`;
  div.addEventListener('click', () => {{
    measureVisibility[item.id] = !measureVisibility[item.id];
    div.classList.toggle('disabled');
    updateVisibility();
  }});
  legendContainer.appendChild(div);
}});

function updateVisibility() {{
  if (!loadedScene) return;
  loadedScene.traverse((child) => {{
    if (child.isMesh) {{
      const name = child.name || child.parent?.name || '';
      const match = name.match(/_m(\\d+)$/);
      if (match) {{
        const mid = parseInt(match[1]);
        child.visible = measureVisibility[mid] !== false;
      }}
    }}
  }});
}}

// Raycaster for click
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

renderer.domElement.addEventListener('click', (event) => {{
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  if (!loadedScene) return;
  const intersects = raycaster.intersectObjects(loadedScene.children, true);
  if (intersects.length > 0) {{
    const obj = intersects[0].object;
    const name = obj.name || obj.parent?.name || '';

    // Extract target ID
    let targetId = null;
    const memberMatch = name.match(/^(member|joint)_([^_]+)/);
    if (memberMatch) targetId = memberMatch[2];

    if (targetId && targetInfo[targetId]) {{
      showPopup(targetInfo[targetId]);
    }}
  }}
}});

function showPopup(info) {{
  const popup = document.getElementById('popup');
  const content = document.getElementById('popup-content');
  let html = `<h3>${{info.target_type}}: ${{info.target_id}}</h3>`;
  info.measures.forEach(m => {{
    html += `<div class="measure-block">`;
    html += `<h4>Measure ${{m.measure_id}} (${{m.status}})</h4>`;
    m.requirements.forEach(r => {{
      html += `<div class="req">${{r}}</div>`;
    }});
    if (m.rule_ref && m.rule_ref !== '미지정') {{
      html += `<div style="margin-top:4px;color:#aaa;font-size:11px">Ref: ${{m.rule_ref.substring(0,120)}}...</div>`;
    }}
    if (m.notes && m.notes.length > 0) {{
      html += `<div style="margin-top:4px;color:#ff8;font-size:11px">Notes: ${{m.notes.join('; ')}}</div>`;
    }}
    html += `</div>`;
  }});
  content.innerHTML = html;
  popup.style.display = 'block';
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

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    return str(output_path)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_3d_model(
    project: ProjectInput,
    dr: DecisionResults,
    output_dir: str = "outputs/demo",
    colors_path: str = "configs/colors.json",
) -> Dict[str, str]:
    """Generate 3D GLB model and viewer HTML. Returns paths dict."""
    colors = _load_colors(colors_path)
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    paths: Dict[str, str] = {}

    scene = _build_scene(project, dr, colors)
    if scene is not None:
        glb_path = out / "hatch_coaming.glb"
        _export_glb(scene, glb_path)
        paths["glb"] = str(glb_path)
        logger.info("GLB saved: %s", glb_path)

        viewer_path = out / "viewer.html"
        _generate_viewer_html(project, dr, colors, str(glb_path), viewer_path)
        paths["viewer_html"] = str(viewer_path)
        logger.info("Viewer HTML saved: %s", viewer_path)
    else:
        # Generate viewer with placeholder even without GLB
        viewer_path = out / "viewer.html"
        _generate_viewer_html(project, dr, colors, "hatch_coaming.glb", viewer_path)
        paths["viewer_html"] = str(viewer_path)
        logger.info("Viewer HTML saved (no GLB): %s", viewer_path)

    return paths
