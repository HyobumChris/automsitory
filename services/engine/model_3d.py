"""3D GLB generator + Three.js viewer for cumulative measure layers."""

from __future__ import annotations

import json
import struct
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .rules_db import DecisionResults, ProjectInput, RulesExtraction, TargetDecision, UNSPECIFIED


DEFAULT_COLORS: Dict[int, Dict[str, Any]] = {
    1: {"hex": "#FF8C00", "alpha": 0.25},
    2: {"hex": "#1E90FF", "alpha": 0.25},
    3: {"hex": "#DC143C", "alpha": 0.25},
    4: {"hex": "#2E8B57", "alpha": 0.25},
    5: {"hex": "#8A2BE2", "alpha": 0.25},
    0: {"hex": "#666666", "alpha": 0.25},
}


def _load_colors(path: Optional[str]) -> Dict[int, Dict[str, Any]]:
    colors = dict(DEFAULT_COLORS)
    if not path:
        return colors
    p = Path(path)
    if not p.is_file():
        return colors
    payload = json.loads(p.read_text(encoding="utf-8"))
    for key, value in payload.items():
        try:
            k = int(key)
        except Exception:
            continue
        if isinstance(value, dict):
            colors[k] = {
                "hex": value.get("hex", colors.get(k, {}).get("hex", "#888888")),
                "alpha": value.get("alpha", colors.get(k, {}).get("alpha", 0.25)),
            }
    return colors


def _hex_rgb(hex_value: str) -> List[float]:
    h = hex_value.lstrip("#")
    if len(h) != 6:
        h = "888888"
    return [int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]


def _f32(values: List[float]) -> bytes:
    return struct.pack(f"<{len(values)}f", *values)


def _u16(values: List[int]) -> bytes:
    return struct.pack(f"<{len(values)}H", *values)


def _box(cx: float, cy: float, cz: float, sx: float, sy: float, sz: float) -> Tuple[List[float], List[int]]:
    hx, hy, hz = sx / 2.0, sy / 2.0, sz / 2.0
    vertices = [
        cx - hx, cy - hy, cz - hz,
        cx + hx, cy - hy, cz - hz,
        cx + hx, cy + hy, cz - hz,
        cx - hx, cy + hy, cz - hz,
        cx - hx, cy - hy, cz + hz,
        cx + hx, cy - hy, cz + hz,
        cx + hx, cy + hy, cz + hz,
        cx - hx, cy + hy, cz + hz,
    ]
    indices = [
        0, 1, 2, 0, 2, 3,
        4, 6, 5, 4, 7, 6,
        0, 4, 5, 0, 5, 1,
        2, 6, 7, 2, 7, 3,
        0, 3, 7, 0, 7, 4,
        1, 5, 6, 1, 6, 2,
    ]
    return vertices, indices


def _resolve_bbox(project_input: ProjectInput) -> Tuple[float, float, float, bool]:
    bbox = project_input.visualization_inputs.hatch_opening_bbox
    if isinstance(bbox, str) and bbox == UNSPECIFIED:
        return 10000.0, 8000.0, 2000.0, True
    return float(bbox.L), float(bbox.B), float(bbox.H), False  # type: ignore[union-attr]


def _target_map(decision: DecisionResults) -> Dict[str, TargetDecision]:
    result: Dict[str, TargetDecision] = {}
    for target in [*decision.members, *decision.joints]:
        result[target.target_id] = target
    return result


