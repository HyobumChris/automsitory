import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useAppStore } from '../../store/useAppStore'

const COLOR_DEFAULT = new THREE.Color('#FF0000')
const COLOR_NDE = new THREE.Color('#FFD700')

interface WeldStripProps {
  /** 'deck' for DeckWeld, 'coaming' for CoamingWeld */
  type: 'deck' | 'coaming'
}

/**
 * Weld strip mesh.
 *
 * - DeckWeld: thin horizontal strip across the deck plate
 * - CoamingWeld: thin vertical strip on the coaming plate
 *
 * Visualization layers:
 *  Layer 1 (Measure 1): Turns gold with emissive glow
 *  Layer 2 (Measure 3): Shifts position (stagger ±150mm = ±0.15 units at 1:1 scale,
 *                        but we use 0.6 for visual clarity in the 3D scene)
 */
export function WeldStrip({ type }: WeldStripProps) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const measures = useAppStore((s) => s.measures)

  // Stagger offset direction: deck +X, coaming -X
  const staggerOffset = type === 'deck' ? 0.6 : -0.6
  const targetX = measures.measure3 ? staggerOffset : 0

  // Base position
  const basePosition = useMemo<[number, number, number]>(() => {
    if (type === 'deck') {
      // Horizontal strip across the deck
      return [0, 0.08, 0]
    }
    // Vertical strip on the coaming
    return [0, 1.5, 0.065]
  }, [type])

  // Geometry
  const geometry = useMemo<[number, number, number]>(() => {
    if (type === 'deck') {
      // Thin strip across the deck width (Z axis)
      return [0.08, 0.16, 5]
    }
    // Thin strip up the coaming height (Y axis)
    return [0.08, 3, 0.13]
  }, [type])

  // Target color and emissive
  const targetColor = measures.measure1 ? COLOR_NDE : COLOR_DEFAULT
  const targetEmissive = measures.measure1
    ? new THREE.Color('#FFD700')
    : new THREE.Color('#000000')
  const targetEmissiveIntensity = measures.measure1 ? 0.4 : 0

  useFrame(() => {
    if (!meshRef.current) return
    const mat = meshRef.current.material as THREE.MeshStandardMaterial

    // Smooth color transition
    mat.color.lerp(targetColor, 0.08)
    mat.emissive.lerp(targetEmissive, 0.08)
    mat.emissiveIntensity += (targetEmissiveIntensity - mat.emissiveIntensity) * 0.08

    // Smooth position transition (stagger)
    meshRef.current.position.x += (targetX + basePosition[0] - meshRef.current.position.x) * 0.06
  })

  return (
    <mesh
      ref={meshRef}
      position={basePosition}
      castShadow
    >
      <boxGeometry args={geometry} />
      <meshStandardMaterial
        color={COLOR_DEFAULT}
        roughness={0.3}
        metalness={0.5}
        emissive="#000000"
        emissiveIntensity={0}
      />
    </mesh>
  )
}
