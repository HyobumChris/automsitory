// Probe catalogue. wedgeDelayMm is the built-in wedge/shoe delay expressed
// in mm of beam path - the user must dial the matching PROBE ZERO to read true.

export const PROBES = [
  {
    id: 'comp-0',
    name: '0° Compression 10 mm 4 MHz',
    nameKo: '수직 탐촉자 (종파)',
    angle: 0,
    freqMHz: 4,
    crystalMm: 10,
    wedgeDelayMm: 2,
    halfAngleDeg: 4,
  },
  {
    id: 'shear-45',
    name: '45° Shear 8×9 mm 4 MHz',
    nameKo: '45° 사각 탐촉자 (횡파)',
    angle: 45,
    freqMHz: 4,
    crystalMm: 9,
    wedgeDelayMm: 8,
    halfAngleDeg: 5,
  },
  {
    id: 'shear-60',
    name: '60° Shear 8×9 mm 4 MHz',
    nameKo: '60° 사각 탐촉자 (횡파)',
    angle: 60,
    freqMHz: 4,
    crystalMm: 9,
    wedgeDelayMm: 10,
    halfAngleDeg: 5,
  },
  {
    id: 'shear-70',
    name: '70° Shear 8×9 mm 2 MHz',
    nameKo: '70° 사각 탐촉자 (횡파)',
    angle: 70,
    freqMHz: 2,
    crystalMm: 9,
    wedgeDelayMm: 12,
    halfAngleDeg: 6,
  },
]

export function getProbe(id) {
  return PROBES.find((p) => p.id === id) ?? PROBES[0]
}