def _build_glb_binary(
    meshes: List[Dict[str, Any]],
) -> bytes:
    buffer_parts: List[bytes] = []
    accessors: List[Dict[str, Any]] = []
    buffer_views: List[Dict[str, Any]] = []
    materials: List[Dict[str, Any]] = []
    mesh_defs: List[Dict[str, Any]] = []
    nodes: List[Dict[str, Any]] = []

    offset = 0
    for mesh_idx, mesh in enumerate(meshes):
        positions = mesh["positions"]
        indices = mesh["indices"]
        rgba = mesh["rgba"]
        name = mesh["name"]

        materials.append(
            {
                "name": f"mat_{name}",
                "pbrMetallicRoughness": {
                    "baseColorFactor": rgba,
                    "metallicFactor": 0.05,
                    "roughnessFactor": 0.85,
                },
                "alphaMode": "BLEND" if rgba[3] < 0.99 else "OPAQUE",
            }
        )

        idx_bytes = _u16(indices)
        pad = (4 - len(idx_bytes) % 4) % 4
        idx_bytes += b"\x00" * pad
        buffer_views.append(
            {
                "buffer": 0,
                "byteOffset": offset,
                "byteLength": len(indices) * 2,
                "target": 34963,
            }
        )
        accessors.append(
            {
                "bufferView": len(buffer_views) - 1,
                "componentType": 5123,
                "count": len(indices),
                "type": "SCALAR",
                "max": [max(indices)],
                "min": [min(indices)],
            }
        )
        idx_accessor = len(accessors) - 1
        buffer_parts.append(idx_bytes)
        offset += len(idx_bytes)

        pos_bytes = _f32(positions)
        pad = (4 - len(pos_bytes) % 4) % 4
        pos_bytes += b"\x00" * pad
        xs = positions[0::3]
        ys = positions[1::3]
        zs = positions[2::3]
        buffer_views.append(
            {
                "buffer": 0,
                "byteOffset": offset,
                "byteLength": len(positions) * 4,
                "target": 34962,
            }
        )
        accessors.append(
            {
                "bufferView": len(buffer_views) - 1,
                "componentType": 5126,
                "count": len(positions) // 3,
                "type": "VEC3",
                "min": [min(xs), min(ys), min(zs)],
                "max": [max(xs), max(ys), max(zs)],
            }
        )
        pos_accessor = len(accessors) - 1
        buffer_parts.append(pos_bytes)
        offset += len(pos_bytes)

        mesh_defs.append(
            {
                "name": name,
                "primitives": [
                    {"attributes": {"POSITION": pos_accessor}, "indices": idx_accessor, "material": mesh_idx}
                ],
            }
        )
        nodes.append({"mesh": mesh_idx, "name": name})

    buffer_data = b"".join(buffer_parts)
    pad = (4 - len(buffer_data) % 4) % 4
    buffer_data += b"\x00" * pad

    gltf = {
        "asset": {"version": "2.0", "generator": "services.engine.model_3d"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": mesh_defs,
        "materials": materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(buffer_data)}],
    }

    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    pad = (4 - len(json_bytes) % 4) % 4
    json_bytes += b" " * pad

    total = 12 + 8 + len(json_bytes) + 8 + len(buffer_data)
    header = struct.pack("<III", 0x46546C67, 2, total)
    chunk_json = struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    chunk_bin = struct.pack("<II", len(buffer_data), 0x004E4942) + buffer_data
    return header + chunk_json + chunk_bin


