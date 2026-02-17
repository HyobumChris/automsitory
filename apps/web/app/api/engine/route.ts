import { NextRequest, NextResponse } from 'next/server';

/**
 * API route that simulates the decision engine for the web app.
 * 
 * In production, this would call the Python engine via subprocess or FastAPI.
 * For the standalone web build, it performs a simplified JS-based computation
 * matching the Python engine logic.
 */

interface Table821Row {
  yield_strength_nmm2: number;
  t_min: number;
  t_max: number;
  m1: string;
  m2: string;
  m3: string;
  m4: string;
  m5: string;
  thickness_range: string;
}

const TABLE_821: Table821Row[] = [
  { yield_strength_nmm2: 355, thickness_range: '50<t<=65', t_min: 50, t_max: 65, m1: 'required', m2: 'not_required', m3: 'not_required', m4: 'not_required', m5: 'not_required' },
  { yield_strength_nmm2: 355, thickness_range: '65<t<=85', t_min: 65, t_max: 85, m1: 'required', m2: 'not_required', m3: 'required', m4: 'required', m5: 'not_required' },
  { yield_strength_nmm2: 355, thickness_range: '85<t<=100', t_min: 85, t_max: 100, m1: 'required', m2: 'see_note_2', m3: 'required', m4: 'required', m5: 'required' },
  { yield_strength_nmm2: 390, thickness_range: '50<t<=65', t_min: 50, t_max: 65, m1: 'required', m2: 'not_required', m3: 'required', m4: 'required', m5: 'not_required' },
  { yield_strength_nmm2: 390, thickness_range: '65<t<=85', t_min: 65, t_max: 85, m1: 'required', m2: 'see_note_2', m3: 'required', m4: 'required', m5: 'required' },
  { yield_strength_nmm2: 390, thickness_range: '85<t<=100', t_min: 85, t_max: 100, m1: 'required', m2: 'see_note_2', m3: 'required', m4: 'required', m5: 'required' },
  { yield_strength_nmm2: 460, thickness_range: '50<t<=65', t_min: 50, t_max: 65, m1: 'required', m2: 'see_note_2', m3: 'required', m4: 'required', m5: 'required' },
  { yield_strength_nmm2: 460, thickness_range: '65<t<=85', t_min: 65, t_max: 85, m1: 'required', m2: 'see_note_2', m3: 'required', m4: 'required', m5: 'required' },
  { yield_strength_nmm2: 460, thickness_range: '85<t<=100', t_min: 85, t_max: 100, m1: 'required', m2: 'see_note_2', m3: 'required', m4: 'required', m5: 'required' },
];

const UPPER_FLANGE_ROLES = new Set([
  'upper_deck_plate', 'hatch_coaming_side_plate', 'hatch_coaming_top_plate', 'attached_longitudinal',
]);

function lookupBCA(member_role: string, yield_str: number): string {
  if (yield_str >= 390) return 'BCA2';
  return 'BCA1';
}

