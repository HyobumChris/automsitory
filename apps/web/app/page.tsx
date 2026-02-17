"use client";

import { useEffect, useMemo, useState } from "react";

type AppliedMeasure = {
  measure_id: number;
  measure_name: string;
  status: string;
  target_type: "member" | "joint";
  target_id: string;
  requirements: string[];
  notes: string[];
  noncompliance: boolean;
};

type TargetDecision = {
  target_type: "member" | "joint";
  target_id: string;
  applied_measures: AppliedMeasure[];
};

type DecisionResults = {
  required_measures_global: Record<string, string>;
  targets: {
    members: TargetDecision[];
    joints: TargetDecision[];
  };
  applications: AppliedMeasure[];
  pending_choices: Array<Record<string, unknown>>;
  manual_review_flags: Array<{ flag_id: string; category: string; message: string }>;
};

const STEPS = [
  "Step 1) 자재 선택",
  "Step 2) 두께 입력",
  "Step 3) Required Measures Global",
  "Step 4) Measure 3 옵션",
  "Step 5) 누적 결과 + 2D/3D",
  "Step 6) Export",
];

const MEASURE_COLORS: Record<number, string> = {
  1: "#FF8C00",
  2: "#1E90FF",
  3: "#DC143C",
  4: "#2E8B57",
  5: "#8A2BE2",
};

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function HomePage() {
  const [step, setStep] = useState(0);
  const [decision, setDecision] = useState<DecisionResults | null>(null);
  const [rules, setRules] = useState<Record<string, unknown> | null>(null);
  const [mmd, setMmd] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [d, r, flow] = await Promise.all([
          fetch("/outputs/demo/decision_results.json"),
          fetch("/outputs/demo/rules_extraction.json"),
          fetch("/outputs/demo/diagrams/decision_flow.mmd"),
        ]);
        if (!d.ok || !r.ok) {
          throw new Error("outputs/demo 산출물이 없습니다. 먼저 엔진 CLI를 실행하세요.");
        }
        setDecision((await d.json()) as DecisionResults);
        setRules((await r.json()) as Record<string, unknown>);
        if (flow.ok) setMmd(await flow.text());
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to load outputs");
      }
    }
    load();
  }, []);

  const requiredList = useMemo(() => {
    if (!decision) return [];
    return Object.entries(decision.required_measures_global)
      .filter(([, v]) => v === "required" || v === "conditional")
      .map(([k, v]) => `${k}:${v}`);
  }, [decision]);

  return (
    <main className="page">
      <h1 className="title">LR 해치코밍 Measure 1~5 자동 판정</h1>
      <p className="subtitle">scan-first 판정 / member·joint 분리 / 누적 시각화(2D+3D)</p>
      {error && <p style={{ color: "#b42318" }}>{error}</p>}

      <div className="layout">
        <aside className="panel">
          {STEPS.map((label, idx) => (
            <div
              key={label}
              className={`step ${idx === step ? "active" : ""}`}
              onClick={() => setStep(idx)}
              role="button"
            >
              {label}
            </div>
          ))}
        </aside>

        <section className="panel">
          {step === 0 && (
            <>
              <h3>Step 1) 자재 선택</h3>
              <p className="muted">등급/항복응력 입력은 엔진 입력 JSON에서 관리됩니다.</p>
              <div className="row">
                {requiredList.map((item) => (
                  <span key={item} className="badge">
                    {item}
                  </span>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h3>Step 2) 두께 입력</h3>
              <p className="muted">coaming side/top 기준 t_control을 계산하며 미지정은 자동 유지됩니다.</p>
              <pre>{decision ? JSON.stringify(decision.control_parameters, null, 2) : "loading..."}</pre>
            </>
          )}

          {step === 2 && (
            <>
              <h3>Step 3) Table 8.2.1 기반 Required Measures Global</h3>
              <div className="row">
                {[1, 2, 3, 4, 5].map((mid) => (
                  <span key={mid} className="badge" style={{ borderColor: MEASURE_COLORS[mid] }}>
                    M{mid}: {decision?.required_measures_global?.[`measure_${mid}`] ?? "-"}
                  </span>
                ))}
              </div>
              <p className="muted">누적 예시: [] → [1] → [1,3] → [1,3,4] → [1,3,4,5]</p>
            </>
          )}

          {step === 3 && (
            <>
              <h3>Step 4) Measure 3 옵션</h3>
              <p className="muted">option 미지정 시 pending_manual_choice 상태로 유지됩니다.</p>
              <pre>{decision ? JSON.stringify(decision.pending_choices, null, 2) : "loading..."}</pre>
            </>
          )}

          {step === 4 && (
            <>
              <h3>Step 5) member/joint별 누적 결과 + 2D/3D</h3>
              <div className="row" style={{ marginBottom: 10 }}>
                {Object.entries(MEASURE_COLORS).map(([mid, color]) => (
                  <div className="legend-item" key={mid}>
                    <span className="swatch" style={{ background: color }} />
                    <span>M{mid}</span>
                  </div>
                ))}
              </div>

              <h4>Members</h4>
              <table className="table">
                <thead>
                  <tr>
                    <th>Target</th>
                    <th>Applied Measures (누적)</th>
                  </tr>
                </thead>
                <tbody>
                  {decision?.targets.members.map((target) => (
                    <tr key={target.target_id}>
                      <td>{target.target_id}</td>
                      <td>{target.applied_measures.map((m) => `M${m.measure_id}`).join(", ") || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h4>Joints</h4>
              <table className="table">
                <thead>
                  <tr>
                    <th>Target</th>
                    <th>Applied Measures (누적)</th>
                  </tr>
                </thead>
                <tbody>
                  {decision?.targets.joints.map((target) => (
                    <tr key={target.target_id}>
                      <td>{target.target_id}</td>
                      <td>{target.applied_measures.map((m) => `M${m.measure_id}`).join(", ") || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h4>2D Outputs</h4>
              <div className="row">
                <a href="/outputs/demo/diagrams/hatch_plan.svg" target="_blank" rel="noreferrer">
                  hatch_plan.svg
                </a>
                <a href="/outputs/demo/diagrams/hatch_section.svg" target="_blank" rel="noreferrer">
                  hatch_section.svg
                </a>
              </div>

              <h4 style={{ marginTop: 14 }}>3D Viewer</h4>
              <div className="viewer-wrap">
                <iframe
                  title="hatch 3d viewer"
                  src="/outputs/demo/model3d/viewer.html"
                  style={{ width: "100%", height: "100%", border: "none" }}
                />
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <h3>Step 6) Export</h3>
              <div className="row">
                <button className="btn" onClick={() => decision && downloadJson("decision_results.json", decision)}>
                  decision_results.json 다운로드
                </button>
                <button className="btn" onClick={() => rules && downloadJson("rules_extraction.json", rules)}>
                  rules_extraction.json 다운로드
                </button>
              </div>
              <h4>Mermaid Flow</h4>
              <pre style={{ whiteSpace: "pre-wrap" }}>{mmd || "decision_flow.mmd not found"}</pre>
              <h4>manual_review_flags</h4>
              <pre style={{ whiteSpace: "pre-wrap" }}>
                {decision ? JSON.stringify(decision.manual_review_flags, null, 2) : "loading..."}
              </pre>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