def _build_meshes(
    project_input: ProjectInput,
    decision: DecisionResults,
    colors: Dict[int, Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    L, B, H, schematic = _resolve_bbox(project_input)
    # convert mm -> m for display scaling
    s = 0.001
    Lm, Bm, Hm = L * s, B * s, H * s
    deck_t = 0.03
    side_t = 0.025
    top_t = 0.02

    meshes: List[Dict[str, Any]] = []
    meta: Dict[str, Any] = {"mesh_to_target": {}, "target_to_measures": {}, "schematic": schematic}

    # base meshes
    base_definitions = [
        ("base_upper_deck", _box(0.0, -deck_t / 2.0, 0.0, Lm, deck_t, Bm), [0.75, 0.8, 0.85, 1.0]),
        (
            "base_side_port",
            _box(0.0, Hm / 2.0, -(Bm / 2 + side_t / 2), Lm, Hm, side_t),
            [0.92, 0.78, 0.78, 1.0],
        ),
        (
            "base_side_starboard",
            _box(0.0, Hm / 2.0, (Bm / 2 + side_t / 2), Lm, Hm, side_t),
            [0.92, 0.78, 0.78, 1.0],
        ),
        ("base_top", _box(0.0, Hm + top_t / 2.0, 0.0, Lm, top_t, Bm + 2 * side_t), [0.95, 0.88, 0.75, 1.0]),
    ]
    for name, mesh_data, rgba in base_definitions:
        pos, idx = mesh_data
        meshes.append({"name": name, "positions": pos, "indices": idx, "rgba": rgba})

    target_map = _target_map(decision)
    member_by_id = {m.member_id: m for m in project_input.members}

    # member layers
    for target_id, target in target_map.items():
        if target.target_type != "member":
            continue
        member = member_by_id.get(target_id)
        if member is None:
            continue
        meta["target_to_measures"].setdefault(target_id, [])
        for layer_idx, applied in enumerate(target.applied_measures):
            color = colors.get(applied.measure_id, {"hex": "#888888", "alpha": 0.25})
            rgb = _hex_rgb(color["hex"])
            alpha = max(0.12, float(color["alpha"]) - 0.03 * layer_idx)
            inflate = 0.002 + layer_idx * 0.001
            if member.member_role == "upper_deck_plate":
                pos, idx = _box(0.0, -deck_t / 2.0, 0.0, Lm + inflate, deck_t + inflate, Bm + inflate)
            elif member.member_role == "hatch_coaming_side_plate":
                # two walls -> two meshes for clearer layer visibility
                pos, idx = _box(
                    0.0,
                    Hm / 2.0,
                    -(Bm / 2 + side_t / 2),
                    Lm + inflate,
                    Hm + inflate,
                    side_t + inflate,
                )
                name = f"m{applied.measure_id}_member_{target_id}_port_l{layer_idx}"
                meshes.append({"name": name, "positions": pos, "indices": idx, "rgba": rgb + [alpha]})
                meta["mesh_to_target"][name] = {"target_id": target_id, "measure_id": applied.measure_id}

                pos, idx = _box(
                    0.0,
                    Hm / 2.0,
                    (Bm / 2 + side_t / 2),
                    Lm + inflate,
                    Hm + inflate,
                    side_t + inflate,
                )
            elif member.member_role == "hatch_coaming_top_plate":
                pos, idx = _box(
                    0.0,
                    Hm + top_t / 2.0,
                    0.0,
                    Lm + inflate,
                    top_t + inflate,
                    Bm + 2 * side_t + inflate,
                )
            else:
                pos, idx = _box(0.0, -deck_t / 2.0, 0.0, Lm * 0.1, deck_t, Bm * 0.1)

            name = f"m{applied.measure_id}_member_{target_id}_l{layer_idx}"
            meshes.append({"name": name, "positions": pos, "indices": idx, "rgba": rgb + [alpha]})
            meta["mesh_to_target"][name] = {"target_id": target_id, "measure_id": applied.measure_id}
            meta["target_to_measures"][target_id].append(applied.model_dump(mode="json"))

    # joint layers as thin bars/cubes
    joint_by_id = {j.joint_id: j for j in project_input.joints}
    joint_count = max(1, len(project_input.joints))
    for idx_joint, (target_id, target) in enumerate(sorted(target_map.items())):
        if target.target_type != "joint":
            continue
        joint = joint_by_id.get(target_id)
        if joint is None:
            continue
        x = -Lm / 2 + (idx_joint + 1) * Lm / (joint_count + 1)
        meta["target_to_measures"].setdefault(target_id, [])
        for layer_idx, applied in enumerate(target.applied_measures):
            color = colors.get(applied.measure_id, {"hex": "#666666", "alpha": 0.25})
            rgb = _hex_rgb(color["hex"])
            alpha = max(0.12, float(color["alpha"]) - 0.03 * layer_idx)
            if joint.joint_type == "block_to_block_butt":
                pos, idx = _box(x, Hm / 2, 0.0, 0.018 + layer_idx * 0.003, Hm + 0.03, Bm + 0.09)
            else:
                pos, idx = _box(
                    x,
                    0.0,
                    Bm / 2 + side_t / 2,
                    0.05 + layer_idx * 0.005,
                    0.05 + layer_idx * 0.005,
                    0.05 + layer_idx * 0.005,
                )
            name = f"m{applied.measure_id}_joint_{target_id}_l{layer_idx}"
            meshes.append({"name": name, "positions": pos, "indices": idx, "rgba": rgb + [alpha]})
            meta["mesh_to_target"][name] = {"target_id": target_id, "measure_id": applied.measure_id}
            meta["target_to_measures"][target_id].append(applied.model_dump(mode="json"))

    return meshes, meta


def _build_viewer_html(meta: Dict[str, Any], rules: RulesExtraction, colors: Dict[int, Dict[str, Any]]) -> str:
    evidence_paths = {
        key: value.snippet_path
        for key, value in rules.evidence.items()
        if value.snippet_path != UNSPECIFIED
    }
    measure_labels: Dict[str, str] = {}
    for target_measures in meta.get("target_to_measures", {}).values():
        for item in target_measures:
            mid = str(item["measure_id"])
            measure_labels.setdefault(mid, item["measure_name"])

    data = {
        "measureLabels": measure_labels,
        "meta": meta,
        "evidencePaths": evidence_paths,
        "colors": {str(k): v["hex"] for k, v in colors.items()},
    }

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>LR Hatch Coaming 3D Viewer</title>
  <style>
    body {{ margin: 0; overflow: hidden; font-family: Arial, sans-serif; }}
    #panel {{
      position: fixed; left: 0; top: 0; width: 320px; height: 100vh;
      overflow-y: auto; background: rgba(20, 25, 38, 0.95); color: #eee;
      border-right: 1px solid #3c4b5a; padding: 12px; z-index: 10;
    }}
    #canvas {{ width: 100vw; height: 100vh; }}
    .row {{ display: flex; align-items: center; gap: 6px; padding: 6px 0; }}
    .dot {{ width: 12px; height: 12px; border-radius: 50%; border: 1px solid #222; }}
    #detail {{
      position: fixed; right: 10px; top: 10px; width: 360px; max-height: 80vh;
      overflow-y: auto; background: rgba(20, 25, 38, 0.95); color: #eee;
      border: 1px solid #3c4b5a; border-radius: 8px; padding: 10px; display: none; z-index: 11;
    }}
    #detail img {{ max-width: 100%; margin-top: 6px; border: 1px solid #444; }}
    code {{ white-space: pre-wrap; display: block; font-size: 11px; }}
  </style>
