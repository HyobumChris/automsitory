/* 30-raytrace.js — 2-D polygon ray tracer: piston-directivity fan (v2), specular return-to-probe echoes,
 * diffuse scatterers, arcs, Perspex insert, V1 slot retro-reflection, through transmission and tandem,
 * mode conversion S↔L with time-based echo placement (v2), Rayleigh surface wave + finger dampers (v2),
 * per-mode material attenuation / austenitic weld metal / transfer loss (v2), focused probes (v2), FBH law (v2).
 * Pure functions of their arguments (never reads UT.state except in the UT.test helpers). SPEC §6.1 as amended
 * by §15.4 and SPEC-v2 §3.1–3.4, §3.6, §3.8, §3.13, §4.5, §7.
 */
(function (UT) {
  'use strict';

  // SPEC NOTES (decisions where the spec is silent or physically unattainable)
  // 1. Diffuse capture (§6.1 2b) uses a soft kernel: the raw capture disc of radius c is kept, but the
  //    amplitude is tapered by cos(pi/2 * d/c) with d = perpendicular distance to the scatterer, so the
  //    response of a SDH peaks uniquely when the ray passes through its centre (otherwise the flat
  //    capture disc made every position within ±c equally loud, which broke "max within ±5 mm").
  // 2. Weld bead surfaces (outline tags 'cap' and 'root') are rough: besides the specular return test
  //    they act as weak diffuse scatterers at the hit point (kind 'geometry',
  //    S = BEAD_SCATTER·|cos incidence|·min(1, |n_x|/0.5), D = q^1.5) — the slope factor |n_x| makes a
  //    FLAT bead (rootHeight/capHeight 0, outline points still tagged root/cap) a plain backwall/top
  //    that does not scatter, and BEAD_SCATTER (0.08) keeps the root-bead echo ≥ 20 dB below the
  //    corner echo of a 3 mm root crack so an AUT gate at 20 % of the corner peak stays clear of it
  //    (§11.1 #12 on the default weld). Machined surfaces (top/bottom/end/step/brace/fusion/radius)
  //    stay purely specular. Without the bead scatter, the 8-segment sine bead never returns a
  //    45/60/70° beam within θ20 and the root/cap geometry echoes of §6.1 3 would never exist.
  // 3. Lamination size factor uses the lateral extent (width) instead of the through-thickness
  //    height: S = min(1.2, max(width, height)/4). A 0.5 mm-high, 40 mm-wide lamination is a large
  //    reflector for a 0° beam (§6.3 "strong echo at its depth").
  // 4. Corner echoes (outline + planar defect in either order) use the defect's S and D = q^1.5.
  // 5. Skew weight (§6.7) multiplies kinds defect/corner/geometry/lamination only when the refracted
  //    angle is > 0 (a 0° beam is unaffected by probe rotation); volumetric scatterers (their echoes
  //    carry kind 'defect' too, §15.4) and SDHs stay ×1. ampNoZ = amp with Z = 1 (skew
  //    included); zFactor() returns the pure §6.7 overlap factor Z, so amp === ampNoZ·zFactor(...).
  // 6. centre.legs[i] = {a, b, leg, surfaceTag, hitTag}: surfaceTag = tag of the surface the segment
  //    was last reflected from ('top' for the first leg, 'defect' after a defect), hitTag = what it
  //    hits at b. Fan/centre polylines are truncated to display.skips legs; echo search continues to
  //    opts.maxLegs.
  // 7. Through transmission: result.echoes = [transmitted] only; amp = Σ w(δ)·e (rays inside the
  //    receiver aperture) / Σ w(δ), i.e. 1.0 for a clean path. result.receiver = {x, y} for drawing.
  // 8. Tandem: only echoes whose ray reflected off a planar defect (and passed the bottom) and reach the
  //    rx aperture within the acceptance cone of (+side·sinθ, −cosθ) are returned (kind 'defect' or 'corner', tag 'tandem').
  //    result.receiver = {x: probe.x − side·T·tanθ, y: 0}.
  // 9. Perspex far-side echo (§6.1 2f) is emitted for the δ = 0 ray of a 0° probe only.
  // 10. The V1 slot retro-reflection also applies to the 0° probe (same relaunch, e × 0.5).
  // 11. Scanning-surface energy factor is 0.87 (spec text: 0.85). With 0.85 the 25 → 50 mm step of the
  //     V1 0° multiples computes to −5.12 dB (e −1.86, D −3.01, M −0.25) and fails §11.1 check 1
  //     ("2–5 dB"); 0.87 gives −4.9 / −3.7 / −3.2 dB, inside the required band. Everything else is literal.
  // 12. Merging (§6.1 rule 5) groups by (kind, defectId|tag, leg) and |path − path_best| ≤ 1.5 mm on the
  //     path-sorted list instead of fixed 1.5 mm bins (bins split one echo straddling a bin edge in two).
  // 13. Corner rule refinement: the (outline, planar defect) pair counts as 'corner' only when the defect
  //     was hit > 12° off its normal. A leg-2 normal-incidence return off a fusion face (bottom → face →
  //     bottom → probe) is otherwise labelled 'corner' by the literal rule; it is a plain 'defect' echo.
  //     Corner echoes report x,y of the defect hit and the leg of the first reflection of the pair.
  // 14. Raw echoes with max(amp, ampNoZ) < 1e-6 (−120 dB, < 1 % FSH even at 110 dB gain) are dropped
  //     before merging. An echo whose z-overlap Z is 0 (defect not under the probe's z) is KEPT with
  //     amp 0 when its ampNoZ is finite, so the AUT trace-once + zFactor() re-weighting (§15.11) can
  //     recover it at other z; such echoes contribute no highlight dot (see also SPEC NOTE 19).
  // 15. Step-wedge floors (tag 'step') report kind 'backwall' (§6.3: "backwall at the local step
  //     thickness"); the vertical risers ('end') stay 'geometry'.
  // 16. TT receiver aperture: a fan ray counts when its first outline hit lies within D/2 of the
  //     centre-ray line (perpendicular) and within D of the receiver point, so a clean plate transmits 1.0
  //     for every angle. Planar defect segments still reflect in TT mode (they shadow the receiver).
  //     The transmitter is TT_SUB sub-apertures spread over the crystal (offsets −D/2..+D/2 along the
  //     scanning surface, each with the full fan; receiver test translated by the same offset), so a
  //     reflector narrower than the crystal shadows only part of the signal. Volumetric defects
  //     (types volumetric/porosity/slag) attenuate a TT ray by TT_EXTINCTION dB per mm of chord through
  //     the defect polygon × reflectivity × z-overlap fraction (10 × 4 mm inclusion at 0° → −6 dB).
  //     Pulse-echo/tandem rays are not attenuated (only TT).
  // 17. Volumetric scatterers: each sample point keeps only its LOUDEST capture across the fan rays
  //     (per leg) before merging, so the incoherent sum of rule 5 runs over distinct scatterer points and
  //     the amplitude does not grow with fanCount (S-scan fan of 5 = A-scan fan of 21). Their echo kind
  //     is 'defect' (§15.4) with defectType volumetric/porosity/slag; mergeEchoes applies the incoherent
  //     sum to 'defect' groups whose defectType is not planar.
  // 18. Return aperture soft edge: the SPEC's hard gate dE ≤ ra is kept at full weight, followed by a
  //     taper zone ra < dE < ra + AP_TAIL·D with weight cos²(π/2·(dE − ra)/(AP_TAIL·D)) (AP_TAIL = 2:
  //     0 at ra + 2D), so a mirror-like reflector leaving the fan fades out instead of switching off. The
  //     direction gate is dev < max(2·θ20, fanMax) (v2: the piston directivity supplies the weight, see NOTE 29).
  // 19. z-overlap is geometric, not only an amplitude scale (§6.7 "a defect whose z extent does not overlap
  //     the footprint must neither reflect nor shadow"). When a ray meets a planar defect segment the
  //     §6.7 factor Z is evaluated at the hit (hz = len·tanθ20z + crystalB/2) and the ray SPLITS: the reflected
  //     branch carries weight Z, a transmitted branch (same direction, no bounce/leg change, defect not in
  //     its reflection history) carries sqrt(1 − Z²). Each echo records the chain of factors it went through
  //     (`echo.zs = [{defectId, hz, trans}]`, the echo's own defect added as a reflection factor unless
  //     already present); amp = ampNoZ · Π factors and zFactor() recomputes the same product for another z
  //     (AUT trace-once). A dead branch (weight 0) is still marched so AUT can restore it, but never splits
  //     again; each defect splits at most once per fan ray (MAX_SPLITS overall), later encounters follow the
  //     dominant side (Z² ≥ 0.5 → reflect, else pass through). The drawn polyline follows the dominant side.
  //     Consequences: at Z = 0 a lamination is transparent (backwall + multiples return), TT transmits
  //     sqrt(1 − Z²), a corner reflector behind an out-of-z planar defect is reached.
  // 20. Hole shadow (§6.1 2c "the backwall behind a hole is shadowed"): the fan is launched from the index
  //     POINT, so a literal specular reflection off a 5 mm hole at 6 mm depth would swallow every fan ray
  //     (total shadow) instead of the ≈ 5 dB drop of the original V2 exercise. Holes therefore stay
  //     pass-through (diffuse capture for the echo, SPEC NOTE 1) and, when a hole lies inside the beam band
  //     (half-width D/2 + len·tanθ20 about the ray), the ray's energy beyond it is scaled by the uncovered
  //     fraction 1 − overlap(hole chord, band)/band width, i.e. (1 − 2r/W) for a hole centred on the axis.
  //     Applies in every method (pulse-echo, TT, tandem); holes span all z.
  // 21. Bead specular loss: a convex weld bead (outline tags 'cap'/'root', only present when the bead is
  //     higher than FLAT_BEAD — 10-specimens tags flat beads 'top'/'bottom') is a curved, rough surface
  //     (R ≈ 4–17 mm), so a specular reflection off it diverges: the ray's running energy is multiplied
  //     by BEAD_SPECULAR (0.25, ≈ −12 dB) per bead reflection, in addition to the 0.95 of §6.1 2c. This
  //     kills the cavity retro-path probe → root flank → cap crown → root flank → probe (a 50 % phantom
  //     at 2/3 skip on a clean weld, 20 dB above the real half-skip root echo) while the diffuse bead
  //     scatter of NOTE 2 (which uses the pre-bounce energy) still provides the half/full-skip root/cap
  //     geometry echoes. Machined surfaces are unaffected.
  // 22. Merge representative (§6.1 rule 5/6): the amplitude of a group is still the max over its members,
  //     but the reported path/x/y/angleDev come from the member closest to the beam axis (smallest
  //     |angleDev|) among those within 1 dB of the max — the beam-centre path is what a real probe reads.
  //     With the literal max-path rule a 70° corner reflector read 57.4 instead of T/cos70 = 58.5 because
  //     D(path) rewards the −0.4° fan ray's shorter path more than w(δ) penalises it. Volumetric groups
  //     keep their loudest scatterer point.
  // 23. Coverage symmetry of specular planar returns (kinds 'defect' with a planar type, 'lamination'):
  //     the merged amplitude is multiplied by Σ_members w(δ)² / Σ_window w(δ)², where the window is the
  //     fan interval of the same angular width centred on the strongest member's δ (clamped ≤ 1). A face
  //     insonised symmetrically about the strongest ray keeps its amplitude; a fan only half on the face
  //     (beam axis at the face end) is ≈ −3 dB, so the response of a face shorter than the beam peaks
  //     with the beam axis at the face midpoint (§11.1 #9) instead of at the first position where the
  //     centre ray reaches it. A small reflector at the fan edge stays at w(δ)² (no double penalty).
  //     Corner, SDH, volumetric, tip and surface echoes are not affected.
  // 24. Hole path: holes of radius > SDH_CENTRE_MAX_R (1.5 mm, i.e. larger than the 3 mm calibration SDH
  //     class: IOW 1.5 mm, DAC 3 mm) report the near-surface path (foot point − r, ≥ 0) — a 0° probe over
  //     the V2 5 mm hole reads 3.75, not the 6.25 of the centre. Calibration SDHs keep the §6.1 2b centre
  //     convention that §5.3 / §11.1 #4 and the 40-ascan K_REF calibration rely on.
  // 25. Crack–bead corner (§6.1 3 "corner echo of root cracks"): a planar defect that reaches a weld bead
  //     (an end point within BEAD_REACH of the bead's base chord or beyond it, inside the bead's span —
  //     the default root-crack preset ends on the root-bead crown) forms its corner with that bead. The
  //     bead reflection of the (defect, bead) pair — in either order: the ray arrives from the defect, or
  //     the flat-mirrored ray would reach the defect before any outline surface — uses the bead's BASE
  //     chord normal (the plate surface the bead sits on) and skips the BEAD_SPECULAR loss; the rough-bead
  //     diffuse scatter (NOTE 2) still fires. With the literal sloped bead normal the fan rays whose bottom
  //     hit fell on the bead (the beam centre at the nominal stand-off) were deviated > 2·θ20 and lost, so
  //     one crack produced two corner maxima 7 mm apart (x ≈ 31 and 38) with a −6 dB dip between them and
  //     two corner echoes 5 mm apart on the A-scan. Bead reflections not paired with a defect are unchanged.
  // 26. Surface-breaking ends do not diffract: a planar-defect end point within TIP_SURFACE_TOL (0.5 mm) of
  //     an outline edge/arc is the corner itself (kind 'corner' via 2d), not a free crack tip, so no 'tip'
  //     scatterer is emitted there. Otherwise two tip echoes at exactly the corner path added ≈ +2.3 dB to
  //     the A-scan envelope of every surface-breaking crack while the echo list reported the corner alone.
  // 27. Corner merge window: 'corner' echoes of one defect and leg merge over CORNER_MERGE (6 mm) instead of
  //     the 1.5 mm of NOTE 12. A crack through a bead is one corner reflector whose fan-ray paths step
  //     between the flat-bottom part and the bead crown (2·y_mirror/cosθ' differs by ≈ 2·rootHeight), so
  //     the literal window listed two corner echoes 4–5 mm apart at some stand-offs; the representative
  //     (NOTE 22) still reports the beam-centre path.
  // ---- v2 (SPEC-v2 §3) ----
  // 28. Fan layout (§3.1): opts.fanCount ≥ 41 selects the v2 layout (rays 0…20 uniform on ±θ20, 21…24 =
  //     ±(θ20+null)/2 and ±null, 25…40 = 8 per side uniform on (null, fanMax], the latter only with
  //     physics.sideLobes); any other fanCount is the uniform v1 grid on ±θ20 (K_REF calibration, S-scan fan
  //     of 5). Ray weight = D(δ)·min(1, Δδ_i/Δδ_main): the angular-bin factor of the spec is CLAMPED ≤ 1 so the
  //     sparse ring rays 21…24 (bin ≈ 2× the main-lobe bin) are not inflated above the θ20 ray (a reflector at
  //     3.9° would otherwise read louder than at 3.2°); denser side-lobe bands are still down-weighted.
  //     Fan offsets with refracted + δ > 89° are dropped (never folded).
  // 29. Directivity (§3.1): the frozen derived.directivity(δ) is the pure piston |2J1(x)/x|; this module applies
  //     the null/floor rule (|δ| ≤ null → D1; beyond: sideLobes ? max(D1, −30 dB) : 0) in dirWeight(). The return
  //     weight is dirWeight(dev) with the direction gate dev < max(2·θ20, fanMax) (NOTE 18). Side-lobe rays
  //     (25…40) trace ≤ 2 legs, never convert, never split at partial z-overlap (follow the dominant side) and
  //     skip volumetric/tip sampling (hole capture is kept — it is cheap).
  // 30. Mode conversion (§3.2): evaluated at reflections off outline edges/arcs and planar defect / reflector
  //     segments (not Perspex, not the slot relaunch) of main-lobe rays (|δ| ≤ null, also focused rays) with fan
  //     weight ≥ 0.02. The FIRST eligible reflection (R > 0 and e·√R ≥ 0.01) spawns the converted branch (mode
  //     swapped, direction by Snell in the reflection half-plane, e × √R, leg cap = leg + 2, no further spawns of
  //     any kind); the specular branch keeps √(1 − R) only there (later reflections of the primary ray are not
  //     split, "at most one conversion per fan ray"). R_LS/R_SL are ENERGY fractions (§3.2) while the running factor
  //     e multiplies AMPLITUDE (§6.1 rule 4), so the square roots are the consistent conversion: a 60° beam on a
  //     vertical root crack (φ = 30°, R_SL 0.73) loses 5.6 dB on its corner echo (a literal e × (1 − R) would take
  //     11.3 dB and sink the AUT / lesson gate levels of v1). The converted branch cannot spawn, so at its later
  //     eligible reflections it follows the DOMINANT energy path: R' ≥ 0.5 → it re-converts back (e × √R', once), else it
  //     keeps its mode with e × (1 − R'). This is what produces the reciprocal-path trap of §3.2 (a): S→L on the
  //     underside of the inclined face (R_SL(20.4°) = 0.41), L down to the backwall and back, L→S at the face
  //     (R_LS(39.4°) = 0.67 ≥ 0.5), S retraces to the probe: kind 'modeconv', tUs 37.9 µs, displayed path 61.4 mm
  //     (the fan smears it over ≈ 37…41 µs because each ray meets the face at a different depth).
  //     Converted branches ignore opts.maxLegs (only their own cap and maxLen). Diffuse captures on a converted
  //     branch (holes only — volumetric/tip sampling is skipped for speed) are 'modeconv' echoes too (retrace, ×0.5
  //     when the branch mode ≠ probe mode).
  // 31. Attenuation (§3.4): per-mode ONE-WAY coefficients attenL5/attenS5 are read from
  //     UT.specimens.materials[spec.material.key] (spec.material itself only carries the v1 fields), scaled by
  //     (f/5)^1.5, accumulated over every travelled segment (out and back) with the segment's own mode:
  //     M = 10^(−Σ α·len/20); for un-converted echoes this is exactly v1's 10^(−α·2·path/20). Austenitic weld
  //     metal (opts.weldMaterial === 'austenitic') adds 0.15·(f/5) dB/mm one-way over UT.specimens.segmentInRegion
  //     (diffuse captures inside a segment use the proportional share of that segment). opts.transferLossDb is a
  //     flat two-way loss on specimen.kind === 'weld' only, applied to every echo kind (incl. surface/modeconv).
  // 32. Every echo carries tUs (two-way metal time), lenMm (geometric one-way length: (out + back)/2 for specular
  //     returns, the one-way distance for diffuse scatterers) and mode (arriving mode 'S'|'L', 'R' for the
  //     surface wave). path = tUs·derived.vel/2 for converted/surface echoes and = lenMm otherwise (identical
  //     numbers, kept exact for the v1 checks). D(q) and hz use lenMm.
  // 33. Surface wave (§3.3): only from the chord scanning surface (probe.surface 'chord'; not brace/web) of a
  //     shear angle probe with refracted ≥ 65° or wedge angle ≥ secondCritical − 6°. It walks the outline from the
  //     emission point in the beam direction over consecutive 'top'/'cap' edges: top→cap = cap toe (0.5, continues
  //     over the bead), a run ending in another tag = plate/block end (1.0, stop) unless a 'top' edge at the same
  //     level resumes within NOTCH_GAP (12 mm) → notch (0.8, continues) — 'end' means the tag 'end' OR any next edge
  //     that turns down into the specimen (the V1 block's 100 mm radius, a step, an end face: convex corner, 1.0);
  //     only an edge rising above the surface (cap→web/brace, an untagged bead) is a 'toe' (0.5); a planar defect with a vertex at y ≤ 0.5 mm
  //     between the probe and the next vertex = surface-breaking crack (0.8, continues). At most 4 reflectors.
  //     Each finger damper (opts.damping.points, x on the chord) between the probe and the reflector multiplies the
  //     echo by 0.01 (0.1 each way). Echo: kind 'surface', tag = reflector kind ('cap-toe'|'end'|'notch'|'crack'|
  //     'toe'), tUs = 2d/vR, path = d·vel/vR, lenMm = d, mode 'R', amp = eR·refl·q^0.5 (q = N/max(d, N)), z-overlap
  //     for crack reflectors. RayResult.surface = {pts, reflectors, dampers} or null (60 draws it).
  // 34. Focus (§3.6): when derived.focus.on the angular fan is replaced by nAp aperture rays (41 for fanCount ≥ 21,
  //     else fanCount) spread over ±crystalA/2 along the surface tangent, all aimed at the focal point E + u0·F with
  //     F clamped to [10, nearField] (F > N would make Gf < 1); weight = pure piston D1 of the ray's angle from
  //     u0 (no floor, no null truncation); fan[i].pts[0] is the aperture point, edge20 = the two outermost aperture
  //     rays, RayResult.focus = {F, x, y}. The diffuse capture distance of focused rays is scaled by FOCUS_CAPTURE
  //     (0.4, floor 0.3 mm): the v1 fan is already a point-source fan, so without a tighter capture kernel the SDH
  //     response width would not narrow at the focus (V2-6 wants ≤ 0.7×). Gf(lenMm) multiplies every echo.
  // 35. FBH / reflectors (§3.8): spec.reflectors segments are two-sided specular planar reflectors outside the
  //     outline with tip scatter (0.12) at ends that are not on the outline. tag 'fbh' → kind 'fbh' (tag 'fbh',
  //     label from the reflector), S = π·d²/(2·λ·max(lenMm, N)) WITHOUT a min(1, …) cap (§3.8 lead decision: the
  //     ratio exceeds 1 for large discs near the near field — ⌀6 at 30 mm, 5 MHz L: 1.6 — and the DGS ERS readout
  //     inverts exactly this law, so a cap would compress ⌀6 to 4.2 mm), D = q^0.5; tag 'interface' → kind
  //     'geometry' (tag 'interface', S 1, q^0.5). Reflectors do not take part in the corner rule and span all z.
  // 36. describe(echo) returns an object {text, name, category, kind, mode, path, leg, label, toString()} (a String
  //     in v1 — nobody consumed it); string contexts still work through toString(). It also accepts a Readout
  //     ({echoKind, path, leg}) and resolves the underlying echo in UT.frame.echoes by kind and path. Categories
  //     (§4.5): backwall | geometry-root | geometry-cap | geometry-backing | corner | tip | defect | modeconv |
  //     surface | lamination | sdh. Kinds outside the quiz set map to the nearest id: fbh → 'sdh'; radius, perspex,
  //     transmitted → 'backwall'; geometry with other tags → 'geometry-root' when y ≥ T/2 else 'geometry-cap'.
  // 37. Defaults when 40-ascan passes no opts.physics: modeConv/surfaceWave/sideLobes true (the v2 default
  //     state); the fan layout follows fanCount alone (NOTE 28). opts.damping/weldMaterial/transferLossDb default
  //     to none. Outline tags 'backing', 'web', 'fusion', 'interface' are ordinary geometry surfaces (kind 'geometry').
  // 38. Twin-crystal angle probes (§3.5, probe.crystal === 'twin' with refracted > 0): near-surface sensitivity
  //     boost ×1.5 on every echo with lenMm < 15 mm, applied HERE (the amplitude-law owner; 40-ascan only drops the
  //     initial pulse). The factor rolls off linearly between 12 and 15 mm (1.5 → 1) so the echo-dynamic curve of a
  //     reflector crossing 15 mm has no step; 0° twin probes and the surface wave are not boosted.
  // 39. Performance (§6.4): diffuse volumetric / tip sampling runs on legs 1…DEEP_LEGS (4) only — i.e. up to the
  //     4th backwall multiple of a 0° probe (leg k covers paths (k−1)·T…k·T); deeper legs capture holes only, like
  //     side-lobe and converted branches. Specular echoes (backwall multiples, lamination, corners) are unaffected.
  //     A 0° probe on the default plate with range 400 (42 legs) otherwise spends ~2× the budget in point sampling.

  const M = UT.math;
  const DEG = Math.PI / 180;
  const EPS = 1e-6;
  const STEP_OFF = 1e-4;
  const GRAZE_COS = Math.cos(80 * DEG);
  const TOP_LOSS = 0.87;      // SPEC NOTE 11
  const OTHER_LOSS = 0.95;
  const CORNER_MIN_INC = 12;  // deg from the normal at the defect for the corner rule (SPEC NOTE 13)
  const AMP_FLOOR = 1e-6;     // echoes below this (−120 dB) are dropped (SPEC NOTE 14)
  const BEAD_SCATTER = 0.08;  // rough weld-bead diffuse coefficient (SPEC NOTE 2)
  const BEAD_SPECULAR = 0.25; // energy kept by a specular reflection off a convex bead (SPEC NOTE 21)
  const REP_DB = 1;           // merge representative: within this many dB of the group max (SPEC NOTE 22)
  const SDH_CENTRE_MAX_R = 1.5; // holes up to this radius are read at their centre (SPEC NOTE 24)
  const TT_SUB = 7;           // through-transmission sub-apertures across the crystal (SPEC NOTE 16)
  const TT_EXTINCTION = 1.5;  // dB per mm of TT ray chord through a volumetric defect (SPEC NOTE 16)
  const AP_TAIL = 2;          // return-aperture taper zone beyond ra, in crystal diameters (SPEC NOTE 18)
  const MAX_SPLITS = 6;       // transmitted branches spawned per fan ray at partially-overlapping defects (SPEC NOTE 19)
  const BEAD_REACH = 0.5;     // mm: a planar-defect end this close to (or beyond) a bead's base chord reaches the bead (SPEC NOTE 25)
  const TIP_SURFACE_TOL = 0.5; // mm: planar-defect ends this close to an outline surface emit no tip scatter (SPEC NOTE 26)
  const CORNER_MERGE = 6;     // mm: merge window for corner echoes of one defect and leg (SPEC NOTE 27)
  const SIDELOBE_FLOOR = Math.pow(10, -30 / 20);   // §3.1: −30 dB floor beyond the first null when physics.sideLobes
  const CONV_MIN_E = 0.01;    // §3.2: converted rays below this running energy are dropped
  const CONV_MIN_W = 0.02;    // SPEC NOTE 30: no conversion on rays with a smaller fan weight
  const CONV_BACK = 0.5;      // SPEC NOTE 30: converted branch re-converts when R' ≥ this
  const CONV_LEGS = 2;        // §3.2: converted branch traces ≤ 2 further legs
  const SIDE_LEGS = 2;        // §3.1: side-lobe rays trace ≤ 2 legs
  const CONV_DRAW_MAX = 40;   // §3.13: RayResult.converted entries (by weight)
  const CONV_DRAW_MIN = 1e-3; // weight floor for drawn converted polylines
  const FOCUS_CAPTURE = 0.4;  // SPEC NOTE 34
  const FOCUS_CAPTURE_MIN = 0.3;
  const WELD_AUST_DB = 0.15;  // §3.4: austenitic weld metal extra one-way dB/mm at 5 MHz
  const NOTCH_GAP = 12;       // SPEC NOTE 33
  const SURF_MAX_REFL = 4;
  const DAMPER_FACTOR = 0.01; // 0.1 each way (§3.3)
  const TWIN_BOOST = 1.5;     // §3.5 twin-crystal angle probe near-surface boost (SPEC NOTE 38)
  const TWIN_NEAR = 15;       // mm: boosted below this path (SPEC NOTE 38)
  const TWIN_ROLL = 12;       // mm: full boost up to here, linear roll-off to TWIN_NEAR (SPEC NOTE 38)
  const DEEP_LEGS = 4;        // diffuse volumetric / tip sampling only on legs ≤ this (SPEC NOTE 39)
  const sampleCache = new WeakMap();
  const geomCache = new WeakMap();   // specimen → flattened edges/arcs with precomputed normals

  // ------------------------------------------------------------------ small helpers
  function norm(x, y) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }
  function dot(ax, ay, bx, by) { return ax * bx + ay * by; }
  function reflect(dx, dy, nx, ny) { const k = 2 * (dx * nx + dy * ny); return { x: dx - k * nx, y: dy - k * ny }; }

  /** Volumetric sample points of a defect, cached per defect object. */
  function samplesOf(d) {
    let s = sampleCache.get(d);
    if (!s) { s = UT.specimens.defectSamples(d); sampleCache.set(d, s); }
    return s;
  }

  /**
   * Emission point and launch direction of the probe on the specimen.
   * @returns {{E:{x:number,y:number}, u0:{x:number,y:number}, tangent, normal, segment}}
   */
  function emission(specimen, probe, derived) {
    const ss = UT.specimens.scanSurfaceAt(specimen, probe);
    const side = probe.side === -1 ? -1 : 1;
    const th = (derived && derived.refracted) || 0;
    return {
      E: { x: ss.x, y: ss.y }, tangent: ss.tangent, normal: ss.normal, segment: ss.segment, side,
      u0: dirAt(ss, side, th),
    };
  }

  /** Direction for a refracted angle (deg) from the surface normal, steered toward the beam side. */
  function dirAt(ss, side, angleDeg) {
    const a = angleDeg * DEG;
    const c = Math.cos(a), s = Math.sin(a);
    return norm(ss.normal.x * c - side * ss.tangent.x * s, ss.normal.y * c - side * ss.tangent.y * s);
  }

  /** Ray–arc intersection (exact circle restricted to the arc's angular span). Nearest positive t or null. */
  function arcHit(px, py, dx, dy, arc, eps) {
    const fx = px - arc.cx, fy = py - arc.cy;
    const b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - arc.r * arc.r;
    const disc = b * b - 4 * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const roots = [(-b - sq) / 2, (-b + sq) / 2];
    let a0 = arc.a0, a1 = arc.a1;
    if (a1 < a0) { const t = a0; a0 = a1; a1 = t; }
    for (const t of roots) {
      if (t < eps) continue;
      const x = px + dx * t, y = py + dy * t;
      let ang = Math.atan2(y - arc.cy, x - arc.cx) / DEG;
      while (ang < a0 - 1e-9) ang += 360;
      while (ang > a1 + 1e-9 && ang - 360 >= a0 - 1e-9) ang -= 360;
      if (ang >= a0 - 1e-9 && ang <= a1 + 1e-9) {
        const n = norm(x - arc.cx, y - arc.cy);
        return { t, x, y, nx: n.x, ny: n.y };
      }
    }
    return null;
  }

  function tagKind(tag) {
    switch (tag) {
      case 'bottom': return 'backwall';
      case 'radius': return 'radius';
      case 'top': return 'backwall';
      case 'step': return 'backwall';
      default: return 'geometry';   // end, cap, root, brace, fusion, backing, web, interface …
    }
  }

  // ------------------------------------------------------------------ mode-conversion coefficients (§3.2)
  /** Energy fraction converted L → S at incidence φ (deg from the normal); closed-form fit. */
  function R_LS(phi) {
    if (!(phi > 0)) return 0;
    if (phi <= 62) { const s = Math.sin(Math.PI / 2 * phi / 62); return 0.95 * s * s; }
    if (phi >= 90) return 0;
    const c = Math.cos(Math.PI / 2 * (phi - 62) / 28);
    return 0.95 * c * c;
  }
  /** Energy fraction converted S → L at incidence φ below the critical angle φc (deg); 0 beyond. */
  function R_SL(phi, phiC) {
    if (!(phi > 0) || !(phiC > 0) || phi >= phiC) return 0;
    return 0.85 * Math.pow(phi / phiC, 1.5);
  }
  /**
   * Mode-conversion coefficient and outgoing angle for an incident mode at φ (deg from the normal).
   * @param {'S'|'L'} mode incident mode
   * @param {number} phiDeg incidence angle
   * @param {{vShear:number, vComp:number}} [mat] material (carbon steel default)
   * @returns {{R:number, phiOut:number|null}}
   */
  function modeConvCoef(mode, phiDeg, mat) {
    const vS = (mat && mat.vShear) || UT.consts.V_SHEAR_STEEL, vL = (mat && mat.vComp) || UT.consts.V_COMP_STEEL;
    const phi = Math.abs(+phiDeg || 0);
    if (mode === 'L') {
      const s = Math.sin(phi * DEG) * vS / vL;
      return { R: R_LS(phi), phiOut: s < 1 ? Math.asin(s) / DEG : null };
    }
    const phiC = Math.asin(Math.min(1, vS / vL)) / DEG;
    const s = Math.sin(phi * DEG) * vL / vS;
    return { R: R_SL(phi, phiC), phiOut: s < 1 ? Math.asin(s) / DEG : null };
  }

  // ------------------------------------------------------------------ scene assembly
  /** Flattened outline geometry of a specimen (cached): edges with direction + unit normal (+ typed arrays). */
  function geometryOf(specimen) {
    let g = geomCache.get(specimen);
    if (g) return g;
    const edges = [];
    for (const ed of specimen.edges || []) {
      const ex = ed.b.x - ed.a.x, ey = ed.b.y - ed.a.y;
      const n = norm(-ey, ex);
      edges.push({ ax: ed.a.x, ay: ed.a.y, ex, ey, nx: n.x, ny: n.y, tag: ed.tag, edge: ed });
    }
    // weld beads (SPEC NOTE 25): each run of consecutive 'cap'/'root' edges gets its base chord (first
    // vertex → last vertex, i.e. the plate surface it sits on), the chord's unit normal and the side of the
    // chord the bead crown lies on
    const beads = [];
    for (let i = 0; i < edges.length;) {
      const tag = edges[i].tag;
      if (tag !== 'cap' && tag !== 'root') { i++; continue; }
      let j = i;
      while (j + 1 < edges.length && edges[j + 1].tag === tag) j++;
      const a = edges[i], b = edges[j];
      const cx = b.ax + b.ex - a.ax, cy = b.ay + b.ey - a.ay;
      if (Math.hypot(cx, cy) > 1e-6) {
        const n = norm(-cy, cx);
        let crown = 0;
        for (let k = i; k <= j; k++) { const s = (edges[k].ax - a.ax) * n.x + (edges[k].ay - a.ay) * n.y; if (Math.abs(s) > Math.abs(crown)) crown = s; }
        const bead = { tag, ax: a.ax, ay: a.ay, ex: cx, ey: cy, nx: n.x, ny: n.y, crownSign: crown < 0 ? -1 : 1 };
        beads.push(bead);
        for (let k = i; k <= j; k++) edges[k].bead = bead;
      }
      i = j + 1;
    }
    // typed copy for the hot intersection loop (ax, ay, ex, ey per edge)
    const ef = new Float64Array(edges.length * 4);
    for (let i = 0; i < edges.length; i++) { ef[i * 4] = edges[i].ax; ef[i * 4 + 1] = edges[i].ay; ef[i * 4 + 2] = edges[i].ex; ef[i * 4 + 3] = edges[i].ey; }
    // generic planar reflectors outside the outline (v2 §3.8: FBH bars, fillet interface) — SPEC NOTE 35
    const reflectors = [];
    for (const r of specimen.reflectors || []) {
      if (!r || !r.a || !r.b) continue;
      const ex = r.b.x - r.a.x, ey = r.b.y - r.a.y;
      if (Math.hypot(ex, ey) < 1e-6) continue;
      const n = norm(-ey, ex);
      const isFbh = r.tag === 'fbh';
      reflectors.push({ a: r.a, b: r.b, ax: r.a.x, ay: r.a.y, ex, ey, nx: n.x, ny: n.y, refl: true, tag: r.tag || 'reflector',
        kind: isFbh ? 'fbh' : 'geometry', S: 1, dExp: 0.5, fbhD: isFbh ? (r.d || Math.hypot(ex, ey)) : 0, label: r.label, defect: null, beads: null });
    }
    g = { edges, ef, arcs: (specimen.arcs || []).slice(), perspex: specimen.perspex || null, beads, reflectors };
    geomCache.set(specimen, g);
    return g;
  }

  /** True when a defect bbox touches the specimen extents (padded ~5 mm); no extents → keep it. */
  function overlapsSpecimen(bb, specimen) {
    const ex = specimen && specimen.extents;
    if (!ex || !Number.isFinite(bb.xMin) || !Number.isFinite(bb.yMin)) return true;
    const pad = 5;
    return bb.xMax >= ex.xMin - pad && bb.xMin <= ex.xMax + pad && bb.yMax >= ex.yMin - pad && bb.yMin <= ex.yMax + pad;
  }

  /** Build the reflector lists once per trace: defect segments, diffuse points, hole discs. */
  function buildScene(specimen, defects, probe) {
    const segs = [];      // specular planar defect segments + generic reflectors
    const points = [];    // diffuse scatterers
    const vols = [];      // volumetric defect polygons (TT extinction, SPEC NOTE 16)
    const list = Array.isArray(defects) ? defects : [];
    const g = geometryOf(specimen);
    for (const d of list) {
      if (!d || d.visible === false || !Array.isArray(d.pts) || d.pts.length < 2) continue;
      const refl = d.reflectivity === undefined ? 1 : d.reflectivity;
      const bb = UT.specimens.bbox(d.pts);
      if (!overlapsSpecimen(bb, specimen)) continue;   // off-specimen defect: nothing to reflect (saves the sampling work)
      const height = d.height === undefined ? Math.max(0.5, bb.h) : d.height;
      if (UT.specimens.isPlanar(d.type)) {
        const isLam = d.type === 'lamination';
        const size = isLam ? Math.max(bb.w, height, d.width || 0) : height;
        const S = Math.min(1.2, size / 4) * refl;
        for (let i = 0; i < d.pts.length - 1; i++) {
          const a = d.pts[i], b = d.pts[i + 1];
          if (M.dist(a.x, a.y, b.x, b.y) < 1e-6) continue;
          const n = norm(-(b.y - a.y), b.x - a.x);
          const seg = { a, b, ax: a.x, ay: a.y, ex: b.x - a.x, ey: b.y - a.y, nx: n.x, ny: n.y, defect: d, S, kind: isLam ? 'lamination' : 'defect', beads: null, refl: false };
          if (!isLam) {
            // beads this segment reaches at an end → crack–bead corner pairs use the flat base normal (SPEC NOTE 25)
            for (const bead of g.beads) if (reachesBead(a.x, a.y, bead) || reachesBead(b.x, b.y, bead)) (seg.beads || (seg.beads = [])).push(bead);
          }
          segs.push(seg);
        }
        // tips (diffraction) — not at surface-breaking ends (SPEC NOTE 26)
        const first = d.pts[0], last = d.pts[d.pts.length - 1];
        if (distToOutline(first.x, first.y, g) > TIP_SURFACE_TOL) points.push({ x: first.x, y: first.y, kind: 'tip', S: 0.12 * refl, dExp: 2, cap: 0, defect: d });
        if (distToOutline(last.x, last.y, g) > TIP_SURFACE_TOL) points.push({ x: last.x, y: last.y, kind: 'tip', S: 0.12 * refl, dExp: 2, cap: 0, defect: d });
      } else {
        const sm = samplesOf(d);
        const n = Math.max(1, sm.length);
        const S = Math.min(1, height / 3) * refl / Math.sqrt(n);
        for (const p of sm) points.push({ x: p.x, y: p.y, kind: 'defect', vol: true, S, dExp: 2, cap: 0, defect: d });
        if (d.pts.length >= 3) vols.push({ pts: d.pts, refl, defect: d });
      }
    }
    // v2 reflectors (SPEC NOTE 35): specular segments + tip scatter at free ends
    for (const r of g.reflectors) {
      segs.push(r);
      if (distToOutline(r.a.x, r.a.y, g) > TIP_SURFACE_TOL) points.push({ x: r.a.x, y: r.a.y, kind: 'tip', S: 0.12, dExp: 2, cap: 0, tag: r.tag + '-tip', label: r.label });
      if (distToOutline(r.b.x, r.b.y, g) > TIP_SURFACE_TOL) points.push({ x: r.b.x, y: r.b.y, kind: 'tip', S: 0.12, dExp: 2, cap: 0, tag: r.tag + '-tip', label: r.label });
    }
    const holes = [];     // hole discs: diffuse capture point + beam-coverage shadow (SPEC NOTE 20)
    for (const h of specimen.holes || []) {
      if (!h || !(h.r > 0)) continue;
      const dia = 2 * h.r;
      points.push({ x: h.x, y: h.y, kind: 'sdh', S: Math.min(1, Math.sqrt(dia / 3)), dExp: 1.5, cap: h.r + 0.5, tag: h.tag || 'sdh', label: h.label || (dia + 'mm'), hole: h,
        back: h.r > SDH_CENTRE_MAX_R ? h.r : 0 });   // SPEC NOTE 24: large holes echo from their near surface
      holes.push({ x: h.x, y: h.y, r: h.r });
    }
    for (let i = 0; i < points.length; i++) points[i].idx = i;
    // typed copy of the segments for the hot loop (ax, ay, ex, ey, nx, ny)
    const sf = new Float64Array(segs.length * 6);
    for (let i = 0; i < segs.length; i++) { const s = segs[i]; sf[i * 6] = s.ax; sf[i * 6 + 1] = s.ay; sf[i * 6 + 2] = s.ex; sf[i * 6 + 3] = s.ey; sf[i * 6 + 4] = s.nx; sf[i * 6 + 5] = s.ny; }
    const sdhPoints = points.filter(function (P) { return P.kind === 'sdh'; });   // holes-only list for cheap branches (SPEC NOTES 29/30/39)
    return { segs, sf, points, sdhPoints, vols, holes, edges: g.edges, ef: g.ef, arcs: g.arcs, perspex: g.perspex };
  }

  /** Distance from a point to the nearest outline edge or arc of the flattened geometry. */
  function distToOutline(x, y, g) {
    let best = Infinity;
    for (const ed of g.edges) {
      const l2 = ed.ex * ed.ex + ed.ey * ed.ey;
      const u = l2 > 0 ? M.clamp(((x - ed.ax) * ed.ex + (y - ed.ay) * ed.ey) / l2, 0, 1) : 0;
      const d = Math.hypot(x - ed.ax - ed.ex * u, y - ed.ay - ed.ey * u);
      if (d < best) best = d;
    }
    for (const arc of g.arcs) {
      let a0 = arc.a0, a1 = arc.a1;
      if (a1 < a0) { const t = a0; a0 = a1; a1 = t; }
      let ang = Math.atan2(y - arc.cy, x - arc.cx) / DEG;
      while (ang < a0 - 1e-9) ang += 360;
      while (ang > a1 + 1e-9 && ang - 360 >= a0 - 1e-9) ang -= 360;
      let d;
      if (ang >= a0 - 1e-9 && ang <= a1 + 1e-9) d = Math.abs(Math.hypot(x - arc.cx, y - arc.cy) - arc.r);
      else d = Math.min(M.dist(x, y, arc.cx + arc.r * Math.cos(a0 * DEG), arc.cy + arc.r * Math.sin(a0 * DEG)),
        M.dist(x, y, arc.cx + arc.r * Math.cos(a1 * DEG), arc.cy + arc.r * Math.sin(a1 * DEG)));
      if (d < best) best = d;
    }
    return best;
  }

  /** True when a point lies within BEAD_REACH of a bead's base chord (inside its span) or beyond it on the crown side (SPEC NOTE 25). */
  function reachesBead(x, y, bead) {
    const l2 = bead.ex * bead.ex + bead.ey * bead.ey;
    const u = ((x - bead.ax) * bead.ex + (y - bead.ay) * bead.ey) / l2;
    if (u < 0 || u > 1) return false;
    const sd = ((x - bead.ax) * bead.nx + (y - bead.ay) * bead.ny) * bead.crownSign;
    return sd >= -BEAD_REACH;
  }

  /** Length of the ray segment [pos, pos + dir·L] inside a closed polygon (sum of chords). */
  function chordThrough(poly, px, py, dx, dy, L) {
    const ts = [];
    for (let i = 0; i < poly.length - 1; i++) {
      const ax = poly[i].x, ay = poly[i].y, ex = poly[i + 1].x - ax, ey = poly[i + 1].y - ay;
      const den = dx * ey - dy * ex;
      if (den > -1e-12 && den < 1e-12) continue;
      const t = ((ax - px) * ey - (ay - py) * ex) / den;
      if (t <= 0 || t >= L) continue;
      const u = ((ax - px) * dy - (ay - py) * dx) / den;
      if (u < 0 || u > 1) continue;
      ts.push(t);
    }
    let inside = M.pointInPolygon(px, py, poly), prev = 0, chord = 0;
    if (ts.length) {
      ts.sort(function (a, b) { return a - b; });
      for (const t of ts) { if (inside) chord += t - prev; inside = !inside; prev = t; }
    }
    if (inside) chord += L - prev;
    return chord;
  }

  /** Extra one-way attenuation (dB) of a segment through austenitic weld metal (SPEC NOTE 31); 0 when not enabled. */
  function weldExtraDb(C, ax, ay, bx, by) {
    if (!(C.weldExtra > 0)) return 0;
    return C.weldExtra * UT.specimens.segmentInRegion(C.specimen, { x: ax, y: ay }, { x: bx, y: by });
  }

  // ------------------------------------------------------------------ per-ray march
  /**
   * March one fan ray (all its branches). Returns { pts, legs, echoes, hits, transmitted, w }.
   * @param {object} C  trace context
   * @param {object} R  ray descriptor {delta, w, dir0, off, main, side, focused}
   */
  function marchRay(C, R) {
    const w = R.w;
    const delta = R.delta;
    const dir0 = R.dir0;
    const o = R.off || 0;
    const E0 = { x: C.E.x + C.ss.tangent.x * o, y: C.E.y + C.ss.tangent.y * o };
    const rx0 = C.rx ? { x: C.rx.x + C.ss.tangent.x * o, y: C.rx.y + C.ss.tangent.y * o } : null;
    const pts = [{ x: E0.x, y: E0.y, leg: 1 }];
    const legs = [];
    const echoes = [];
    const hits = [];
    let transmitted = 0;
    const isCentre = Math.abs(delta) < 1e-9 && !R.focused;
    const scene = C.scene;
    const tan20 = C.tan20;
    const sideLobe = !!R.side;
    const legLimit = sideLobe ? Math.min(C.maxLegs, SIDE_LEGS) : C.maxLegs;
    const canConvert = C.modeConv && R.main && w >= CONV_MIN_W && !C.tt && !C.tandem;
    const capScale = R.focused ? FOCUS_CAPTURE : 1;
    // Branch stack (SPEC NOTE 19): a ray meeting a planar defect segment whose z-overlap is partial
    // splits into a reflected branch (weight Z) and a transmitted branch (weight sqrt(1 − Z²)).
    // Mode conversion (SPEC NOTE 30) spawns one converted branch per fan ray.
    const branches = [{
      pos: { x: E0.x + dir0.x * STEP_OFF, y: E0.y + dir0.y * STEP_OFF }, dir: { x: dir0.x, y: dir0.y },
      len: 0, tUs: 0, att: 0, mode: C.probeMode, bounces: 0, leg: 1, e: 1, hist: [], sawDefect: false, sawBottom: false, slotPending: false,
      fromTag: 'top', zs: [], tw: 1, draw: true, iter: 0, conv: null, noSpawn: sideLobe,
    }];
    let spawned = 0;
    let convDone = false;
    const splitDone = new Set();   // defects already split on this fan ray (one split per defect, SPEC NOTE 19)

    while (branches.length) {
      const B = branches.pop();
      let pos = B.pos, dir = B.dir, len = B.len, tUs = B.tUs, att = B.att, mode = B.mode, bounces = B.bounces, leg = B.leg, e = B.e;
      const hist = B.hist;
      let sawDefect = B.sawDefect, sawBottom = B.sawBottom, slotPending = B.slotPending, fromTag = B.fromTag;
      let zs = B.zs, tw = B.tw, draw = B.draw;
      const conv = B.conv;            // null for the primary ray; {first, legCap, re, poly} for a converted branch
      const noSpawn = B.noSpawn;
      let v = mode === 'L' ? C.vL : C.vS;
      let alpha = mode === 'L' ? C.alphaL : C.alphaS;
      const myLegLimit = conv ? conv.legCap : legLimit;

      for (let iter = B.iter; iter < 200; iter++) {
        if (bounces > myLegLimit + 5 || len > C.maxLen || leg > myLegLimit) break;
        // ---- nearest intersection (typed arrays, no allocation until the winner is known)
        let bestT = Infinity, bestI = -1, bestType = 0;   // 1 edge, 2 arc, 3 perspex, 4 segment (defect/reflector)
        let bestNx = 0, bestNy = 0;
        const px = pos.x, py = pos.y, dx = dir.x, dy = dir.y;
        const ef = scene.ef;
        for (let i = 0, k = 0; k < ef.length; i++, k += 4) {
          const ax = ef[k], ay = ef[k + 1], ex = ef[k + 2], ey = ef[k + 3];
          const den = dx * ey - dy * ex;
          if (den > -1e-12 && den < 1e-12) continue;
          const t = ((ax - px) * ey - (ay - py) * ex) / den;
          if (t < EPS || t >= bestT) continue;
          const u = ((ax - px) * dy - (ay - py) * dx) / den;
          if (u < 0 || u > 1) continue;
          bestT = t; bestI = i; bestType = 1;
        }
        for (let i = 0; i < scene.arcs.length; i++) {
          const h = arcHit(px, py, dx, dy, scene.arcs[i], EPS);
          if (h && h.t < bestT + 1e-7) { bestT = h.t; bestI = i; bestType = 2; bestNx = h.nx; bestNy = h.ny; }   // ties → arc
        }
        if (scene.perspex) {
          const h = M.rayCircle(px, py, dx, dy, scene.perspex.x, scene.perspex.y, scene.perspex.r, EPS);
          if (h && h.t < bestT) { bestT = h.t; bestI = 0; bestType = 3; }
        }
        const sf = scene.sf;
        for (let i = 0, k = 0; k < sf.length; i++, k += 6) {
          const dn = dx * sf[k + 4] + dy * sf[k + 5];
          if (dn > -GRAZE_COS && dn < GRAZE_COS) continue;   // grazing: pass through
          const ax = sf[k], ay = sf[k + 1], ex = sf[k + 2], ey = sf[k + 3];
          const den = dx * ey - dy * ex;
          if (den > -1e-12 && den < 1e-12) continue;
          const t = ((ax - px) * ey - (ay - py) * ex) / den;
          if (t < EPS || t >= bestT) continue;
          const u = ((ax - px) * dy - (ay - py) * dx) / den;
          if (u < 0 || u > 1) continue;
          bestT = t; bestI = i; bestType = 4;
        }
        let best = null;
        if (bestType === 1) { const ed = scene.edges[bestI]; best = { t: bestT, x: px + dx * bestT, y: py + dy * bestT, nx: ed.nx, ny: ed.ny, type: 'outline', tag: ed.tag, bead: ed.bead || null }; }
        else if (bestType === 2) best = { t: bestT, x: px + dx * bestT, y: py + dy * bestT, nx: bestNx, ny: bestNy, type: 'outline', tag: scene.arcs[bestI].tag || 'radius' };
        else if (bestType === 3) { const hx = px + dx * bestT, hy = py + dy * bestT; const n = norm(hx - scene.perspex.x, hy - scene.perspex.y); best = { t: bestT, x: hx, y: hy, nx: n.x, ny: n.y, type: 'perspex', tag: 'perspex' }; }
        else if (bestType === 4) { const sg = scene.segs[bestI]; best = { t: bestT, x: px + dx * bestT, y: py + dy * bestT, nx: sg.nx, ny: sg.ny, type: sg.refl ? 'reflector' : 'defect', tag: sg.kind, seg: sg }; }
        if (!best) break;
        const L = best.t;
        const segExtra = weldExtraDb(C, px, py, best.x, best.y);   // austenitic weld metal on this segment (one-way dB)

        // ---- diffuse scatterers along the segment
        if (!C.tt && !C.tandem) {
          const cheapOnly = sideLobe || conv !== null || leg > DEEP_LEGS;   // SPEC NOTES 29/30/39: side-lobe, converted and deep-leg branches sample holes only
          const points = cheapOnly ? scene.sdhPoints : scene.points;
          for (let pi = 0; pi < points.length; pi++) {
            const P = points[pi];
            const rx = P.x - px, ry = P.y - py;
            const u = rx * dx + ry * dy;
            if (u <= 1e-6 || u >= L) continue;
            const d = Math.abs(rx * dy - ry * dx);
            const c = 0.5 + 0.03 * (len + u);
            let cap = Math.max(c, P.cap);
            if (capScale !== 1) cap = Math.max(FOCUS_CAPTURE_MIN, cap * capScale);
            if (d > cap) continue;
            const lenMm = Math.max(0, len + u - (P.back || 0));
            const taper = Math.cos(Math.PI / 2 * d / cap);
            const attP = 2 * (att + alpha * u + segExtra * (u / L));
            const isConv = conv !== null;
            const key = P.vol ? (P.idx * 2 + (isConv ? 1 : 0)) * 64 + leg : 0;
            let cur = null;
            if (P.vol) {
              // cheap upper bound of the amplitude first: skip captures that cannot beat the current best (SPEC NOTE 17)
              cur = C.volBest.get(key);
              if (cur) {
                const qq = C.nearField / Math.max(lenMm, C.nearField);
                const bound = w * w * e * P.S * qq * qq * taper * Math.pow(10, -attP / 20) * C.transferLin * C.Gf(lenMm) * C.nearBoost(lenMm) * (isConv && mode !== C.probeMode ? 0.5 : 1);
                if (bound * tw <= cur.amp && bound <= cur.ampNoZ) continue;
              }
            }
            const ec = makeEcho(C, { lenMm, tUs: 2 * (tUs + u / v), att: attP, mode, conv: isConv ? conv.first : null,
              kind: isConv ? 'modeconv' : P.kind, leg, x: P.x, y: P.y, w, wReturn: w * (isConv && mode !== C.probeMode ? 0.5 : 1), e, S: P.S, dExp: P.dExp,
              defect: P.defect, tag: isConv ? (P.tag || P.kind) : P.tag, label: P.label, angleDev: delta, extra: taper, zs, tw });
            if (P.vol) {
              // one entry per scatterer point and leg: the loudest capture over the fan (SPEC NOTE 17)
              if (!cur || ec.amp > cur.amp || (ec.amp === cur.amp && ec.ampNoZ > cur.ampNoZ)) C.volBest.set(key, ec);
            } else echoes.push(ec);
          }
        } else if (C.tt && scene.vols.length) {
          // extinction through volumetric defects (SPEC NOTE 16)
          for (const V of scene.vols) {
            const chord = chordThrough(V.pts, px, py, dx, dy, L);
            if (chord <= 0) continue;
            const zf = zOverlap(V.defect, C.probeZ, C.crystalB / 2 + (len + L) * C.tan20z, C.L, C.wrap);
            e *= Math.pow(10, -TT_EXTINCTION * V.refl * zf * zf * chord / 20);
          }
        }
        // ---- hole shadow (SPEC NOTE 20): a hole inside the beam band attenuates everything beyond it by
        //      the uncovered fraction of the beam width at that depth (holes span all z)
        for (let i = 0; i < scene.holes.length; i++) {
          const H = scene.holes[i];
          const rx = H.x - px, ry = H.y - py;
          const u = rx * dx + ry * dy;
          if (u <= 1e-6 || u >= L) continue;
          const d = rx * dy - ry * dx;
          const half = C.diameter / 2 + (len + u) * tan20;
          const ov = M.overlap(d - H.r, d + H.r, -half, half);
          if (ov <= 0) continue;
          e *= Math.max(0, 1 - ov / (2 * half));
        }

        // ---- move
        len += L;
        tUs += L / v;
        att += alpha * L + segExtra;
        const hp = { x: best.x, y: best.y };
        if (draw) {
          pts.push({ x: hp.x, y: hp.y, leg });
          legs.push({ a: { x: px, y: py }, b: hp, leg, surfaceTag: fromTag, hitTag: best.tag });
        }
        if (conv) conv.poly.pts.push({ x: hp.x, y: hp.y, leg });

        // through transmission receiver test (first outline hit only)
        if (C.tt && best.type === 'outline' && leg === 1 && rx0) {
          const dPerp = Math.abs((hp.x - rx0.x) * C.u0.y - (hp.y - rx0.y) * C.u0.x);   // distance from the sub-aperture's centre-ray line
          if (dPerp <= C.diameter / 2 && M.dist(hp.x, hp.y, rx0.x, rx0.y) <= C.diameter) transmitted += w * e * tw;
        }

        // ---- z-overlap split at a planar defect segment (SPEC NOTE 19)
        if (best.type === 'defect') {
          const sd = best.seg.defect;
          const hzHit = len * C.tan20z + C.crystalB / 2;
          const Zs = zOverlap(sd, C.probeZ, hzHit, C.L, C.wrap);
          if (Zs < 1 || (sd.zFrom !== undefined && sd.zTo !== undefined)) {
            const Ts = Math.sqrt(Math.max(0, 1 - Zs * Zs));
            const transDominant = Zs * Zs < 0.5;
            if (tw > 0 && !noSpawn && !conv && spawned < MAX_SPLITS && !splitDone.has(sd)) {
              // queue the transmitted branch (weight Ts) and continue below with the reflected one (weight Zs);
              // the drawn polyline follows the dominant side
              spawned++;
              splitDone.add(sd);
              branches.push({
                pos: { x: hp.x + dx * STEP_OFF, y: hp.y + dy * STEP_OFF }, dir: { x: dx, y: dy },
                len, tUs, att, mode, bounces, leg, e, hist: hist.slice(), sawDefect, sawBottom, slotPending: false, fromTag,
                zs: zs.concat([{ defect: sd, hz: hzHit, trans: true }]), tw: tw * Ts, draw: draw && transDominant, iter: iter + 1, conv: null, noSpawn: false,
              });
              if (transDominant) draw = false;
              zs = zs.concat([{ defect: sd, hz: hzHit, trans: false }]);
              tw *= Zs;
            } else if (transDominant) {
              // no split budget (or a dead / converted / side-lobe branch): follow the dominant side only — pass through
              zs = zs.concat([{ defect: sd, hz: hzHit, trans: true }]);
              tw *= Ts;
              pos = { x: hp.x + dx * STEP_OFF, y: hp.y + dy * STEP_OFF };
              slotPending = false;
              continue;
            } else {
              zs = zs.concat([{ defect: sd, hz: hzHit, trans: false }]);
              tw *= Zs;
            }
          }
        }

        // ---- reflect
        let nd;
        const retro = slotPending && best.type === 'outline' && best.tag === 'top' && M.dist(hp.x, hp.y, C.E.x, C.E.y) <= 1.0;
        if (retro) {
          nd = { x: C.u0.x, y: C.u0.y };
          pos = { x: C.E.x + nd.x * STEP_OFF, y: C.E.y + nd.y * STEP_OFF };
          e *= 0.5;
          bounces++; leg++;
          fromTag = 'top';
          hist.push({ type: 'outline', tag: 'top', x: hp.x, y: hp.y, leg: leg - 1, inc: 0 });
        } else {
          // crack–bead corner pair (SPEC NOTE 25): the bead reflects like the plate surface it sits on
          const flatBead = best.bead && !C.tt && !C.tandem && cornerBead(best, hist, hp, dir, scene);
          if (flatBead) { best.nx = best.bead.nx; best.ny = best.bead.ny; }
          nd = reflect(dx, dy, best.nx, best.ny);
          pos = { x: hp.x + nd.x * STEP_OFF, y: hp.y + nd.y * STEP_OFF };
          bounces++;
          const legAtHit = leg;
          const cosInc = M.clamp(Math.abs(dot(dx, dy, best.nx, best.ny)), 0, 1);
          const incDeg = Math.acos(cosInc) / DEG;
          if (best.type === 'outline') {
            leg++;
            e *= best.tag === 'top' ? TOP_LOSS : OTHER_LOSS;
            if (best.tag === 'bottom') sawBottom = true;
            fromTag = best.tag;
            // rough weld bead: weak diffuse geometry scatter (SPEC NOTE 2)
            if (!C.tt && !C.tandem && (best.tag === 'cap' || best.tag === 'root')) {
              const slope = Math.min(1, Math.abs(best.nx) / 0.5);   // 0 for a flat bead (SPEC NOTE 2)
              if (slope > 1e-6) echoes.push(makeEcho(C, { lenMm: len, tUs: 2 * tUs, att: 2 * att, mode, conv: conv ? conv.first : null, kind: conv ? 'modeconv' : 'geometry', leg: leg - 1, x: hp.x, y: hp.y, w, wReturn: w * (conv && mode !== C.probeMode ? 0.5 : 1), e: e / OTHER_LOSS, S: BEAD_SCATTER * cosInc * slope, dExp: 1.5, tag: best.tag, angleDev: delta, zs, tw }));
            }
            if ((best.tag === 'cap' || best.tag === 'root') && !flatBead) e *= BEAD_SPECULAR;   // convex bead diverges the specular reflection (SPEC NOTE 21)
          } else if (best.type === 'perspex') {
            e *= OTHER_LOSS;
            fromTag = 'perspex';
            if (isCentre && C.theta === 0 && C.mode === 'comp' && !conv) {
              const p = scene.perspex;
              const extra = 2 * p.r * (C.vel / (UT.consts.V_PERSPEX));
              echoes.push(makeEcho(C, { lenMm: len + extra, tUs: 2 * (tUs + extra / v), att: 2 * att, mode, conv: null, kind: 'perspex', leg, x: p.x, y: p.y + p.r, w, wReturn: w, e, S: 0.2, dExp: 0.5, tag: 'perspex', angleDev: delta, zs, tw }));
            }
          } else if (best.type === 'reflector') {
            fromTag = best.tag;
          } else {
            sawDefect = true;
            fromTag = 'defect';
          }
          hist.push({ type: best.type, tag: best.tag, x: hp.x, y: hp.y, seg: best.seg, leg: legAtHit, inc: incDeg });

          // ---- mode conversion (SPEC NOTE 30)
          if (canConvert && best.type !== 'perspex' && incDeg > 0.05) {
            const Rc = mode === 'L' ? R_LS(incDeg) : R_SL(incDeg, C.phiC);
            if (Rc > 0) {
              const vOther = mode === 'L' ? C.vS : C.vL;
              const sinOut = Math.sin(incDeg * DEG) * vOther / v;
              if (sinOut < 1) {
                const cosOut = Math.sqrt(1 - sinOut * sinOut);
                const dn = dx * best.nx + dy * best.ny;
                const tx = -best.ny, ty = best.nx;
                const dt = dx * tx + dy * ty;
                const sn = dn < 0 ? 1 : -1, st = dt < 0 ? -1 : 1;
                const dOut = { x: sn * cosOut * best.nx + st * sinOut * tx, y: sn * cosOut * best.ny + st * sinOut * ty };
                // R is an ENERGY fraction; e is an amplitude factor → √R converted, √(1 − R) specular (SPEC NOTE 30)
                const aR = Math.sqrt(Rc), aK = Math.sqrt(1 - Rc);
                if (!conv) {
                  if (!convDone && e * aR >= CONV_MIN_E) {
                    convDone = true;
                    const other = mode === 'L' ? 'S' : 'L';
                    const poly = { mode: other, kindTag: other, pts: [{ x: hp.x, y: hp.y, leg }], weight: w * e * aR * tw };
                    C.convPolys.push(poly);
                    branches.push({
                      pos: { x: hp.x + dOut.x * STEP_OFF, y: hp.y + dOut.y * STEP_OFF }, dir: dOut,
                      len, tUs, att, mode: other, bounces, leg, e: e * aR, hist: hist.slice(), sawDefect, sawBottom, slotPending: false, fromTag,
                      zs, tw, draw: false, iter: iter + 1, conv: { first: other, legCap: leg + CONV_LEGS, re: false, poly }, noSpawn: true,
                    });
                    e *= aK;
                  }
                } else if (!conv.re) {
                  if (Rc >= CONV_BACK) {
                    // dominant path: re-convert back (once), new drawing entry
                    conv.re = true;
                    mode = mode === 'L' ? 'S' : 'L';
                    v = mode === 'L' ? C.vL : C.vS;
                    alpha = mode === 'L' ? C.alphaL : C.alphaS;
                    e *= aR;
                    nd = dOut;
                    pos = { x: hp.x + nd.x * STEP_OFF, y: hp.y + nd.y * STEP_OFF };
                    conv.poly = { mode, kindTag: mode, pts: [{ x: hp.x, y: hp.y, leg }], weight: w * e * tw };
                    C.convPolys.push(conv.poly);
                  } else e *= aK;
                }
              }
            }
          }
        }
        if (hist.length > 2) hist.shift();
        dir = nd;
        if (leg <= 3 && tw > 0 && !conv) hits.push({ x: hp.x, y: hp.y, kind: best.tag, tag: best.tag, defectId: best.seg && best.seg.defect ? best.seg.defect.id : undefined });
        slotPending = false;

        // ---- return-to-probe test
        if (C.segment && !C.tt && (dir.x * C.ss.normal.x + dir.y * C.ss.normal.y) < 0) {
          const cross = M.raySegment(pos.x, pos.y, dir.x, dir.y, C.segment.a.x, C.segment.a.y, C.segment.b.x, C.segment.b.y, EPS);
          if (cross) {
            if (C.tandem) {
              const dRx = M.dist(cross.x, cross.y, C.rx.x, C.rx.y);
              const dev = M.angleBetween(dir.x, dir.y, C.rxDir.x, C.rxDir.y);
              if (sawDefect && sawBottom && dRx <= C.diameter / 2 && dev < C.devMax) {
                const info = returnInfo(hist);
                if (info.kind === 'defect' || info.kind === 'corner' || info.kind === 'lamination') {
                  const back = alpha * cross.t + weldExtraDb(C, pos.x, pos.y, cross.x, cross.y);
                  echoes.push(makeEcho(C, { lenMm: (len + cross.t) / 2, tUs: tUs + cross.t / v, att: att + back, mode, conv: conv ? conv.first : null, kind: conv ? 'modeconv' : 'defect', leg: info.leg, x: info.x, y: info.y, w, wReturn: C.dirW(dev) * (conv && mode !== C.probeMode ? 0.5 : 1), e, S: info.S, dExp: info.dExp, defect: info.defect, tag: 'tandem', angleDev: delta, zs, tw }));
                }
              }
            } else {
              const dE = M.dist(cross.x, cross.y, C.E.x, C.E.y);
              const ra = C.diameter / 2 + (len + cross.t) * Math.sin(C.th6 * DEG);
              const dev = M.angleBetween(dir.x, dir.y, -C.u0.x, -C.u0.y);
              const tail = AP_TAIL * C.diameter;
              if (dE < ra + tail && dev < C.devMax) {
                // full weight inside ra, cos² taper to 0 over the next AP_TAIL·D (SPEC NOTE 18)
                const wAp = dE <= ra ? 1 : Math.pow(Math.cos(Math.PI / 2 * (dE - ra) / tail), 2);
                const info = returnInfo(hist);
                const back = alpha * cross.t + weldExtraDb(C, pos.x, pos.y, cross.x, cross.y);
                echoes.push(makeEcho(C, { lenMm: (len + cross.t) / 2, tUs: tUs + cross.t / v, att: att + back, mode, conv: conv ? conv.first : null, kind: conv ? 'modeconv' : info.kind, leg: info.leg, x: info.x, y: info.y, w, wReturn: C.dirW(dev) * wAp * (conv && mode !== C.probeMode ? 0.5 : 1), e, S: info.S, dExp: info.dExp, defect: info.defect, tag: info.tag, label: info.label, fbhD: info.fbhD, angleDev: delta, zs, tw }));
                if (C.retroSlot && dE <= 1.0 && !conv) slotPending = true;
              }
            }
          }
        }
      }
    }
    return { pts, legs, echoes, hits, transmitted, w };
  }

  /**
   * SPEC NOTE 25: does this bead hit belong to a (planar defect, bead) corner pair? True when the ray
   * arrived from a defect segment that reaches this bead, or when the ray mirrored about the bead's base
   * normal would meet such a segment before any outline edge/arc.
   */
  function cornerBead(best, hist, hp, dir, scene) {
    const bead = best.bead;
    const last = hist.length ? hist[hist.length - 1] : null;
    if (last && last.type === 'defect' && last.seg && last.seg.beads && last.seg.beads.indexOf(bead) >= 0) return true;
    let any = false;
    for (let i = 0; i < scene.segs.length && !any; i++) { const sg = scene.segs[i]; if (sg.beads && sg.beads.indexOf(bead) >= 0) any = true; }
    if (!any) return false;
    const nd = reflect(dir.x, dir.y, bead.nx, bead.ny);
    const px = hp.x + nd.x * STEP_OFF, py = hp.y + nd.y * STEP_OFF, dx = nd.x, dy = nd.y;
    let tSeg = Infinity;
    for (let i = 0; i < scene.segs.length; i++) {
      const sg = scene.segs[i];
      if (!sg.beads || sg.beads.indexOf(bead) < 0) continue;
      const dn = dx * sg.nx + dy * sg.ny;
      if (dn > -GRAZE_COS && dn < GRAZE_COS) continue;
      const den = dx * sg.ey - dy * sg.ex;
      if (den > -1e-12 && den < 1e-12) continue;
      const t = ((sg.ax - px) * sg.ey - (sg.ay - py) * sg.ex) / den;
      if (t < EPS || t >= tSeg) continue;
      const u = ((sg.ax - px) * dy - (sg.ay - py) * dx) / den;
      if (u < 0 || u > 1) continue;
      tSeg = t;
    }
    if (tSeg === Infinity) return false;
    for (let i = 0; i < scene.edges.length; i++) {
      const ed = scene.edges[i];
      const den = dx * ed.ey - dy * ed.ex;
      if (den > -1e-12 && den < 1e-12) continue;
      const t = ((ed.ax - px) * ed.ey - (ed.ay - py) * ed.ex) / den;
      if (t < EPS || t >= tSeg) continue;
      const u = ((ed.ax - px) * dy - (ed.ay - py) * dx) / den;
      if (u >= 0 && u <= 1) return false;
    }
    for (let i = 0; i < scene.arcs.length; i++) {
      const h = arcHit(px, py, dx, dy, scene.arcs[i], EPS);
      if (h && h.t < tSeg) return false;
    }
    return true;
  }

  /**
   * Kind / size / distance law / position / leg of a specular return from the reflection history.
   * Corner rule (§6.1 2d): the last two reflections are one outline edge/arc and one planar defect
   * segment, in either order, AND the defect was not hit at near-normal incidence (a leg-2 normal
   * return off a fusion face is a plain 'defect' echo even though the bottom precedes/follows it).
   */
  function returnInfo(hist) {
    const last = hist[hist.length - 1];
    const prev = hist.length > 1 ? hist[hist.length - 2] : null;
    if (prev && ((last.type === 'outline' && prev.type === 'defect') || (last.type === 'defect' && prev.type === 'outline'))) {
      const dref = last.type === 'defect' ? last : prev;
      const seg = dref.seg;
      if (seg.kind !== 'lamination') {
        if (dref.inc > CORNER_MIN_INC) return { kind: 'corner', S: seg.S, dExp: 1.5, defect: seg.defect, tag: last.type === 'outline' ? last.tag : prev.tag, x: dref.x, y: dref.y, leg: Math.min(last.leg, prev.leg) };
        return { kind: 'defect', S: seg.S, dExp: 1.5, defect: seg.defect, tag: seg.defect.type, x: dref.x, y: dref.y, leg: dref.leg };
      }
    }
    if (last.type === 'defect') {
      const seg = last.seg;
      return { kind: seg.kind, S: seg.S, dExp: seg.kind === 'lamination' ? 0.5 : 1.5, defect: seg.defect, tag: seg.defect.type, x: last.x, y: last.y, leg: last.leg };
    }
    if (last.type === 'reflector') {
      const seg = last.seg;   // SPEC NOTE 35
      return { kind: seg.kind, S: seg.S, dExp: seg.dExp, tag: seg.tag, label: seg.label, fbhD: seg.fbhD, x: last.x, y: last.y, leg: last.leg };
    }
    if (last.type === 'perspex') return { kind: 'perspex', S: 0.9, dExp: 0.5, tag: 'perspex', x: last.x, y: last.y, leg: last.leg };
    return { kind: tagKind(last.tag), S: 1, dExp: 0.5, tag: last.tag, x: last.x, y: last.y, leg: last.leg };
  }

  /** Assemble one raw (unmerged) echo with the §6.1 rule-4 amplitude (v2: per-leg attenuation, tUs, focus gain). */
  function makeEcho(C, o) {
    const lenMm = o.lenMm;
    const q = C.nearField / Math.max(lenMm, C.nearField);
    const D = Math.pow(q, o.dExp);
    const Mf = Math.pow(10, -o.att / 20);
    let S = o.S;
    if (o.fbhD) S *= Math.PI * o.fbhD * o.fbhD / (2 * C.lambda * Math.max(lenMm, C.nearField));   // FBH law (§3.8): NO min(1, …) cap (DGS round-trip)
    const base = o.w * o.wReturn * o.e * S * D * Mf * (o.extra === undefined ? 1 : o.extra) * C.transferLin * C.Gf(lenMm) * C.nearBoost(lenMm);
    const hz = lenMm * C.tan20z + C.crystalB / 2;
    const vol = !!o.defect && !UT.specimens.isPlanar(o.defect.type);   // volumetric scatterers: ×1 (§6.7)
    const skewed = !vol && (o.kind === 'defect' || o.kind === 'corner' || o.kind === 'geometry' || o.kind === 'lamination') && C.theta > 0;
    const sw = skewed ? M.skewWeight(C.skew) : 1;
    // z-overlap factors (§6.7, SPEC NOTE 19): the branch's reflection/transmission factors, plus the
    // echo's own defect (reflection Z) unless the branch already carries that defect
    let zs = o.zs || [];
    let Z = o.tw === undefined ? 1 : o.tw;
    if (o.defect) {
      let seen = false;
      for (let i = 0; i < zs.length; i++) if (zs[i].defect === o.defect) { seen = true; break; }
      if (!seen) { zs = zs.concat([{ defect: o.defect, hz, trans: false }]); Z *= zOverlap(o.defect, C.probeZ, hz, C.L, C.wrap); }
    }
    const converted = o.conv !== null && o.conv !== undefined;
    const path = converted ? o.tUs * C.vel / 2 : lenMm;   // SPEC NOTE 32
    const ec = {
      path, amp: base * sw * Z, ampNoZ: base * sw, hz, kind: o.kind, leg: o.leg, x: o.x, y: o.y,
      defectId: o.defect ? o.defect.id : undefined, tag: o.tag, label: o.label || (o.defect ? o.defect.label : undefined),
      angleDev: o.angleDev, defectType: o.defect ? o.defect.type : undefined,
      tUs: o.tUs, lenMm, mode: o.mode,
    };
    if (converted) ec.conv = o.conv;
    if (o.w !== undefined) ec.w = o.w;   // one-way fan weight of the ray (merge coverage, SPEC NOTE 23; stripped by mergeEchoes)
    if (zs.length) ec.zs = zsOut(zs);
    return ec;
  }

  /** §6.7 z-overlap factor for a defect (wrapping on pipes). */
  function zOverlap(d, probeZ, hz, L, wrap) {
    if (!(hz > 0)) return 1;
    let a = d.zFrom === undefined ? -Infinity : d.zFrom;
    let b = d.zTo === undefined ? Infinity : d.zTo;
    if (a === -Infinity || b === Infinity) return 1;
    if (b < a) { if (wrap && L > 0) b += L; else { const t = a; a = b; b = t; } }
    const lo = probeZ - hz, hi = probeZ + hz;
    if (!wrap && lo >= a && hi <= b) return 1;   // footprint fully inside the defect
    let ov = Math.max(0, Math.min(hi, b) - Math.max(lo, a));
    if (wrap && L > 0) { ov += Math.max(0, Math.min(hi, b - L) - Math.max(lo, a - L)); ov += Math.max(0, Math.min(hi, b + L) - Math.max(lo, a + L)); }
    const r = ov / (2 * hz);
    return r >= 1 ? 1 : r <= 0 ? 0 : Math.sqrt(r);
  }
  /** Serialisable copy of a branch's z-factor chain (cached on the array: chains are shared by many echoes). */
  function zsOut(zs) {
    if (!zs._m) zs._m = zs.map(function (f) { return { defectId: f.defect.id, hz: f.hz, trans: !!f.trans }; });
    return zs._m;
  }

  // ------------------------------------------------------------------ surface wave (§3.3, SPEC NOTE 33)
  /**
   * Rayleigh wave along the chord scanning surface. Returns {echoes, surface} or null.
   */
  function surfaceWave(C, specimen, probe, derived, opts) {
    if (!C.surfaceWave || probe.surface === 'brace' || probe.surface === 'web') return null;
    if (derived.mode !== 'shear' || !(derived.refracted > 0)) return null;
    const ref = derived.refracted;
    const nearSecond = derived.secondCritical !== undefined && derived.wedgeAngle >= derived.secondCritical - 6;
    if (!(ref >= 65 || nearSecond)) return null;
    const eR = 0.15 * M.clamp((ref - 60) / 15, 0, 1);
    if (!(eR > 0)) return null;
    const edges = specimen.edges || [];
    const seg = C.segment;
    let i0 = edges.indexOf(seg);
    if (i0 < 0) return null;
    const dirX = -C.side;   // beam direction along x
    const n = edges.length;
    // walk orientation: forward when the edge runs along dirX
    const fwd = (seg.b.x - seg.a.x) * dirX >= 0;
    const at = function (k) { const e = edges[((k % n) + n) % n]; return fwd ? { a: e.a, b: e.b, tag: e.tag } : { a: e.b, b: e.a, tag: e.tag }; };
    const step = fwd ? 1 : -1;
    const vR = derived.vRayleigh || 0.92 * C.vS;
    const dampers = (opts.damping && Array.isArray(opts.damping.points) ? opts.damping.points : []).filter(function (x) { return Number.isFinite(x); });
    const reflectors = [];
    const echoes = [];
    const pts = [{ x: C.E.x, y: C.E.y }];
    let dist = 0, energy = 1;
    let x = C.E.x, y = C.E.y;
    let k = i0;
    let cur = at(k);
    // surface-breaking planar defects (any vertex at y ≤ 0.5), sorted along the travel direction
    const cracks = [];
    for (const d of C.defects) {
      if (!d || d.visible === false || !UT.specimens.isPlanar(d.type) || d.type === 'lamination' || !Array.isArray(d.pts)) continue;
      let top = null;
      for (const p of d.pts) if (p.y <= 0.5 && (top === null || p.y < top.y)) top = p;
      if (top && (top.x - C.E.x) * dirX > 0.5) cracks.push({ x: top.x, defect: d });
    }
    cracks.sort(function (a, b) { return (a.x - b.x) * dirX; });
    let ci = 0;
    const emit = function (rx, ry, kind, refl, defect) {
      const d = dist;
      let damp = 1;
      for (const xd of dampers) if ((xd - C.E.x) * dirX > 0 && (rx - xd) * dirX > 0) damp *= DAMPER_FACTOR;
      const q = C.nearField / Math.max(d, C.nearField);
      const lenMm = d;
      const tUs = 2 * d / vR;
      const hz = lenMm * C.tan20z + C.crystalB / 2;
      let Z = 1;
      const zs = [];
      if (defect) { Z = zOverlap(defect, C.probeZ, hz, C.L, C.wrap); zs.push({ defectId: defect.id, hz, trans: false }); }
      const ampNoZ = eR * energy * refl * Math.sqrt(q) * damp * C.transferLin;
      const ec = { path: tUs * C.vel / 2, amp: ampNoZ * Z, ampNoZ, hz, kind: 'surface', leg: 1, x: rx, y: ry, tag: kind, label: undefined, angleDev: 0,
        tUs, lenMm, mode: 'R', surfaceRefl: refl };
      if (defect) { ec.defectId = defect.id; ec.defectType = defect.type; ec.label = defect.label; ec.zs = zs; }
      echoes.push(ec);
      reflectors.push({ x: rx, y: ry, kind, refl });
      pts.push({ x: rx, y: ry });
    };
    for (let guard = 0; guard < 64 && reflectors.length < SURF_MAX_REFL && energy > 1e-4 && dist < C.maxLen; guard++) {
      // cracks on the current edge before its end vertex
      const ex = cur.b.x;
      while (ci < cracks.length && (cracks[ci].x - x) * dirX > 0 && (ex - cracks[ci].x) * dirX >= 0) {
        const cx = cracks[ci].x;
        const t = Math.abs(cur.b.x - cur.a.x) > 1e-9 ? (cx - cur.a.x) / (cur.b.x - cur.a.x) : 0;
        const cy = cur.a.y + (cur.b.y - cur.a.y) * M.clamp(t, 0, 1);
        dist += M.dist(x, y, cx, cy); x = cx; y = cy;
        emit(cx, cy, 'crack', 0.8, cracks[ci].defect);
        energy *= 0.2;
        ci++;
      }
      // move to the end vertex of the current edge
      dist += M.dist(x, y, cur.b.x, cur.b.y); x = cur.b.x; y = cur.b.y;
      pts.push({ x, y });
      k += step;
      const nxt = at(k);
      if (nxt.tag === 'top' || nxt.tag === 'cap') {
        if (cur.tag === 'top' && nxt.tag === 'cap') { emit(x, y, 'cap-toe', 0.5, null); energy *= 0.5; }
        cur = nxt;
        continue;
      }
      if (cur.tag === 'cap' && (nxt.tag === 'web' || nxt.tag === 'brace')) { emit(x, y, 'toe', 0.5, null); break; }
      // notch: a 'top' edge at the same level resumes within NOTCH_GAP
      let notch = null;
      for (let j = 1; j <= 4; j++) {
        const cand = at(k + j * step);
        if (cand.tag === 'top' && Math.abs(cand.a.y - y) < 0.05 && Math.abs(cand.a.x - x) <= NOTCH_GAP) { notch = { k: k + j * step, e: cand }; break; }
        if (cand.tag === 'top' || cand.tag === 'cap') break;
      }
      if (notch) {
        emit(x, y, 'notch', 0.8, null);
        energy *= 0.2;
        dist += Math.abs(notch.e.a.x - x); x = notch.e.a.x; y = notch.e.a.y;
        pts.push({ x, y });
        k = notch.k; cur = at(k);
        continue;
      }
      // run end (§3.3): an 'end' edge or any edge turning DOWN into the specimen (radius arc, step, end face) is a
      // convex corner = end face (1.0); an edge rising above the surface (fillet web, untagged bead) is a toe (0.5)
      const convex = nxt.tag === 'end' || nxt.b.y > y + 0.05;
      emit(x, y, convex ? 'end' : 'toe', convex ? 1.0 : 0.5, null);
      break;
    }
    if (!echoes.length) return null;
    return { echoes, surface: { pts, reflectors, dampers: dampers.map(function (xd) { return { x: xd }; }) } };
  }

  // ------------------------------------------------------------------ merging
  function isVolumetricEcho(ec) {
    return ec.kind === 'defect' && ec.defectType !== undefined && !UT.specimens.isPlanar(ec.defectType);
  }

  /** True for groups whose amplitude gets the coverage-symmetry factor (SPEC NOTE 23). */
  function isCoverageEcho(ec) {
    return ec.kind === 'lamination' || (ec.kind === 'defect' && ec.defectType !== undefined && UT.specimens.isPlanar(ec.defectType));
  }

  /**
   * §6.1 rule 5 merging. `fan` = {deltas: number[], th20, weightOf(δ)} describes the fan the raw echoes came from
   * (optional; without it the coverage factor of SPEC NOTE 23 is skipped).
   */
  function mergeEchoes(raw, fan) {
    const list = raw.filter(function (ec) { return Math.max(ec.amp, ec.ampNoZ || 0) >= AMP_FLOOR || ec.kind === 'transmitted'; });
    list.sort(function (a, b) { return a.path - b.path; });
    const groups = [];
    const byKey = new Map();
    for (const ec of list) {
      const key = ec.kind + '|' + (ec.defectId !== undefined ? ec.defectId : ec.tag) + '|' + ec.leg;
      let arr = byKey.get(key);
      if (!arr) { arr = []; byKey.set(key, arr); }
      let g = null;
      const tol = ec.kind === 'corner' ? CORNER_MERGE : 1.5;   // SPEC NOTES 12 / 27
      for (let i = arr.length - 1; i >= 0; i--) {
        const cand = arr[i];
        if (Math.abs(ec.path - cand.best.path) <= tol || Math.abs(ec.path - cand.last) <= tol / 2) { g = cand; break; }
        if (cand.last < ec.path - 2 * tol) break;
      }
      if (!g) { g = { key, best: ec, sum2: ec.amp * ec.amp, sumNoZ2: ec.ampNoZ * ec.ampNoZ, last: ec.path, members: [ec] }; arr.push(g); groups.push(g); }
      else {
        g.sum2 += ec.amp * ec.amp; g.sumNoZ2 += ec.ampNoZ * ec.ampNoZ; g.last = ec.path;
        g.members.push(ec);
        if (ec.amp > g.best.amp || (ec.amp === g.best.amp && ec.ampNoZ > g.best.ampNoZ)) g.best = ec;
      }
    }
    const repFloor = Math.pow(10, -REP_DB / 20);
    const fanDeltas = fan && Array.isArray(fan.deltas) && fan.deltas.length > 1 ? fan.deltas : null;
    const th20 = fan && fan.th20 > 0 ? fan.th20 : 4;
    const weightOf = fan && typeof fan.weightOf === 'function' ? fan.weightOf : function (d) { return M.beamWeight20(d, th20); };
    // SPEC NOTE 23: coverage symmetry per key (all groups of one face/leg share the fan interval)
    const covByKey = new Map();
    if (fanDeltas) {
      byKey.forEach(function (arr, key) {
        if (!isCoverageEcho(arr[0].best)) return;
        let dLo = Infinity, dHi = -Infinity, sumW2 = 0, top = null;
        const seen = new Set();
        for (const g of arr) for (const m of g.members) {
          if (!Number.isFinite(m.angleDev)) continue;
          if (!top || m.amp > top.amp || (m.amp === top.amp && m.ampNoZ > top.ampNoZ)) top = m;
          if (m.angleDev < dLo) dLo = m.angleDev;
          if (m.angleDev > dHi) dHi = m.angleDev;
          const k = Math.round(m.angleDev * 1e6);
          if (seen.has(k)) continue;
          seen.add(k);
          const wi = m.w !== undefined ? m.w : weightOf(m.angleDev);
          sumW2 += wi * wi;
        }
        if (!top) return;
        const half = (dHi - dLo) / 2 + 1e-9;
        let ref = 0;
        for (const d of fanDeltas) {
          if (Math.abs(d - top.angleDev) > half) continue;
          const wi = weightOf(d);
          ref += wi * wi;
        }
        if (ref > 0) covByKey.set(key, Math.min(1, sumW2 / ref));
      });
    }
    const out = [];
    for (const g of groups) {
      const best = g.best;
      let rep = best;
      const vol = isVolumetricEcho(best);
      if (!vol && g.members.length > 1) {
        // SPEC NOTE 22: report the path of the member nearest the beam axis among those within REP_DB of the max
        const floorAmp = best.amp * repFloor;
        for (const m of g.members) {
          if (m === rep) continue;
          if (m.amp >= floorAmp && Math.abs(m.angleDev) < Math.abs(rep.angleDev) - 1e-9) rep = m;
        }
      }
      const ec = Object.assign({}, rep);
      if (rep !== best) {
        // keep the group's max amplitude; amp = ampNoZ · Z of the representative's own branch (AUT re-weighting)
        ec.ampNoZ = best.ampNoZ;
        ec.amp = rep.ampNoZ > 0 ? best.ampNoZ * (rep.amp / rep.ampNoZ) : best.amp;
      }
      if (vol) { ec.amp = Math.sqrt(g.sum2); ec.ampNoZ = Math.sqrt(g.sumNoZ2); }
      else {
        const cov = covByKey.get(g.key);
        if (cov !== undefined && cov < 1) { ec.amp *= cov; ec.ampNoZ *= cov; }
      }
      delete ec.w;
      out.push(ec);
    }
    out.sort(function (a, b) { return a.path - b.path; });
    return out;
  }

  // ------------------------------------------------------------------ fan layout (§3.1, SPEC NOTE 28)
  /**
   * Fan ray descriptors for a probe: {delta, w, main, side, bin}. `n` = opts.fanCount (≥ 41 → v2 layout).
   * @param {object} derived  UT.probe.derive(...)
   * @param {number} n  requested ray count
   * @param {boolean} sideLobes  physics.sideLobes
   * @param {function} dirW  directivity weight with null/floor rule
   */
  function fanLayout(derived, n, sideLobes, dirW) {
    const th20 = derived.halfAngle20dB || 4;
    const nullA = Math.max(derived.nullAngle || th20 * 1.4, th20);
    const fanMax = Math.max(derived.fanMax || nullA * 1.47, nullA);
    const theta = derived.refracted || 0;
    const rays = [];
    const okAngle = function (d) { return theta + d <= 89 && theta + d >= -89; };
    if (n >= 41) {
      const binMain = 2 * th20 / 20;
      for (let i = 0; i <= 20; i++) { const d = -th20 + 2 * th20 * i / 20; rays.push({ delta: d, w: dirW(d), main: true, side: false, bin: binMain }); }
      const mid = (th20 + nullA) / 2, binRing = Math.max(1e-9, (nullA - th20) / 2);
      for (const d of [-mid, mid, -nullA, nullA]) rays.push({ delta: d, w: dirW(d) * Math.min(1, binRing / binMain), main: true, side: false, bin: binRing });
      if (sideLobes && fanMax > nullA + 1e-9) {
        const binSide = (fanMax - nullA) / 8;
        for (const s of [-1, 1]) for (let k = 1; k <= 8; k++) { const d = s * (nullA + (fanMax - nullA) * k / 8); rays.push({ delta: d, w: dirW(d) * Math.min(1, binSide / binMain), main: false, side: true, bin: binSide }); }
      }
    } else {
      let m = n < 1 ? 1 : n;
      if (m > 1 && m % 2 === 0) m += 1;
      for (let i = 0; i < m; i++) { const d = m === 1 ? 0 : -th20 + 2 * th20 * i / (m - 1); rays.push({ delta: d, w: dirW(d), main: true, side: false, bin: m > 1 ? 2 * th20 / (m - 1) : 1 }); }
    }
    return rays.filter(function (r) { return okAngle(r.delta); });
  }

  /** Directivity weight with the §3.1 null / side-lobe floor rule (SPEC NOTE 29). */
  function makeDirW(derived, sideLobes) {
    const nullA = derived.nullAngle || Infinity;
    const D = typeof derived.directivity === 'function' ? derived.directivity : function (d) { return M.beamWeight20(d, derived.halfAngle20dB || 4); };
    return function (deltaDeg) {
      const d = Math.abs(deltaDeg);
      const v = D(d);
      if (d <= nullA) return v;
      return sideLobes ? Math.max(v, SIDELOBE_FLOOR) : 0;
    };
  }

  /** Material lookup for the tracer (SPEC NOTE 31): velocities from spec.material, per-mode attenuation from the library. */
  function materialInfo(specimen, derived) {
    const sm = (specimen && specimen.material) || {};
    const lib = (UT.specimens && UT.specimens.materials && UT.specimens.materials[sm.key]) || null;
    const vS = sm.vShear || (derived.mode === 'shear' ? derived.vel : UT.consts.V_SHEAR_STEEL);
    const vL = sm.vComp || (derived.mode === 'comp' ? derived.vel : UT.consts.V_COMP_STEEL);
    const aL = lib && Number.isFinite(lib.attenL5) ? lib.attenL5 : 0.005;
    const aS = lib && Number.isFinite(lib.attenS5) ? lib.attenS5 : 0.010;
    return { vS, vL, attenL5: aL, attenS5: aS, key: sm.key || 'carbon' };
  }

  // ------------------------------------------------------------------ public API
  /**
   * Trace the beam of a probe through a specimen and collect echoes.
   * @param {{specimen:object, probe:object, derived:object, display?:object, defects?:Array, opts?:object}} a
   *   opts = {maxPath, fanCount, maxLegs, physics:{modeConv, surfaceWave, sideLobes}, damping:{points}, weldMaterial,
   *           transferLossDb, debugRaw}
   * @returns {{centre:object, fan:Array, edge20:Array, echoes:Array, hits:Array, surface:object|null, converted:Array, focus:object|null, transmitted?:number, receiver?:object}}
   */
  function trace(a) {
    const specimen = a.specimen, probe = a.probe || {};
    const derived = a.derived || UT.probe.derive(probe, specimen);
    const display = a.display || {};
    const opts = a.opts || {};
    const empty = { centre: { pts: [], legs: [] }, fan: [], edge20: [[], []], echoes: [], hits: [], surface: null, converted: [], focus: null };
    if (!specimen || !specimen.edges) return empty;
    const em = emission(specimen, probe, derived);
    if (!em.segment) return empty;
    const skips = Math.max(1, display.skips || 3);
    const maxLegs = opts.maxLegs !== undefined ? opts.maxLegs
      : ((derived.refracted === 0 || specimen.kind === 'block') ? 12 : skips);
    const maxPath = opts.maxPath !== undefined ? opts.maxPath : 200;
    const theta = derived.refracted || 0;
    const physics = opts.physics || {};
    const modeConv = physics.modeConv !== false;
    const sideLobes = physics.sideLobes !== false;
    const surfOn = physics.surfaceWave !== false;
    const mat = materialInfo(specimen, derived);
    const freq = derived.freq || probe.freq || 5;
    const fScale = Math.pow(freq / 5, 1.5);
    const crystalB = derived.crystalB || derived.diameter || probe.diameter || 10;
    const lambda = derived.lambda || derived.vel / freq;
    const th20z = derived.halfAngle20dBz !== undefined ? derived.halfAngle20dBz : M.rad2deg(Math.asin(Math.min(0.999, 0.87 * lambda / crystalB)));
    const dirW = makeDirW(derived, sideLobes);
    const focusOn = !!(derived.focus && derived.focus.on) && theta <= 70;
    const N = derived.nearField || 20;
    const F = focusOn ? M.clamp(derived.focus.F || 30, 10, Math.max(10, N)) : 0;
    const fanMaxA = derived.fanMax || (derived.halfAngle20dB || 4) * 2;
    const isWeld = specimen.kind === 'weld';
    const transferDb = isWeld && Number.isFinite(opts.transferLossDb) ? M.clamp(opts.transferLossDb, 0, 8) : 0;
    const twin = probe.crystal === 'twin' && theta > 0;   // §3.5 twin-crystal angle probe (SPEC NOTE 38)
    const C = {
      specimen, defects: Array.isArray(a.defects) ? a.defects : [],
      E: em.E, u0: em.u0, ss: em, side: em.side, segment: em.segment, theta, mode: derived.mode,
      probeMode: derived.mode === 'comp' ? 'L' : 'S',
      th6: derived.halfAngle6dB || 1.9, th20: derived.halfAngle20dB || 4, vel: derived.vel, lambda,
      tan20: Math.tan((derived.halfAngle20dB || 4) * DEG), tan20z: Math.tan(th20z * DEG), crystalB,
      nearField: N, diameter: derived.diameter || probe.diameter || 10,
      vS: mat.vS, vL: mat.vL, alphaS: mat.attenS5 * fScale, alphaL: mat.attenL5 * fScale,
      phiC: M.rad2deg(Math.asin(Math.min(1, mat.vS / mat.vL))),
      weldExtra: isWeld && opts.weldMaterial === 'austenitic' ? WELD_AUST_DB * (freq / 5) : 0,
      transferLin: Math.pow(10, -transferDb / 20),
      modeConv, sideLobes, surfaceWave: surfOn, dirW,
      devMax: Math.max(2 * (derived.halfAngle20dB || 4), fanMaxA),
      Gf: focusOn ? function (len) { const g = Math.min(N / F, 3) - 1; const r = (len - F) / (0.25 * F); return 1 + g * Math.exp(-r * r); } : function () { return 1; },
      twin, nearBoost: twin ? function (len) { return len >= TWIN_NEAR ? 1 : 1 + (TWIN_BOOST - 1) * M.clamp((TWIN_NEAR - len) / (TWIN_NEAR - TWIN_ROLL), 0, 1); } : function () { return 1; },
      maxLegs, maxLen: Math.max(2 * maxPath + 100, 700), retroSlot: !!specimen.retroSlot,
      probeZ: probe.z || 0, skew: fold180(probe.skew || 0), L: specimen.L || 0, wrap: !!specimen.pipe,
      scene: buildScene(specimen, a.defects, probe),
      tt: probe.method === 'tt', tandem: probe.method === 'tandem',
      rx: null, rxDir: null, volBest: new Map(), convPolys: [],
    };
    // receivers
    let receiver = null;
    if (C.tt) {
      const exit = firstOutlineHit(C);
      if (exit) { C.rx = { x: exit.x, y: exit.y }; receiver = { x: exit.x, y: exit.y, tag: exit.tag }; }
      else C.tt = false;
    } else if (C.tandem) {
      const T = specimen.T || 20;
      const xr = C.E.x - C.side * T * Math.tan(theta * DEG);
      C.rx = { x: xr, y: 0 };
      C.rxDir = norm(C.side * Math.sin(theta * DEG), -Math.cos(theta * DEG));
      receiver = { x: xr, y: 0, tag: 'top' };
    }

    const n = opts.fanCount || 21;
    const fan = [];
    const raw = [];
    const hits = [];
    const deltas = [];
    let centre = null;
    let sumW = 0, sumT = 0;
    let rayList;
    let focus = null;
    if (focusOn && !C.tt && !C.tandem) {
      // SPEC NOTE 34: aperture rays aimed at the focal point
      const nAp = n >= 21 ? 41 : Math.max(1, n);
      const half = (derived.crystalA || C.diameter) / 2;
      const Fp = { x: C.E.x + C.u0.x * F, y: C.E.y + C.u0.y * F };
      focus = { F, x: Fp.x, y: Fp.y };
      rayList = [];
      for (let i = 0; i < nAp; i++) {
        const s = nAp === 1 ? 0 : -half + 2 * half * i / (nAp - 1);
        const Ex = C.E.x + C.ss.tangent.x * s, Ey = C.E.y + C.ss.tangent.y * s;
        const d = norm(Fp.x - Ex, Fp.y - Ey);
        const cross = C.u0.x * d.y - C.u0.y * d.x;
        const ang = M.angleBetween(d.x, d.y, C.u0.x, C.u0.y) * (cross * C.side < 0 ? -1 : 1);
        rayList.push({ delta: ang, w: typeof derived.directivity === 'function' ? derived.directivity(ang) : dirW(ang), dir0: d, off: s, main: Math.abs(ang) <= (derived.nullAngle || 90), side: false, focused: true });
      }
    } else {
      rayList = fanLayout(derived, n, sideLobes, dirW).map(function (r) { return Object.assign(r, { dir0: dirAt(C.ss, C.side, theta + r.delta), off: 0, focused: false }); });
    }
    for (let i = 0; i < rayList.length; i++) {
      const R = rayList[i];
      deltas.push(R.delta);
      const r = marchRay(C, R);
      sumW += r.w; sumT += r.transmitted;
      const drawPts = r.pts.filter(function (p) { return p.leg <= skips; });
      fan.push({ angleOffsetDeg: +R.delta.toFixed(3), weight: r.w, pts: drawPts.map(function (p) { return { x: p.x, y: p.y }; }), sideLobe: !!R.side });
      if (Math.abs(R.delta) < 1e-9 && !R.focused) {
        centre = { pts: drawPts.map(function (p) { return { x: p.x, y: p.y }; }), legs: r.legs.filter(function (l) { return l.leg <= skips; }) };
        for (const h of r.hits) hits.push(h);
      }
      for (const ec of r.echoes) raw.push(ec);
    }
    if (C.tt && TT_SUB > 1) {
      // remaining sub-apertures across the crystal (drawing keeps the centre one) — SPEC NOTE 16
      for (let k = 0; k < TT_SUB; k++) {
        const off = -C.diameter / 2 + C.diameter * (k + 0.5) / TT_SUB;
        if (Math.abs(off) < 1e-9) continue;
        for (let i = 0; i < rayList.length; i++) {
          const r = marchRay(C, Object.assign({}, rayList[i], { off }));
          sumW += r.w; sumT += r.transmitted;
        }
      }
    }
    C.volBest.forEach(function (ec) { raw.push(ec); });
    if (!centre) {
      // focused fan: the middle aperture ray stands in for the centre polyline
      const mid = fan.length ? fan[Math.floor(fan.length / 2)] : null;
      centre = { pts: mid ? mid.pts.slice() : [], legs: [] };
      if (mid && mid.pts.length > 1) for (let i = 0; i + 1 < mid.pts.length; i++) centre.legs.push({ a: mid.pts[i], b: mid.pts[i + 1], leg: i + 1, surfaceTag: i === 0 ? 'top' : 'outline', hitTag: 'outline' });
    }
    // surface wave (§3.3)
    let surface = null;
    if (!C.tt && !C.tandem) {
      const sw = surfaceWave(C, specimen, probe, derived, opts);
      if (sw) { surface = sw.surface; for (const ec of sw.echoes) raw.push(ec); }
    }
    let echoes;
    if (C.tt) {
      const amp = sumW > 0 ? sumT / sumW : 0;
      const p0 = firstOutlineHit(C);
      const path = p0 ? M.dist(C.E.x, C.E.y, p0.x, p0.y) : (specimen.T || 0);
      echoes = [{ path, amp: amp * C.transferLin, ampNoZ: amp * C.transferLin, hz: path * C.tan20z + crystalB / 2, kind: 'transmitted', leg: 1, x: C.rx.x, y: C.rx.y, tag: 'transmitted', angleDev: 0, tUs: 2 * path / derived.vel, lenMm: path, mode: C.probeMode }];
    } else {
      echoes = mergeEchoes(raw, { deltas, th20: C.th20, weightOf: dirW });
    }
    for (const ec of echoes) {
      if (ec.kind === 'transmitted' || !(ec.amp >= AMP_FLOOR)) continue;
      hits.push({ x: ec.x, y: ec.y, kind: ec.kind, defectId: ec.defectId, tag: ec.tag });
    }
    // converted polylines for drawing (§3.13): ≤ CONV_DRAW_MAX by weight
    const converted = C.convPolys.filter(function (p) { return p.pts.length > 1 && p.weight >= CONV_DRAW_MIN; })
      .sort(function (p, q) { return q.weight - p.weight; }).slice(0, CONV_DRAW_MAX)
      .map(function (p) { return { mode: p.mode, kindTag: p.mode, weight: p.weight, pts: p.pts }; });
    const edgeHi = focus ? fan.length - 1 : Math.min(20, fan.length - 1);
    const res = { centre, fan, edge20: [fan.length ? fan[0].pts : [], fan.length ? fan[edgeHi].pts : []], echoes, hits, E: C.E, u0: C.u0, surface, converted, focus };
    if (receiver) res.receiver = receiver;
    if (opts.debugRaw) res.raw = raw;   // unmerged echoes (QA/diagnostics only)
    if (C.tt) res.transmitted = echoes[0].amp;
    return res;
  }

  /** First outline (edge/arc) intersection of the centre ray, ignoring defects. */
  function firstOutlineHit(C) {
    const px = C.E.x + C.u0.x * STEP_OFF, py = C.E.y + C.u0.y * STEP_OFF;
    let best = null;
    for (const ed of C.scene.edges) {
      const h = M.raySegment(px, py, C.u0.x, C.u0.y, ed.ax, ed.ay, ed.ax + ed.ex, ed.ay + ed.ey, EPS);
      if (h && (!best || h.t < best.t)) best = { t: h.t, x: h.x, y: h.y, tag: ed.tag };
    }
    for (const arc of C.scene.arcs) {
      const h = arcHit(px, py, C.u0.x, C.u0.y, arc, EPS);
      if (h && (!best || h.t < best.t)) best = { t: h.t, x: h.x, y: h.y, tag: arc.tag || 'radius' };
    }
    return best;
  }

  /** Fold a stored 0..360 skew into (−180, 180] so ±10° weight the same (UT.math.skewWeight is one-sided). */
  function fold180(d) { let s = ((d % 360) + 360) % 360; if (s > 180) s -= 360; return s; }

  /**
   * Recompute the §6.7 z-overlap factor of an echo for another probe z (AUT). Holes/surfaces → 1.
   * @returns {number} Z in 0..1 such that amp = ampNoZ · Z at the same skew
   */
  function zFactor(echo, probeZ, probeSkew, defects, specimen) {
    void probeSkew;
    if (!echo) return 1;
    const L = (specimen && specimen.L) || 0, wrap = !!(specimen && specimen.pipe);
    const list = defects || [];
    const find = function (id) { for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i]; return null; };
    if (Array.isArray(echo.zs) && echo.zs.length) {
      // SPEC NOTE 19: product of the branch factors (reflection Z, transmission sqrt(1 − Z²))
      let Z = 1;
      for (const f of echo.zs) {
        const d = find(f.defectId);
        if (!d) continue;
        const z = zOverlap(d, probeZ || 0, f.hz !== undefined ? f.hz : 10, L, wrap);
        Z *= f.trans ? Math.sqrt(Math.max(0, 1 - z * z)) : z;
      }
      return Z;
    }
    if (echo.defectId === undefined) return 1;
    const d = find(echo.defectId);
    if (!d) return 1;
    const hz = echo.hz !== undefined ? echo.hz : 10;
    return zOverlap(d, probeZ || 0, hz, L, wrap);
  }

  const KIND_NAMES = {
    backwall: 'Backwall', radius: 'Radius', corner: 'Corner (defect + surface)', geometry: 'Geometry', lamination: 'Lamination',
    perspex: 'Perspex insert', tip: 'Tip diffraction', transmitted: 'Transmitted pulse', sdh: 'SDH', volumetric: 'Volumetric defect', defect: 'Defect',
    modeconv: 'Mode-converted', surface: 'Surface wave', fbh: 'FBH',
  };
  const GEOM_CATEGORY = { root: 'geometry-root', cap: 'geometry-cap', backing: 'geometry-backing' };

  /** Quiz category id (§4.5) of an echo-like object {kind, tag, y}. */
  function categoryOf(kind, tag, y, T) {
    switch (kind) {
      case 'backwall': case 'radius': case 'perspex': case 'transmitted': return 'backwall';
      case 'corner': return 'corner';
      case 'tip': return 'tip';
      case 'defect': case 'volumetric': return 'defect';
      case 'lamination': return 'lamination';
      case 'sdh': case 'fbh': return 'sdh';
      case 'modeconv': return 'modeconv';
      case 'surface': return 'surface';
      case 'geometry': {
        if (GEOM_CATEGORY[tag]) return GEOM_CATEGORY[tag];
        if (Number.isFinite(y) && Number.isFinite(T) && T > 0) return y >= T / 2 ? 'geometry-root' : 'geometry-cap';
        return 'geometry-root';
      }
      default: return 'defect';
    }
  }

  /**
   * Human readable description of an echo (or of a Readout {echoKind, path, leg}: the matching echo is looked up
   * in UT.frame.echoes). Returns an object {text, name, category, kind, mode, path, leg, label, tag} whose
   * toString() is the v1 label, e.g. 'Backwall 25.0 mm (leg 1)'. `category` is one of the §4.5 quiz ids.
   * @param {object} echo
   * @returns {object}
   */
  function describe(echo) {
    const out = { text: '', name: '', category: null, kind: null, mode: null, path: null, leg: null, label: null, tag: null, toString() { return this.text; } };
    if (!echo) return out;
    let e = echo;
    if (e.kind === undefined && e.echoKind !== undefined) {
      // Readout → resolve the echo in the current frame (same kind, nearest path)
      let best = null;
      const list = (UT.frame && Array.isArray(UT.frame.echoes)) ? UT.frame.echoes : [];
      for (const c of list) {
        if (c.kind !== e.echoKind) continue;
        const dp = Math.abs((c.path || 0) - (e.path || 0));
        if (!best || dp < best.dp) best = { c, dp };
      }
      e = best ? Object.assign({}, best.c, { path: e.path !== undefined ? e.path : best.c.path }) : { kind: e.echoKind, path: e.path, leg: e.leg };
    }
    const t = UT.i18n.t;
    let name = KIND_NAMES[e.kind] ? t(KIND_NAMES[e.kind]) : (e.kind || '');
    if (e.kind === 'sdh' && e.label) name = t('SDH {label}', { label: e.label });
    else if (e.kind === 'fbh' && e.label) name = e.label;
    else if ((e.kind === 'defect' || e.kind === 'lamination' || e.kind === 'corner' || e.kind === 'tip') && e.label) name = e.kind === 'corner' ? t('{label} (corner)', { label: e.label }) : e.kind === 'tip' ? t('{label} (tip)', { label: e.label }) : e.label;
    else if (e.kind === 'geometry' && e.tag) name = t('Geometry ({tag})', { tag: t(e.tag) });
    else if (e.kind === 'modeconv') name = t('Mode-converted ({mode})', { mode: e.conv || e.mode || 'L' }) + (e.label ? ' ' + e.label : e.tag && e.tag !== 'modeconv' ? ' ' + t('via {tag}', { tag: t(e.tag) }) : '');
    else if (e.kind === 'surface') name = e.tag ? t('Surface wave ({tag})', { tag: t(e.tag) }) : t('Surface wave');
    if (e.tag === 'tandem') name = t('Tandem: {name}', { name });
    const T = UT.state && UT.state.specimen ? UT.state.specimen.T : undefined;
    let text = name;
    if (e.path !== undefined && e.path !== null) text = t('{name} {path} mm', { name: text, path: M.fmt(e.path, 1) });
    if (e.leg) text = t('{name} (leg {leg})', { name: text, leg: e.leg });
    out.text = text;
    out.name = name;
    out.category = categoryOf(e.kind, e.tag, e.y, T);
    out.kind = e.kind || null;
    out.mode = e.mode || null;
    out.path = e.path === undefined ? null : e.path;
    out.leg = e.leg === undefined ? null : e.leg;
    out.label = e.label || null;
    out.tag = e.tag || null;
    return out;
  }

  // ------------------------------------------------------------------ test API (§7, owner 30)
  function currentDerived() {
    if (UT.frame && UT.frame.derived && typeof UT.frame.derived.directivity === 'function') return UT.frame.derived;
    return UT.probe.derive(UT.state.probe, UT.state.specimen);
  }
  Object.assign(UT.test, {
    /** One-way directivity weight (with the null / side-lobe rule of the current physics settings) at an offset (deg). */
    directivity(thetaDeg) {
      const d = currentDerived();
      const ph = (UT.state && UT.state.physics) || {};
      return makeDirW(d, ph.sideLobes !== false)(+thetaDeg || 0);
    },
    /** Fan offsets (deg) that the current probe/physics settings trace (41 / 25 / 21 …). */
    fanAngles() {
      const d = currentDerived();
      const ph = (UT.state && UT.state.physics) || {};
      const n = ph.fanRays === 21 ? 21 : 41;
      return fanLayout(d, n, ph.sideLobes !== false, makeDirW(d, ph.sideLobes !== false)).map(function (r) { return r.delta; });
    },
    /** Mode-conversion coefficient {R, phiOut} for the current specimen material. */
    modeConv(mode, phiDeg) {
      const spec = UT.state && UT.state.specimen;
      return modeConvCoef(mode === 'L' ? 'L' : 'S', phiDeg, spec && spec.material);
    },
  });

  // ------------------------------------------------------------------ self test
  function dB(a, b) { return 20 * Math.log10(a / b); }
  function run(spec, probe, display, defects, maxPath, extra) {
    const p = Object.assign({ mode: probe.angle === 0 ? 'comp' : 'shear', freq: 5, diameter: 10, wedgeVel: 2.74, method: 'pe', z: spec.L / 2, side: 1, skew: 0 }, probe);
    const d = UT.probe.derive(p, spec);
    return trace({ specimen: spec, probe: p, derived: d, display: display || { skips: 3 }, defects: defects || [], opts: Object.assign({ maxPath: maxPath || 100, fanCount: 21 }, extra || {}) });
  }
  function near(echoes, kind, path, tol) {
    let best = null;
    for (const e of echoes) if ((!kind || e.kind === kind) && Math.abs(e.path - path) <= tol && (!best || e.amp > best.amp)) best = e;
    return best;
  }

  function __selftest() {
    const f = [];
    const S = UT.specimens;
    // (a) V1 narrow, 0° single: 25/50/75/100 decreasing 2–5 dB
    const v1n = run(S.v1({ face: 'narrow' }), { angle: 0, x: 150 }, { skips: 3 }, [], 125);
    let prev = null;
    for (const p of [25, 50, 75, 100]) {
      const e = near(v1n.echoes, 'backwall', p, 0.5);
      if (!e) { f.push('v1 narrow backwall ' + p + ' missing'); continue; }
      if (prev) { const drop = dB(prev.amp, e.amp); if (drop < 2 || drop > 5) f.push('v1 narrow drop ' + p + ' = ' + drop.toFixed(2) + ' dB'); }
      if (Math.abs(e.tUs - 2 * e.lenMm / 5.9) > 1e-9 || e.mode !== 'L' || Math.abs(e.lenMm - e.path) > 1e-9) f.push('v1 narrow tUs/mode/lenMm ' + p);
      prev = e;
    }
    // (b) V1 wide: 45° and 0° at x = 100 → 100/200/300
    for (const ang of [0, 45, 60]) {
      const r = run(S.v1(), { angle: ang, x: 100 }, { skips: 3 }, [], 400);
      let last = null;
      for (const p of [100, 200, 300]) {
        const e = ang === 0 ? (near(r.echoes, 'radius', p, 1) || near(r.echoes, 'backwall', p, 1)) : near(r.echoes, 'radius', p, 1);
        if (!e) { f.push('v1 wide ' + ang + ' radius ' + p + ' missing'); continue; }
        if (last && !(e.amp < last.amp)) f.push('v1 wide ' + ang + ' radius ' + p + ' not decreasing');
        last = e;
      }
    }
    // (c) V2 sequences
    const seqs = [[1, [25, 100, 175]], [-1, [50, 125, 200]]];
    for (const s of seqs) {
      const r = run(S.v2(), { angle: 45, x: 60, side: s[0] }, { skips: 3 }, [], 250);
      let last = null;
      for (const p of s[1]) {
        const e = near(r.echoes, 'radius', p, 1);
        if (!e) { f.push('v2 side ' + s[0] + ' radius ' + p + ' missing'); continue; }
        if (last && !(e.amp < last.amp)) f.push('v2 side ' + s[0] + ' radius ' + p + ' not decreasing');
        last = e;
      }
    }
    // (d) root crack corner echo at 40 with a flat-root plate
    const pw = S.plateWeld({ T: 20, rootHeight: 0, capHeight: 0 });
    const crack = S.defectPresets.rootCrack(pw);
    const rc = run(pw, { angle: 60, x: 34.6 }, { skips: 3 }, [crack], 100);
    const corner = near(rc.echoes, 'corner', 40, 1);
    if (!corner) f.push('root crack corner echo missing');
    else {
      for (const dx of [-15, 15]) {
        const r2 = run(pw, { angle: 60, x: 34.6 + dx }, { skips: 3 }, [crack], 100);
        const c2 = near(r2.echoes, 'corner', 40, 3);
        if (c2 && dB(corner.amp, c2.amp) < 20) f.push('corner echo still present at x ' + (34.6 + dx));
      }
    }
    // (e) IOW 13 mm SDH (frozen block: hole at (240, 13)) → path 26.0
    const iow = S.iow();
    const h13 = iow.holes.find(function (h) { return h.label === '13mm'; });
    if (h13) {
      const x0 = h13.x + h13.y * Math.tan(60 * DEG);
      const r = run(iow, { angle: 60, x: x0 }, { skips: 3 }, [], 100);
      const e = near(r.echoes, 'sdh', 26, 0.5);
      if (!e) f.push('iow 13 mm SDH echo at 26 missing');
      else {
        for (const dx of [-5, -3, 3, 5]) {
          const e2 = near(run(iow, { angle: 60, x: x0 + dx }, { skips: 3 }, [], 100).echoes, 'sdh', 26, 3);
          if (e2 && e2.amp > e.amp) f.push('iow SDH louder at dx ' + dx);
        }
        // V2-6: focus F = 26 → ≥ 3 dB louder and a narrower −6 dB x-width (≤ 0.7×)
        const width6 = function (focus) {
          const amps = [];
          for (let dx = -6; dx <= 6; dx += 0.25) { const q = near(run(iow, { angle: 60, x: x0 + dx, focus }, { skips: 3 }, [], 100).echoes, 'sdh', 26, 3); amps.push([dx, q ? q.amp : 0]); }
          let mx = 0; for (const a of amps) if (a[1] > mx) mx = a[1];
          let lo = null, hi = null;
          for (const a of amps) if (a[1] >= mx / 2) { if (lo === null) lo = a[0]; hi = a[0]; }
          return { mx, w: hi - lo };
        };
        const wu = width6({ on: false, F: 26 }), wf = width6({ on: true, F: 26 });
        if (!(dB(wf.mx, wu.mx) >= 3)) f.push('focus gain ' + dB(wf.mx, wu.mx).toFixed(2) + ' dB');
        if (!(wf.w <= 0.7 * wu.w)) f.push('focus width ' + wf.w + ' vs ' + wu.w);
        const rf = run(iow, { angle: 60, x: x0, focus: { on: true, F: 26 } }, { skips: 3 }, [], 100);
        if (!rf.focus || Math.abs(rf.focus.F - 26) > 1e-9 || !rf.fan.length || rf.fan.length !== 41) f.push('focus result shape');
      }
    }
    // (f) lamination: echo + backwall ≥ 6 dB down
    const lp = S.laminationPlate({ T: 25 });
    const lam = S.defectPresets.lamination(lp);
    const clean = run(lp, { angle: 0, x: -60 }, { skips: 3 }, [lam], 100);
    const over = run(lp, { angle: 0, x: 40 }, { skips: 3 }, [lam], 100);
    const bwClean = near(clean.echoes, 'backwall', 25, 0.5);
    const bwOver = near(over.echoes, 'backwall', 25, 0.5);
    const lamEcho = near(over.echoes, 'lamination', 12.5, 0.5);
    if (!lamEcho) f.push('lamination echo missing');
    if (!bwClean) f.push('clean backwall missing');
    else if (bwOver && dB(bwClean.amp, bwOver.amp) < 6) f.push('backwall not shadowed by lamination');
    // (g) clean plate, angle probe: no backwall; fan shapes for 21 / 41 / 25 rays
    const g = run(S.plateWeld({ T: 20 }), { angle: 60, x: 40 }, { skips: 3 }, [], 100);
    if (g.echoes.some(function (e) { return e.kind === 'backwall'; })) f.push('angle probe backwall echo on a clean plate');
    if (!g.centre.pts.length || g.fan.length !== 21) f.push('centre/fan shape');
    const g41 = run(S.plateWeld({ T: 20 }), { angle: 60, x: 40 }, { skips: 3 }, [], 100, { fanCount: 41, physics: { sideLobes: true } });
    const g25 = run(S.plateWeld({ T: 20 }), { angle: 60, x: 40 }, { skips: 3 }, [], 100, { fanCount: 41, physics: { sideLobes: false } });
    if (g41.fan.length !== 41 || g25.fan.length !== 25) f.push('v2 fan sizes ' + g41.fan.length + '/' + g25.fan.length);
    const d60 = UT.probe.derive({ angle: 60, mode: 'shear', freq: 5, diameter: 10, wedgeVel: 2.74, side: 1 }, null);
    if (Math.abs(g41.fan[0].angleOffsetDeg + d60.halfAngle20dB) > 0.002 || Math.abs(g41.fan[20].angleOffsetDeg - d60.halfAngle20dB) > 0.002) f.push('fan[0]/fan[20] edges');
    if (!(g41.fan[40].angleOffsetDeg > d60.nullAngle) || !(Math.abs(g41.fan[24].angleOffsetDeg - d60.nullAngle) < 0.002)) f.push('ring/side-lobe offsets');
    // directivity rule (V2-1)
    const dw = makeDirW(d60, true), dwOff = makeDirW(d60, false);
    const lam0 = d60.lambda, ang = function (k) { return M.rad2deg(Math.asin(k * lam0 / 10)); };
    if (Math.abs(dw(ang(0.51)) - 0.712) > 0.02 || Math.abs(dw(ang(0.87)) - 0.316) > 0.03) f.push('directivity −3/−10 dB points');
    if (!(dw(0.999 * ang(1.22)) <= 0.02) || Math.abs(dw(ang(1.635)) - 0.13) > 0.02) f.push('directivity null / side lobe ' + dw(ang(1.635)));
    if (!(dw(ang(1.5)) > 0) || dwOff(ang(1.5)) !== 0) f.push('side-lobe floor rule');
    // (h) LOF on the right fusion face: 60° (leg 2) beats 45° by ≥ 6 dB (reduced scan)
    const pl = S.plateWeld({ T: 20 });
    const lof = S.defectPresets.lof(pl);
    const bestOf = function (angle, xs) {
      let b = 0;
      for (const x of xs) for (const e of run(pl, { angle, x }, { skips: 3 }, [lof], 100).echoes) if ((e.kind === 'defect' || e.kind === 'corner' || e.kind === 'tip') && e.amp > b) b = e.amp;
      return b;
    };
    const b60 = bestOf(60, [55, 60, 65]), b45 = bestOf(45, [40, 45, 50, 55]);
    if (!(b60 > 0) || dB(b60, Math.max(b45, 1e-9)) < 6) f.push('LOF 60 vs 45: ' + b60 + ' / ' + b45);
    // through transmission: clean plate transmits 1, a lamination under the probe blocks it
    const ttc = run(pl, { angle: 0, x: 40, method: 'tt' }, { skips: 3 }, [], 100).echoes[0];
    const ttb = run(pl, { angle: 0, x: 40, method: 'tt' }, { skips: 3 }, [S.defectPresets.lamination(pl)], 100).echoes[0];
    if (!ttc || ttc.kind !== 'transmitted' || Math.abs(ttc.amp - 1) > 1e-6 || Math.abs(ttc.path - 20) > 1e-6) f.push('tt clean');
    if (!ttb || ttb.amp > 0.05) f.push('tt shadow');
    // (i) volumetric: kind 'defect', amplitude independent of fanCount (SPEC NOTE 17)
    const pv = S.plateWeld({ T: 20, rootHeight: 0, capHeight: 0 });
    const por = S.defectPresets.porosity(pv);
    const volAmp = function (fc) {
      const p = Object.assign({ mode: 'shear', freq: 5, diameter: 10, wedgeVel: 2.74, method: 'pe', z: pv.L / 2, side: 1, skew: 0 }, { angle: 60, x: 19 });
      const r = trace({ specimen: pv, probe: p, derived: UT.probe.derive(p, pv), display: { skips: 3 }, defects: [por], opts: { maxPath: 100, fanCount: fc, maxLegs: 3 } });
      let m = 0, kinds = 0;
      for (const e of r.echoes) if (e.defectId !== undefined && e.kind !== 'tip' && e.kind !== 'modeconv') { kinds += e.kind === 'defect' ? 0 : 1; if (e.amp > m) m = e.amp; }
      return { m, kinds };
    };
    const v5 = volAmp(5), v21 = volAmp(21), v41 = volAmp(41);
    if (v21.kinds) f.push('volumetric echo kind not defect');
    if (!(v21.m > 0) || Math.abs(dB(v41.m, v21.m)) > 1 || Math.abs(dB(v5.m, v21.m)) > 1) f.push('volumetric amp vs fanCount: ' + v5.m + ' / ' + v21.m + ' / ' + v41.m);
    // (j) z-overlap 0 keeps the echo with amp 0 / finite ampNoZ (AUT re-weighting)
    const far = run(pw, { angle: 60, x: 34.6, z: 100 }, { skips: 3 }, [Object.assign({}, crack, { zFrom: 120, zTo: 150 })], 100);
    const farC = far.echoes.find(function (e) { return e.kind === 'corner'; });
    if (!farC || farC.amp !== 0 || !(farC.ampNoZ > 0)) f.push('Z = 0 corner echo dropped');
    // (k) flat root bead does not scatter; default bead echo ≥ 14 dB below the corner echo
    if (rc.echoes.some(function (e) { return e.kind === 'geometry' && e.tag === 'root'; })) f.push('flat root scatters');
    const pd = S.plateWeld({ T: 20 });
    const rcd = run(pd, { angle: 60, x: 31 }, { skips: 3 }, [S.defectPresets.rootCrack(pd)], 100);
    const cd = near(rcd.echoes, 'corner', 40, 2);
    const gd = rcd.echoes.filter(function (e) { return e.kind === 'geometry' && e.tag === 'root' && Math.abs(e.path - 40) < 4; }).sort(function (a, b) { return b.amp - a.amp; })[0];
    if (!cd) f.push('default weld corner echo missing');
    else if (gd && dB(cd.amp, gd.amp) < 14) f.push('root bead echo only ' + dB(cd.amp, gd.amp).toFixed(1) + ' dB below corner');
    // (l) TT: volumetric shadow ≥ 3 dB, narrow planar → partial shadow
    const ttv = run(pl, { angle: 0, x: 60, method: 'tt' }, { skips: 3 }, [{ id: 'v', type: 'volumetric', pts: [{ x: 55, y: 8 }, { x: 65, y: 8 }, { x: 65, y: 12 }, { x: 55, y: 12 }, { x: 55, y: 8 }], height: 4, zFrom: 120, zTo: 180 }], 100).echoes[0];
    if (!ttv || dB(1, ttv.amp) < 3) f.push('tt volumetric shadow ' + (ttv && ttv.amp));
    const ttp = run(pl, { angle: 0, x: 60, method: 'tt' }, { skips: 3 }, [{ id: 'p', type: 'planar', pts: [{ x: 57, y: 10 }, { x: 63, y: 10 }], height: 0.5, zFrom: 120, zTo: 180 }], 100).echoes[0];
    if (!ttp || !(ttp.amp > 0.05 && ttp.amp < 0.9)) f.push('tt partial shadow ' + (ttp && ttp.amp));
    // (m) skew does not touch volumetric echoes (§6.7: volumetric and SDH ×1)
    const skewAmp = function (skew) {
      const p = Object.assign({ mode: 'shear', freq: 5, diameter: 10, wedgeVel: 2.74, method: 'pe', z: (por.zFrom + por.zTo) / 2, side: 1, skew, angle: 60, x: 20 }, {});
      const r = trace({ specimen: pv, probe: p, derived: UT.probe.derive(p, pv), display: { skips: 3 }, defects: [por], opts: { maxPath: 100, fanCount: 21 } });
      let m = 0;
      for (const e of r.echoes) if (e.defectId === por.id && e.kind === 'defect' && e.amp > m) m = e.amp;
      return m;
    };
    const sk0 = skewAmp(0), sk10 = skewAmp(10);
    if (!(sk0 > 0) || sk0 !== sk10) f.push('volumetric echo skewed: ' + sk0 + ' vs ' + sk10);
    // (n) clean default weld: no strong bead cavity echo between half and full skip (SPEC NOTE 21)
    const pw2 = S.plateWeld({ T: 20, rootHeight: 1.5, capHeight: 2, bevel: 30, rootGap: 2, rootFace: 2, capWidth: 16 });
    let cavity = 0, cornerRef = 0;
    for (let x = 26; x <= 44; x += 2) {
      for (const e of run(pw2, { angle: 60, x }, { skips: 3 }, [], 150).echoes) if (e.kind === 'geometry' && e.path > 50 && e.amp > cavity) cavity = e.amp;
      for (const e of run(pw2, { angle: 60, x }, { skips: 3 }, [S.defectPresets.rootCrack(pw2)], 150).echoes) if (e.kind === 'corner' && e.amp > cornerRef) cornerRef = e.amp;
    }
    if (!(cornerRef > 0) || dB(cornerRef, Math.max(cavity, 1e-12)) < 14) f.push('bead cavity echo ' + cavity + ' vs corner ' + cornerRef);
    // (o) 70° corner reflector reads T/cos70 (SPEC NOTE 22)
    const c70 = near(run(pw, { angle: 70, x: 55, z: 150 }, { skips: 3 }, [Object.assign({}, crack, { zFrom: 100, zTo: 200 })], 100).echoes, 'corner', 20 / Math.cos(70 * DEG), 0.3);
    if (!c70) f.push('70 deg corner path != T/cos70');
    // (p) LOF response peaks with the beam axis at the face midpoint (SPEC NOTE 23, §11.1 #9)
    let lofBestX = 0, lofBest = 0;
    for (let x = 48; x <= 70; x += 1) {
      for (const e of run(pl, { angle: 60, x }, { skips: 3 }, [lof], 150).echoes) if (e.defectId === lof.id && e.kind === 'defect' && e.amp > lofBest) { lofBest = e.amp; lofBestX = x; }
    }
    if (!(lofBestX >= 57 && lofBestX <= 63)) f.push('LOF peak at x ' + lofBestX);
    // (q) V2 5 mm hole, 0°: echo at the near surface (SPEC NOTE 24); IOW SDH stays at its centre
    const v2h = run(S.v2({ face: 'narrow' }), { angle: 0, x: 60 }, { skips: 3 }, [], 50);
    if (!near(v2h.echoes, 'sdh', 3.75, 0.1)) f.push('V2 hole echo not at 3.75');
    // ---- v2 ----
    // (r) mode conversion coefficients and the reciprocal-path trap (V2-2)
    const mc30 = modeConvCoef('S', 30), mc40 = modeConvCoef('S', 40), mcL60 = modeConvCoef('L', 60);
    if (!(mc30.R >= 0.6) || Math.abs(mc30.phiOut - 65.6) > 1 || mc40.R !== 0 || !(mcL60.R >= 0.9)) f.push('modeConv coefficients ' + JSON.stringify([mc30, mc40, mcL60]));
    const trap = S.plateWeld({ T: 20, rootHeight: 0, capHeight: 0 });
    const incl = S.makeDefect({ type: 'planar', pts: [{ x: -3, y: 14 }, { x: 3, y: 9 }], zFrom: 135, zTo: 165, label: 'Inclined' });
    let mcBest = null, mcAny = null, mcOff = false;
    for (let x = 44; x <= 54; x += 0.5) {
      const r = run(trap, { angle: 60, x }, { skips: 3 }, [incl], 100, { physics: { modeConv: true } });
      for (const e of r.echoes) {
        if (e.kind !== 'modeconv') continue;
        if (!mcAny || e.amp > mcAny.amp) mcAny = e;
        if (Math.abs(e.tUs - 38.1) <= 1.0 && Math.abs(e.path - 61.7) <= 1.6 && (!mcBest || e.amp > mcBest.amp)) mcBest = e;
      }
      if (run(trap, { angle: 60, x }, { skips: 3 }, [incl], 100, { physics: { modeConv: false } }).echoes.some(function (e) { return e.kind === 'modeconv'; })) mcOff = true;
    }
    if (!mcBest) f.push('reciprocal-path modeconv echo missing (loudest: ' + (mcAny ? mcAny.tUs.toFixed(2) + ' us / ' + mcAny.path.toFixed(1) + ' mm' : 'none') + ')');
    else if (!(mcBest.amp > 0.02) || dB(mcAny.amp, mcBest.amp) > 3) f.push('reciprocal-path modeconv weak ' + mcBest.amp + ' vs ' + mcAny.amp);
    if (mcOff) f.push('modeconv echo with modeConv off');
    const rConv = run(trap, { angle: 60, x: 49 }, { skips: 3 }, [incl], 100);
    if (!Array.isArray(rConv.converted) || !rConv.converted.length || !rConv.converted[0].pts || !rConv.converted[0].mode) f.push('converted polylines');
    // (s) surface wave (V2-3): 70° at x 40 on the default weld → cap toe at x 8, path 34.8; dampers −40 dB; 60° → none
    const sw70 = run(pl, { angle: 70, x: 40 }, { skips: 3 }, [], 100);
    const sEcho = sw70.echoes.find(function (e) { return e.kind === 'surface'; });
    if (!sEcho || Math.abs(sEcho.path - 34.8) > 1.5 || sEcho.mode !== 'R' || !sw70.surface || !sw70.surface.pts.length) f.push('surface wave echo ' + (sEcho && sEcho.path));
    else {
      const sd = run(pl, { angle: 70, x: 40 }, { skips: 3 }, [], 100, { damping: { points: [20] } }).echoes.find(function (e) { return e.kind === 'surface' && Math.abs(e.path - sEcho.path) < 0.1; });
      if (sd && dB(sEcho.amp, sd.amp) < 30) f.push('damper only ' + dB(sEcho.amp, sd.amp).toFixed(1) + ' dB');
      if (run(pl, { angle: 70, x: 40 }, { skips: 3 }, [], 100, { physics: { surfaceWave: false } }).echoes.some(function (e) { return e.kind === 'surface'; })) f.push('surface wave with surfaceWave off');
    }
    if (run(pl, { angle: 60, x: 40 }, { skips: 3 }, [], 100).echoes.some(function (e) { return e.kind === 'surface'; })) f.push('60° surface wave');
    // (t) materials (V2-4 echo part): austenitic 25 mm backwall 4…7 dB below carbon; transfer loss; austenitic weld
    const pc = S.plateWeld({ T: 25 }), pa = S.plateWeld({ T: 25, material: 'austenitic' });
    const bwC = near(run(pc, { angle: 0, x: -60 }, { skips: 3 }, [], 100).echoes, 'backwall', 25, 0.5);
    const bwA = near(run(pa, { angle: 0, x: -60 }, { skips: 3 }, [], 100).echoes, 'backwall', 25, 0.5);
    if (!bwC || !bwA) f.push('material backwalls');
    else { const dd = dB(bwC.amp, bwA.amp); if (dd < 4 || dd > 7) f.push('austenitic backwall ' + dd.toFixed(2) + ' dB'); if (Math.abs(bwA.tUs - 2 * bwA.lenMm / 5.66) > 1e-9 || Math.abs(bwA.lenMm - 25) > 0.01) f.push('austenitic tUs'); }
    const bwT = near(run(pc, { angle: 0, x: -60 }, { skips: 3 }, [], 100, { transferLossDb: 4 }).echoes, 'backwall', 25, 0.5);
    if (!bwT || Math.abs(dB(bwC.amp, bwT.amp) - 4) > 0.01) f.push('transfer loss');
    const bwBlock = near(run(S.dacBlock({ T: 40 }), { angle: 0, x: 40 }, { skips: 3 }, [], 100, { transferLossDb: 4 }).echoes, 'backwall', 40, 0.5);
    const bwBlock0 = near(run(S.dacBlock({ T: 40 }), { angle: 0, x: 40 }, { skips: 3 }, [], 100).echoes, 'backwall', 40, 0.5);
    if (!bwBlock || !bwBlock0 || bwBlock.amp !== bwBlock0.amp) f.push('transfer loss applied to a block');
    const lofA = near(run(pl, { angle: 60, x: 60 }, { skips: 3 }, [lof], 100, { weldMaterial: 'austenitic' }).echoes, 'defect', 0, 200);
    const lofC = near(run(pl, { angle: 60, x: 60 }, { skips: 3 }, [lof], 100).echoes, 'defect', 0, 200);
    if (!lofA || !lofC || !(lofA.amp < lofC.amp)) f.push('austenitic weld metal attenuation');
    // (u) FBH block (V2-9 tracer part): 0° over ⌀3 at 30 → 'fbh' echo at 30, ⌀6 louder, weaker than the backwall at 60
    const fb = S.fbhBlock({ T: 60 });
    const f3 = near(run(fb, { angle: 0, x: 110 }, { skips: 3 }, [], 100).echoes, 'fbh', 30, 0.5);
    const f6 = near(run(fb, { angle: 0, x: 210 }, { skips: 3 }, [], 100).echoes, 'fbh', 30, 0.5);
    const fbw = near(run(fb, { angle: 0, x: 30 }, { skips: 3 }, [], 100).echoes, 'backwall', 60, 0.5);
    if (!f3 || !f6 || !fbw) f.push('fbh echoes');
    else if (!(f6.amp > f3.amp) || !(f3.amp < fbw.amp)) f.push('fbh law ' + f3.amp + ' ' + f6.amp + ' ' + fbw.amp);
    // no min(1, …) cap (§3.8): ⌀6 / ⌀3 at the same depth = (6/3)² = +12.04 dB exactly
    if (f3 && f6 && Math.abs(dB(f6.amp, f3.amp) - 20 * Math.log10(4)) > 0.05) f.push('fbh cap ' + dB(f6.amp, f3.amp).toFixed(2) + ' dB');
    // (w) twin-crystal angle probe (§3.5, SPEC NOTE 38): DAC block T 20, SDHs at depth 5/10/15 → 60° paths 10/20/30;
    //     twin-60-4 vs mwb60-4 (same 4 MHz 9×8 crystal): +3.52 dB at path 10, identical at 20 and 30
    const dac20 = S.dacBlock({ T: 20 });
    const sdhMax = function (libId, hole) {
      const pr = Object.assign({}, UT.probe.select(libId), { side: 1, z: dac20.defaultProbe ? dac20.defaultProbe.z : 0 });
      const x0 = hole.x + hole.y * Math.tan(60 * DEG);
      let best = 0;
      for (let x = x0 - 3; x <= x0 + 3.001; x += 0.5) {
        for (const e of run(dac20, Object.assign({ x }, pr), { skips: 3 }, [], 50).echoes) if (e.kind === 'sdh' && e.leg === 1 && Math.abs(e.path - hole.y / Math.cos(60 * DEG)) < 2 && e.amp > best) best = e.amp;
      }
      return best;
    };
    const dacHoles = (dac20.holes || []).filter(function (h) { return h.y <= 15.5; }).sort(function (a, b) { return a.y - b.y; });
    if (dacHoles.length < 3 || !UT.probe.select('twin-60-4') || !UT.probe.select('mwb60-4')) f.push('twin selftest setup');
    else {
      const tw = dacHoles.map(function (h) { return sdhMax('twin-60-4', h); }), sg = dacHoles.map(function (h) { return sdhMax('mwb60-4', h); });
      if (!(sg[0] > 0) || Math.abs(dB(tw[0], sg[0]) - 20 * Math.log10(TWIN_BOOST)) > 0.05) f.push('twin boost at path 10: ' + (sg[0] > 0 ? dB(tw[0], sg[0]).toFixed(2) : 'none') + ' dB');
      if (!(sg[1] > 0) || !(sg[2] > 0) || Math.abs(dB(tw[1], sg[1])) > 1e-6 || Math.abs(dB(tw[2], sg[2])) > 1e-6) f.push('twin boost beyond 15 mm');
    }
    // (x) surface wave on the V1 block (SPEC NOTE 33): 70° at x 100 towards the 100 mm radius → 'end' 1.0 at d = 100
    const v1s = run(S.v1({ face: 'wide' }), { angle: 70, x: 100, side: 1 }, { skips: 3 }, [], 400);
    const v1e = (v1s.echoes || []).find(function (e) { return e.kind === 'surface'; });
    if (!v1e || v1e.tag !== 'end' || v1e.surfaceRefl !== 1 || Math.abs(v1e.lenMm - 100) > 0.1 || Math.abs(v1e.path - 108) > 1) f.push('v1 block surface end ' + (v1e ? v1e.tag + ' ' + v1e.path.toFixed(1) : 'missing'));
    const v1r = v1s.surface && v1s.surface.reflectors[0];
    if (!v1r || v1r.kind !== 'end' || v1r.refl !== 1 || Math.abs(v1r.x) > 0.01) f.push('v1 block surface reflector ' + JSON.stringify(v1r));
    // (y) deep legs (SPEC NOTE 39): 0° / range 400 keeps its backwall multiples and holes; volumetric captures only up to leg 4
    const deep = run(S.plateWeld({ T: 20 }), { angle: 0, x: 40 }, { skips: 3 }, [S.defectPresets.porosity(S.plateWeld({ T: 20 }))], 400, { maxLegs: 42 });
    const bwN = deep.echoes.filter(function (e) { return e.kind === 'backwall'; }).length;
    if (bwN < 18) f.push('deep backwall multiples ' + bwN);
    if (deep.echoes.some(function (e) { return e.kind === 'defect' && e.leg > DEEP_LEGS; })) f.push('volumetric capture beyond DEEP_LEGS');
    // (v) weld preps (V2-23): trace without errors; backing bar → 'geometry' tag 'backing'
    for (const prep of ['single-bevel', 'j', 'single-v-backing', 'fillet-t', 'nozzle']) {
      try {
        const sp = S.plateWeld({ T: 20, prep });
        const d = S.defectPresets.lof(sp);
        run(sp, { angle: 60, x: sp.defaultProbe.x }, { skips: 3 }, [d], 100, { fanCount: 41 });
      } catch (e) { f.push(prep + ' trace threw ' + e.message); }
    }
    const bk = S.plateWeld({ T: 20, prep: 'single-v-backing' });
    let backing = false;
    for (let x = 20; x <= 60; x += 2) if (run(bk, { angle: 60, x }, { skips: 3 }, [], 120).echoes.some(function (e) { return e.kind === 'geometry' && e.tag === 'backing' && e.amp > 1e-3; })) backing = true;
    if (!backing) f.push('backing bar geometry echo missing');
    // describe (object with toString + category)
    const ds = describe({ kind: 'backwall', path: 25, leg: 1 });
    if (String(ds).indexOf('Backwall') < 0 || ds.category !== 'backwall') f.push('describe');
    if (describe({ kind: 'geometry', tag: 'root' }).category !== 'geometry-root' || describe({ kind: 'modeconv', conv: 'L' }).category !== 'modeconv' || describe({ kind: 'surface' }).category !== 'surface') f.push('describe categories');
    return f;
  }

  UT.rays = { trace, zFactor, describe, emission, dirAt, arcHit, mergeEchoes, modeConv: modeConvCoef, fanLayout, dirWeight: makeDirW, R_LS, R_SL, __selftest };
})(window.UT = window.UT || {});
