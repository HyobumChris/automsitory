"""3D model (.glb) and three.js viewer generation."""

from __future__ import annotations

import json
import struct
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .models import (
    AppliedMeasure,
    DecisionResults,
    JointInput,
    JointType,
    MemberInput,
    MemberRole,
    ProjectInput,
)
from .rules_db import RulesExtractionDB


def _hex_to_rgb(hex_code: str) -> List[float]:
    value = hex_code.lstrip("#")
    return [int(value[idx : idx + 2], 16) / 255.0 for idx in (0, 2, 4)]


def _box(cx: float, cy: float, cz: float, sx: float, sy: float, sz: float) -> Tuple[List[float], List[int]]:
    hx, hy, hz = sx / 2.0, sy / 2.0, sz / 2.0
    vertices = [
        cx - hx,
        cy - hy,
        cz - hz,
        cx + hx,
        cy - hy,
        cz - hz,
        cx + hx,
        cy + hy,
        cz - hz,
        cx - hx,
        cy + hy,
        cz - hz,
        cx - hx,
        cy - hy,
        cz + hz,
        cx + hx,
        cy - hy,
        cz + hz,
        cx + hx,
        cy + hy,
        cz + hz,
        cx - hx,
        cy + hy,
        cz + hz,
    ]
    indices = [
        0,
        1,
        2,
        0,
        2,
        3,
        4,
        6,
        5,
        4,
        7,
        6,
        0,
        4,
        5,
        0,
        5,
        1,
        2,
        6,
        7,
        2,
        7,
        3,
        0,
        3,
        7,
        0,
        7,
        4,
        1,
        5,
        6,
        1,
        6,
        2,
    ]
    return vertices, indices


def _pack_f32(values: List[float]) -> bytes:
    return struct.pack(f"<{len(values)}f", *values)


def _pack_u16(values: List[int]) -> bytes:
    return struct.pack(f"<{len(values)}H", *values)