</head>
<body>
  <div id="panel">
    <h3>Cumulative Measure Layers</h3>
    <div id="legend"></div>
    <p style="font-size:12px;color:#9fb5ca">
      Tip: click mesh to inspect target + rule evidence.
    </p>
  </div>
  <div id="detail"></div>
  <div id="canvas"></div>

  <script type="importmap">
  {{
    "imports": {{
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
    }}
  }}
  </script>
  <script type="module">
    import * as THREE from "three";
    import {{ OrbitControls }} from "three/addons/controls/OrbitControls.js";
    import {{ GLTFLoader }} from "three/addons/loaders/GLTFLoader.js";

    const DATA = {json.dumps(data, ensure_ascii=False)};
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1722);

    const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(14, 10, 14);

    const renderer = new THREE.WebGLRenderer({{ antialias: true }});
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById("canvas").appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xffffff, 0.7);
    sun.position.set(18, 24, 10);
    scene.add(sun);
    scene.add(new THREE.GridHelper(30, 30, 0x334155, 0x1f2937));

    const legend = document.getElementById("legend");
    const detail = document.getElementById("detail");
    const meshByMeasure = {{}};

    function renderLegend() {{
      const ids = Object.keys(DATA.measureLabels).sort((a, b) => Number(a) - Number(b));
      for (const id of ids) {{
        const row = document.createElement("div");
        row.className = "row";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = true;
        cb.addEventListener("change", () => {{
          const list = meshByMeasure[id] || [];
          list.forEach((m) => (m.visible = cb.checked));
        }});
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.style.background = DATA.colors[id] || "#888";
        const txt = document.createElement("span");
        txt.textContent = `M${{id}}: ${{DATA.measureLabels[id]}}`;
        row.appendChild(cb);
        row.appendChild(dot);
        row.appendChild(txt);
        legend.appendChild(row);
      }}
    }}

    function showDetail(meshName) {{
      const mapping = DATA.meta.mesh_to_target[meshName];
      if (!mapping) return;
      const targetId = mapping.target_id;
      const measures = DATA.meta.target_to_measures[targetId] || [];
      let html = `<h4>${{targetId}}</h4><code>${{JSON.stringify(measures, null, 2)}}</code>`;
      const snippetCandidates = [];
      for (const m of measures) {{
        for (const ev of (m.evidence_keys || [])) {{
          if (DATA.evidencePaths[ev]) snippetCandidates.push(DATA.evidencePaths[ev]);
        }}
      }}
      const uniqueSnippets = [...new Set(snippetCandidates)].slice(0, 3);
      for (const p of uniqueSnippets) {{
        html += `<img src="./${{p}}" alt="evidence snippet" />`;
      }}
      detail.innerHTML = html;
      detail.style.display = "block";
    }}

    const loader = new GLTFLoader();
    loader.load("./hatch_coaming.glb", (gltf) => {{
      scene.add(gltf.scene);
      gltf.scene.traverse((obj) => {{
        if (!obj.isMesh || !obj.name) return;
        const m = obj.name.match(/^m(\\d+)_/);
        if (m) {{
          const id = m[1];
          if (!meshByMeasure[id]) meshByMeasure[id] = [];
          meshByMeasure[id].push(obj);
        }}
      }});
      renderLegend();
    }});

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    renderer.domElement.addEventListener("click", (event) => {{
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      if (hits.length > 0 && hits[0].object.name) {{
        showDetail(hits[0].object.name);
      }}
    }});

    window.addEventListener("resize", () => {{
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }});

    function animate() {{
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }}
    animate();
  </script>