export async function POST(req: NextRequest) {
  try {
    const input = await req.json();
    const members: any[] = input.members || [];
    const joints: any[] = input.joints || [];
    const m3choice = input.measure3_choice || { option: '미지정', parameters: {} };
    const flags: string[] = ['Web engine – simplified JS computation. Use Python CLI for full fidelity.'];
    const ncFlags: string[] = [];

    // Derive control values
    const sideM = members.find((m: any) => m.member_role === 'hatch_coaming_side_plate');
    const topM = members.find((m: any) => m.member_role === 'hatch_coaming_top_plate');
    const sideT = typeof sideM?.thickness_mm_as_built === 'number' ? sideM.thickness_mm_as_built : null;
    const topT = typeof topM?.thickness_mm_as_built === 'number' ? topM.thickness_mm_as_built : null;
    const sideY = typeof sideM?.yield_strength_nmm2 === 'number' ? sideM.yield_strength_nmm2 : null;
    const topY = typeof topM?.yield_strength_nmm2 === 'number' ? topM.yield_strength_nmm2 : null;

    const t_control = sideT !== null && topT !== null ? Math.max(sideT, topT) : sideT ?? topT ?? '미지정';
    const y_control = sideY !== null && topY !== null ? Math.max(sideY, topY) : sideY ?? topY ?? '미지정';

    if (sideY !== null && topY !== null && sideY !== topY) {
      flags.push(`side_yield (${sideY}) != top_yield (${topY}). y_control = max = ${y_control}. Manual review.`);
    }

    let specialConsideration = false;
    if (typeof t_control === 'number' && t_control > 100) {
      specialConsideration = true;
      flags.push(`Thickness ${t_control} mm > 100 mm. Special consideration required.`);
    }

    // Table lookup
    let rowUsed: Table821Row | null = null;
    const requiredSet = new Set<number>();

    if (typeof y_control === 'number' && typeof t_control === 'number') {
      rowUsed = TABLE_821.find(r => r.yield_strength_nmm2 === y_control && t_control > r.t_min && t_control <= r.t_max) || null;
      if (!rowUsed && t_control <= 50) {
        flags.push(`Thickness ${t_control} mm <= 50 mm – below Table 8.2.1 range.`);
      } else if (!rowUsed) {
        flags.push(`No Table 8.2.1 match for yield=${y_control}, t=${t_control}.`);
      }
    }

    if (rowUsed) {
      if (rowUsed.m1 === 'required') requiredSet.add(1);
      if (rowUsed.m3 === 'required') requiredSet.add(3);
      if (rowUsed.m4 === 'required') requiredSet.add(4);
      if (rowUsed.m5 === 'required') requiredSet.add(5);
    }

    const requiredGlobal = Array.from(requiredSet).sort();
    const memberResults: Record<string, any> = {};
    const jointResults: Record<string, any> = {};

    const ensureMember = (id: string) => {
      if (!memberResults[id]) memberResults[id] = { target_type: 'member', target_id: id, applied_measures: [] };
      return memberResults[id];
    };
    const ensureJoint = (id: string) => {
      if (!jointResults[id]) jointResults[id] = { target_type: 'joint', target_id: id, applied_measures: [] };
      return jointResults[id];
    };
    const addMeasure = (target: any, measure: any) => {
      const existing = target.applied_measures.find((m: any) => m.measure_id === measure.measure_id);
      if (existing) {
        existing.notes.push(...measure.notes.filter((n: string) => !existing.notes.includes(n)));
        return;
      }
      target.applied_measures.push(measure);
      target.applied_measures.sort((a: any, b: any) => a.measure_id - b.measure_id);
    };

    const memberMap = Object.fromEntries(members.map((m: any) => [m.member_id, m]));

    // Measure 1
    if (requiredSet.has(1)) {
      for (const j of joints) {
        if (j.zone !== 'cargo_hold_region' || j.joint_type !== 'block_to_block_butt') continue;
        const rolesArr: string[] = j.connected_members.map((mid: string) => memberMap[mid]?.member_role).filter(Boolean) as string[];
        const hasUpperFlange = rolesArr.some((r: string) => UPPER_FLANGE_ROLES.has(r));
        if (hasUpperFlange) {
          const target = ensureJoint(j.joint_id);
          addMeasure(target, {
            measure_id: 1, status: 'applied', target_type: 'joint', target_id: j.joint_id,
            requirements: [{ description: 'Construction NDE: 100% UT of butt welds required.', rule_ref: 'LR Pt4 Ch8 2.3 – Measure 1', evidence: {} }],
            condition_expr: 'zone==cargo_hold_region AND joint_type in block_to_block_butt',
            rule_basis: 'Table 8.2.1 Measure 1 Required', evidence: [], notes: [],
          });
        }
      }
    }

    // Measure 3
    if (requiredSet.has(3)) {
      for (const m of members) {
        if (m.member_role === 'hatch_coaming_side_plate' && m.zone === 'cargo_hold_region') {
          const ys = typeof m.yield_strength_nmm2 === 'number' ? m.yield_strength_nmm2 : 0;
          const bca = lookupBCA(m.member_role, ys);
          const target = ensureMember(m.member_id);
          addMeasure(target, {
            measure_id: 3, status: 'applied', target_type: 'member', target_id: m.member_id,
            requirements: [{ description: `Provide BCA steel (${bca}) for hatch coaming side plate.`, rule_ref: 'LR Pt4 Ch8 2.3 – Measure 3', evidence: {} }],
            condition_expr: 'Measure 3 AND hatch_coaming_side_plate',
            rule_basis: 'Coaming side BCA requirement', evidence: [], notes: [`BCA type: ${bca}`],
          });
        }
      }

      if (m3choice.option === 'block_shift') {
        const offset = typeof m3choice.parameters?.block_shift_offset_mm === 'number' ? m3choice.parameters.block_shift_offset_mm : null;
        for (const j of joints) {
          if (j.zone !== 'cargo_hold_region' || j.joint_type !== 'block_to_block_butt') continue;
          const pf = offset !== null ? (offset >= 300 ? 'PASS' : 'FAIL') : '미지정';
          if (offset !== null && offset < 300) ncFlags.push(`Joint ${j.joint_id}: offset ${offset} mm < 300 mm`);
          const target = ensureJoint(j.joint_id);
          addMeasure(target, {
            measure_id: 3, status: 'applied', target_type: 'joint', target_id: j.joint_id,
            requirements: [{ description: `Block shift: offset >= 300 mm. Result: ${pf}`, rule_ref: 'LR Pt4 Ch8 2.3 – Measure 3', evidence: {} }],
            condition_expr: 'Measure 3, option=block_shift',
            rule_basis: 'Block shift minimum 300mm offset', evidence: [],
            notes: [`Offset = ${offset ?? '미지정'} mm`, `Result: ${pf}`],
          });
        }
      } else if (m3choice.option === 'enhanced_NDE') {
        for (const j of joints) {
          if (j.zone !== 'cargo_hold_region' || j.joint_type !== 'block_to_block_butt') continue;
          if (j.weld_process === 'EGW') {
            ncFlags.push(`Joint ${j.joint_id}: EGW not permitted with enhanced NDE.`);
          }
          const target = ensureJoint(j.joint_id);
          addMeasure(target, {
            measure_id: 3, status: m3choice.parameters?.enhanced_nde_acceptance_criteria_ref === '미지정' ? 'conditional' : 'applied',
            target_type: 'joint', target_id: j.joint_id,
            requirements: [
              { description: 'Enhanced NDE with stricter acceptance criteria. CTOD >= 0.18 mm.', rule_ref: 'LR Pt4 Ch8 2.3 – Measure 3', evidence: {} },
            ],
            condition_expr: 'Measure 3, option=enhanced_NDE',
            rule_basis: 'Enhanced NDE requirements', evidence: [],
            notes: [`NDE method: ${m3choice.parameters?.enhanced_nde_method ?? '미지정'}`, 'CTOD >= 0.18 mm required'],
          });
        }
      } else if (m3choice.option === 'crack_arrest_hole') {
        for (const j of joints) {
          if (j.zone !== 'cargo_hold_region' || j.joint_type !== 'block_to_block_butt') continue;
          const target = ensureJoint(j.joint_id);
          addMeasure(target, {
            measure_id: 3, status: 'applied', target_type: 'joint', target_id: j.joint_id,
            requirements: [{ description: 'Crack arrest holes. Fatigue assessment required at hole corners.', rule_ref: 'LR Pt4 Ch8 2.3 – Measure 3', evidence: {} }],
            condition_expr: 'Measure 3, option=crack_arrest_hole',
            rule_basis: 'Crack arrest hole fatigue assessment', evidence: [], notes: [],
          });
        }
      } else if (m3choice.option === 'crack_arrest_insert') {
        for (const j of joints) {
          if (j.zone !== 'cargo_hold_region' || j.joint_type !== 'block_to_block_butt') continue;
          const target = ensureJoint(j.joint_id);
          addMeasure(target, {
            measure_id: 3, status: 'applied', target_type: 'joint', target_id: j.joint_id,
            requirements: [{ description: `Crack arrest insert (${m3choice.parameters?.insert_type ?? '미지정'}).`, rule_ref: 'LR Pt4 Ch8 2.3 – Measure 3', evidence: {} }],
            condition_expr: 'Measure 3, option=crack_arrest_insert',
            rule_basis: 'Crack arrest insert', evidence: [], notes: [],
          });
        }
      } else {
        for (const j of joints) {
          if (j.zone !== 'cargo_hold_region' || j.joint_type !== 'block_to_block_butt') continue;
          const target = ensureJoint(j.joint_id);
          addMeasure(target, {
            measure_id: 3, status: 'pending_manual_choice', target_type: 'joint', target_id: j.joint_id,
            requirements: [{ description: 'Measure 3 option not selected.', rule_ref: 'LR Pt4 Ch8 2.3 – Measure 3', evidence: {} }],
            condition_expr: 'Measure 3, option=미지정',
            rule_basis: 'Awaiting selection', evidence: [],
            notes: ['Select: block_shift, crack_arrest_hole, crack_arrest_insert, or enhanced_NDE'],
          });
        }
      }
    }

    // Measure 4 & 5
    for (const mid of [4, 5]) {
      if (!requiredSet.has(mid)) continue;
      for (const m of members) {
        if (m.member_role !== 'upper_deck_plate' || m.zone !== 'cargo_hold_region') continue;
        const ys = typeof m.yield_strength_nmm2 === 'number' ? m.yield_strength_nmm2 : 0;
        const bca = lookupBCA(m.member_role, ys);
        const target = ensureMember(m.member_id);
        addMeasure(target, {
          measure_id: mid, status: 'applied', target_type: 'member', target_id: m.member_id,
          requirements: [{ description: `Upper deck BCA steel (${bca}) – Measure ${mid}.`, rule_ref: `LR Pt4 Ch8 2.3 – Measure ${mid}`, evidence: {} }],
          condition_expr: `Measure ${mid} AND upper_deck_plate`,
          rule_basis: `Table 8.2.1 Measure ${mid}`, evidence: [], notes: [`BCA type: ${bca}`],
        });
      }
    }

    // Measure 2 (conditional)
    if (rowUsed?.m2 === 'see_note_2' && m3choice.option === 'enhanced_NDE') {
      for (const j of joints) {
        if (j.zone !== 'cargo_hold_region' || j.joint_type !== 'block_to_block_butt') continue;
        const target = ensureJoint(j.joint_id);
        addMeasure(target, {
          measure_id: 2, status: 'conditional', target_type: 'joint', target_id: j.joint_id,
          requirements: [{ description: 'Periodic in-service NDE. Frequency/extent to be agreed with LR.', rule_ref: 'LR Pt4 Ch8 2.3 – Measure 2 (Note 2)', evidence: {} }],
          condition_expr: 'm2==see_note_2 AND option==enhanced_NDE',
          rule_basis: 'Note 2', evidence: [], notes: ['Conditional'],
        });
      }
    }

    // PJP
    for (const j of joints) {
      if (j.joint_type === 'coaming_to_deck_connection') {
        const target = ensureJoint(j.joint_id);
        addMeasure(target, {
          measure_id: 0, status: 'applied', target_type: 'joint', target_id: j.joint_id,
          requirements: [{ description: 'LR-approved PJP welding required for coaming-to-deck connection.', rule_ref: 'LR Pt4 Ch8 2.3 – Welding detail', evidence: {} }],
          condition_expr: 'joint_type==coaming_to_deck_connection',
          rule_basis: 'PJP requirement', evidence: [], notes: ['Always applicable'],
        });
      }

      // EGW check
      if (j.weld_process === 'EGW' && m3choice.option === 'enhanced_NDE' && requiredSet.has(3)) {
        const target = ensureJoint(j.joint_id);
        addMeasure(target, {
          measure_id: 0, status: 'noncompliant', target_type: 'joint', target_id: j.joint_id,
          requirements: [{ description: 'EGW not permitted with enhanced NDE (Measure 3).', rule_ref: 'LR Pt4 Ch8 2.3 – EGW restriction', evidence: {} }],
          condition_expr: 'weld_process==EGW AND enhanced_NDE',
          rule_basis: 'EGW restriction', evidence: [], notes: ['NONCOMPLIANCE'],
        });
      }
    }

    const result = {
      project_id: input.project_meta?.project_id || 'WEB-SESSION',
      control_values: {
        t_control, y_control,
        side_thickness: sideT ?? '미지정', top_thickness: topT ?? '미지정',
        side_yield: sideY ?? '미지정', top_yield: topY ?? '미지정',
      },
      required_measures_global: requiredGlobal,
      table_821_row_used: rowUsed,
      special_consideration: specialConsideration,
      member_results: memberResults,
      joint_results: jointResults,
      manual_review_flags: flags,
      noncompliance_flags: ncFlags,
    };

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