def _geometry_specs(
    project_input: ProjectInput,
    decision: DecisionResults,
    colors: Dict[int, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    bbox = project_input.visualization_inputs.hatch_opening_bbox
    if isinstance(bbox, str):
        L, B, H = 10000.0, 8000.0, 2000.0
    else:
        L, B, H = float(bbox.L), float(bbox.B), float(bbox.H)

    # meters
    Lm, Bm, Hm = L / 1000.0, B / 1000.0, H / 1000.0
    deck_t = 0.03
    side_t = 0.03
    top_t = 0.02

    target_measures: Dict[str, List[AppliedMeasure]] = {}
    for app in decision.applications:
        key = f"{app.target_type.value}:{app.target_id}"
        target_measures.setdefault(key, []).append(app)

    specs: List[Dict[str, Any]] = []
    specs.append(
        {
            "name": "base_member_upper_deck",
            "rgba": [0.76, 0.82, 0.90, 1.0],
            "box": _box(0, -deck_t / 2, 0, Lm, deck_t, Bm),
        }
    )
    specs.append(
        {
            "name": "base_member_coaming_left",
            "rgba": [0.88, 0.70, 0.70, 1.0],
            "box": _box(0, Hm / 2, -(Bm / 2 + side_t / 2), Lm, Hm, side_t),
        }
    )
    specs.append(
        {
            "name": "base_member_coaming_right",
            "rgba": [0.88, 0.70, 0.70, 1.0],
            "box": _box(0, Hm / 2, (Bm / 2 + side_t / 2), Lm, Hm, side_t),
        }
    )
    specs.append(
        {
            "name": "base_member_coaming_top",
            "rgba": [0.95, 0.85, 0.62, 1.0],
            "box": _box(0, Hm + top_t / 2, 0, Lm, top_t, Bm + 2 * side_t),
        }
    )

    # Layered overlays for members
    for member in project_input.members:
        key = f"member:{member.member_id}"
        apps = sorted(target_measures.get(key, []), key=lambda item: item.measure_id)
        for idx, app in enumerate(apps):
            color = colors.get(app.measure_id, {"hex": "#777777", "alpha": 0.25})
            rgba = _hex_to_rgb(color["hex"]) + [max(0.12, float(color["alpha"]) - idx * 0.04)]
            grow = 0.003 * (idx + 1)
            if member.member_role == MemberRole.upper_deck_plate:
                box = _box(0, -deck_t / 2, 0, Lm + grow, deck_t + grow, Bm + grow)
            elif member.member_role == MemberRole.hatch_coaming_side_plate:
                # Two side walls share one member role; create left and right overlays.
                specs.append(
                    {
                        "name": f"m{app.measure_id}_member_{member.member_id}_left_{idx}",
                        "rgba": rgba,
                        "box": _box(0, Hm / 2, -(Bm / 2 + side_t / 2), Lm + grow, Hm + grow, side_t + grow),
                    }
                )
                box = _box(0, Hm / 2, (Bm / 2 + side_t / 2), Lm + grow, Hm + grow, side_t + grow)
            elif member.member_role == MemberRole.hatch_coaming_top_plate:
                box = _box(0, Hm + top_t / 2, 0, Lm + grow, top_t + grow, Bm + 2 * side_t + grow)
            else:
                continue
            specs.append(
                {
                    "name": f"m{app.measure_id}_member_{member.member_id}_{idx}",
                    "rgba": rgba,
                    "box": box,
                }
            )

    # Joint overlays as thin boxes/tubes.
    joint_count = max(1, len(project_input.joints))
    for idx, joint in enumerate(project_input.joints):
        key = f"joint:{joint.joint_id}"
        apps = sorted(target_measures.get(key, []), key=lambda item: item.measure_id)
        xj = -Lm / 2 + (idx + 1) * Lm / (joint_count + 1)
        for layer, app in enumerate(apps):
            color = colors.get(app.measure_id, {"hex": "#777777", "alpha": 0.25})
            rgba = _hex_to_rgb(color["hex"]) + [max(0.14, float(color["alpha"]) - layer * 0.04)]
            thick = 0.015 + layer * 0.004
            if joint.joint_type == JointType.block_to_block_butt:
                box = _box(xj, Hm / 2, 0, thick, Hm + 0.08, Bm + 0.08)
            elif joint.joint_type == JointType.coaming_to_deck_connection:
                specs.append(
                    {
                        "name": f"m{app.measure_id}_joint_{joint.joint_id}_left_{layer}",
                        "rgba": rgba,
                        "box": _box(0, 0.02, -(Bm / 2 + side_t / 2), Lm, thick, thick),
                    }
                )
                box = _box(0, 0.02, (Bm / 2 + side_t / 2), Lm, thick, thick)
            else:
                box = _box(xj, 0.05, 0, thick, 0.1, Bm * 0.35)

            specs.append(
                {
                    "name": f"m{app.measure_id}_joint_{joint.joint_id}_{layer}",
                    "rgba": rgba,
                    "box": box,
                }
            )
    return specs


def _build_glb(specs: List[Dict[str, Any]]) -> bytes:
    buffer_views: List[Dict[str, Any]] = []
    accessors: List[Dict[str, Any]] = []
    materials: List[Dict[str, Any]] = []
    meshes: List[Dict[str, Any]] = []
    nodes: List[Dict[str, Any]] = []
    chunks: List[bytes] = []
    offset = 0

    for idx, spec in enumerate(specs):
        vertices, indices = spec["box"]
        rgba = spec["rgba"]
        materials.append(
            {
                "name": f"mat_{spec['name']}",
                "pbrMetallicRoughness": {
                    "baseColorFactor": rgba,
                    "metallicFactor": 0.05,
                    "roughnessFactor": 0.85,
                },
                "alphaMode": "BLEND" if rgba[3] < 1.0 else "OPAQUE",
                "doubleSided": True,
            }
        )

        idx_bytes = _pack_u16(indices)
        idx_padding = (4 - (len(idx_bytes) % 4)) % 4
        idx_bytes += b"\x00" * idx_padding
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
        chunks.append(idx_bytes)
        offset += len(idx_bytes)

        v_bytes = _pack_f32(vertices)
        v_padding = (4 - (len(v_bytes) % 4)) % 4
        v_bytes += b"\x00" * v_padding
        xs = vertices[0::3]
        ys = vertices[1::3]
        zs = vertices[2::3]
        buffer_views.append(
            {
                "buffer": 0,
                "byteOffset": offset,
                "byteLength": len(vertices) * 4,
                "target": 34962,
            }
        )
        accessors.append(
            {
                "bufferView": len(buffer_views) - 1,
                "componentType": 5126,
                "count": len(vertices) // 3,
                "type": "VEC3",
                "max": [max(xs), max(ys), max(zs)],
                "min": [min(xs), min(ys), min(zs)],
            }
        )
        pos_accessor = len(accessors) - 1
        chunks.append(v_bytes)
        offset += len(v_bytes)

        meshes.append(
            {
                "name": spec["name"],
                "primitives": [
                    {
                        "attributes": {"POSITION": pos_accessor},
                        "indices": idx_accessor,
                        "material": idx,
                    }
                ],
            }
        )
        nodes.append({"name": spec["name"], "mesh": idx})

    binary_blob = b"".join(chunks)
    gltf = {
        "asset": {"version": "2.0", "generator": "services.engine.model_3d"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(binary_blob)}],
    }
    json_blob = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_blob += b" " * ((4 - len(json_blob) % 4) % 4)
    binary_blob += b"\x00" * ((4 - len(binary_blob) % 4) % 4)

    total_length = 12 + 8 + len(json_blob) + 8 + len(binary_blob)
    header = struct.pack("<III", 0x46546C67, 2, total_length)
    json_chunk = struct.pack("<II", len(json_blob), 0x4E4F534A) + json_blob
    bin_chunk = struct.pack("<II", len(binary_blob), 0x004E4942) + binary_blob
    return header + json_chunk + bin_chunk


def _relative_path(viewer_path: Path, absolute_path: str) -> str:
    try:
        return str(Path(absolute_path).resolve().relative_to(viewer_path.parent.resolve()))
    except Exception:
        try:
            return str(Path(absolute_path).resolve().relative_to(viewer_path.resolve().parents[1]))
        except Exception:
            return absolute_path


def _viewer_html(
    project_input: ProjectInput,
    decision: DecisionResults,
    rules_db: RulesExtractionDB,
    colors: Dict[int, Dict[str, Any]],
    viewer_path: Path,
) -> str:
    measure_labels: Dict[str, str] = {}
    target_index: Dict[str, List[Dict[str, Any]]] = {}
    for app in decision.applications:
        measure_labels[str(app.measure_id)] = app.measure_name
        key = f"{app.target_type.value}:{app.target_id}"
        target_index.setdefault(key, []).append(app.model_dump())

    evidence_index: Dict[str, Dict[str, Any]] = {}
    for ev_id, evidence in rules_db.evidence.items():
        payload = evidence.model_dump()
        snippet_path = payload.get("snippet_path", "")
        if snippet_path:
            payload["snippet_path"] = _relative_path(viewer_path, snippet_path)
        evidence_index[ev_id] = payload

    bbox = project_input.visualization_inputs.hatch_opening_bbox
    dim_message = "치수 미지정" if isinstance(bbox, str) else ""

    data = {
        "measureLabels": measure_labels,
        "targetIndex": target_index,
        "evidenceIndex": evidence_index,
        "colors": {str(mid): color["hex"] for mid, color in colors.items()},
        "dimMessage": dim_message,
    }

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>hatch coaming 3D viewer</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: Arial, sans-serif; background: #121726; color: #e6eaf2; overflow: hidden; }}
    #root {{ display: grid; grid-template-columns: 320px 1fr; height: 100vh; }}
    #panel {{ padding: 14px; border-right: 1px solid #2f3548; overflow-y: auto; background: rgba(20,25,40,0.96); }}
    #panel h2 {{ margin: 0 0 10px; font-size: 16px; }}
    .legend-row {{ display:flex; gap:8px; align-items:center; margin:6px 0; font-size: 12px; }}
    .dot {{ width: 12px; height: 12px; border-radius: 50%; display:inline-block; }}
    #canvasWrap {{ position: relative; }}
    #canvas {{ width: 100%; height: 100%; }}
    #detail {{ position:absolute; top:14px; right:14px; width:360px; max-height:78vh; overflow:auto; background:rgba(18,23,38,0.95); border:1px solid #3b4463; padding:12px; border-radius:8px; display:none; }}
    #detail.active {{ display:block; }}
    #detail h3 {{ margin: 0 0 8px; font-size: 14px; color: #8ab4ff; }}
    #detail pre {{ white-space: pre-wrap; font-size: 11px; color: #dce4ff; }}
    #detail img {{ max-width: 100%; margin-top: 8px; border: 1px solid #3b4463; border-radius: 4px; }}
    .measure-toggle {{ margin: 8px 0; font-size: 13px; }}
    .dim-note {{ margin-top:10px; padding:6px; border:1px solid #3b4463; border-radius:6px; font-size:12px; }}
  </style>
</head>
<body>
  <div id="root">
    <aside id="panel">
      <h2>Measure Layers</h2>
      <div id="toggles"></div>
      <div id="legend"></div>
      <div id="dimNote" class="dim-note"></div>
    </aside>
    <div id="canvasWrap">
      <div id="detail"><h3 id="detailTitle"></h3><pre id="detailBody"></pre><div id="detailImages"></div></div>
      <div id="canvas"></div>
    </div>
  </div>
  <script type="importmap">
  {{
    "imports": {{
      "three": "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/"
    }}
  }}
  </script>
  <script type="module">
    import * as THREE from "three";
    import {{ OrbitControls }} from "three/addons/controls/OrbitControls.js";
    import {{ GLTFLoader }} from "three/addons/loaders/GLTFLoader.js";

    const DATA = {json.dumps(data, ensure_ascii=False)};
    const canvasHost = document.getElementById("canvas");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121726);

    const camera = new THREE.PerspectiveCamera(52, canvasHost.clientWidth / canvasHost.clientHeight, 0.01, 1000);
    camera.position.set(15, 9, 14);
    const renderer = new THREE.WebGLRenderer({{ antialias: true }});
    renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
    canvasHost.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1.2, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.75); d1.position.set(15, 18, 12); scene.add(d1);
    scene.add(new THREE.GridHelper(24, 24, 0x3e455f, 0x262d44));

    const toggles = document.getElementById("toggles");
    const legend = document.getElementById("legend");
    const dimNote = document.getElementById("dimNote");
    dimNote.textContent = DATA.dimMessage ? `모델 정보: ${{DATA.dimMessage}} (정규화 파라메트릭)` : "모델 정보: 입력 치수 기반";

    const loader = new GLTFLoader();
    const meshByMeasure = {{}};
    const allMeshes = [];

    loader.load("./hatch_coaming.glb", (gltf) => {{
      scene.add(gltf.scene);
      gltf.scene.traverse((obj) => {{
        if (!obj.isMesh || !obj.name) return;
        allMeshes.push(obj);
        const m = obj.name.match(/^m(\\d+)_/);
        if (!m) return;
        const mid = m[1];
        meshByMeasure[mid] = meshByMeasure[mid] || [];
        meshByMeasure[mid].push(obj);
      }});

      const mids = Object.keys(DATA.measureLabels).sort((a,b) => Number(a) - Number(b));
      mids.forEach((mid) => {{
        const row = document.createElement("div");
        row.className = "measure-toggle";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = true;
        cb.onchange = () => {{
          (meshByMeasure[mid] || []).forEach((mesh) => mesh.visible = cb.checked);
        }};
        const label = document.createElement("label");
        label.style.marginLeft = "8px";
        label.textContent = `M${{mid}} - ${{DATA.measureLabels[mid]}}`;
        row.appendChild(cb);
        row.appendChild(label);
        toggles.appendChild(row);

        const lg = document.createElement("div");
        lg.className = "legend-row";
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.style.background = DATA.colors[mid] || "#999";
        lg.appendChild(dot);
        const txt = document.createElement("span");
        txt.textContent = `M${{mid}}`;
        lg.appendChild(txt);
        legend.appendChild(lg);
      }});
    }});

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const detail = document.getElementById("detail");
    const detailTitle = document.getElementById("detailTitle");
    const detailBody = document.getElementById("detailBody");
    const detailImages = document.getElementById("detailImages");

    renderer.domElement.addEventListener("click", (ev) => {{
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hit = raycaster.intersectObjects(allMeshes, true)[0];
      if (!hit || !hit.object || !hit.object.name) return;
      const m = hit.object.name.match(/^m(\\d+)_(member|joint)_([^_]+)_/);
      if (!m) return;
      const measureId = Number(m[1]);
      const targetType = m[2];
      const targetId = m[3];
      const key = `${{targetType}}:${{targetId}}`;
      const apps = DATA.targetIndex[key] || [];
      const filtered = apps.filter((a) => a.measure_id === measureId);
      detailTitle.textContent = `${{targetType}}:${{targetId}} / M${{measureId}}`;
      detailBody.textContent = JSON.stringify(filtered, null, 2);

      detailImages.innerHTML = "";
      const evIds = new Set();
      filtered.forEach((app) => (app.evidence_ids || []).forEach((id) => evIds.add(id)));
      Array.from(evIds).forEach((evId) => {{
        const ev = DATA.evidenceIndex[evId];
        if (!ev || !ev.snippet_path) return;
        const img = document.createElement("img");
        img.src = ev.snippet_path;
        img.alt = ev.key || evId;
        detailImages.appendChild(img);
      }});
      detail.classList.add("active");
    }});

    window.addEventListener("resize", () => {{
      const w = canvasHost.clientWidth;
      const h = canvasHost.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
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


def generate_3d_outputs(
    project_input: ProjectInput,
    decision: DecisionResults,
    rules_db: RulesExtractionDB,
    out_dir: Path,
    colors: Dict[int, Dict[str, Any]],
) -> Dict[str, str]:
    model_dir = out_dir / "model3d"
    model_dir.mkdir(parents=True, exist_ok=True)

    specs = _geometry_specs(project_input, decision, colors)
    glb_data = _build_glb(specs)
    glb_path = model_dir / "hatch_coaming.glb"
    glb_path.write_bytes(glb_data)

    viewer_path = model_dir / "viewer.html"
    viewer_html = _viewer_html(project_input, decision, rules_db, colors, viewer_path)
    viewer_path.write_text(viewer_html, encoding="utf-8")

    return {"hatch_coaming_glb": str(glb_path), "viewer_html": str(viewer_path)}