</body>
</html>
"""


def write_3d_outputs(
    project_input: ProjectInput,
    decision: DecisionResults,
    rules: RulesExtraction,
    output_dir: str,
    colors_config_path: Optional[str],
) -> Dict[str, str]:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    model_dir = out / "model3d"
    model_dir.mkdir(parents=True, exist_ok=True)

    colors = _load_colors(colors_config_path)
    meshes, meta = _build_meshes(project_input, decision, colors)
    glb_bytes = _build_glb_binary(meshes)
    viewer = _build_viewer_html(meta, rules, colors)

    # Required explicit names in output root:
    glb_root = out / "hatch_coaming.glb"
    viewer_root = out / "viewer.html"
    glb_root.write_bytes(glb_bytes)
    viewer_root.write_text(viewer, encoding="utf-8")

    # Mirror under model3d/ for convenience
    glb_sub = model_dir / "hatch_coaming.glb"
    viewer_sub = model_dir / "viewer.html"
    glb_sub.write_bytes(glb_bytes)
    viewer_sub.write_text(viewer, encoding="utf-8")

    return {
        "hatch_coaming_glb": str(glb_root),
        "viewer_html": str(viewer_root),
        "hatch_coaming_glb_model3d": str(glb_sub),
        "viewer_html_model3d": str(viewer_sub),
    }

