import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useAppStore } from '../../store/useAppStore'

const COLOR_DEFAULT = new THREE.Color('#4A4A4A')
const COLOR_BCA1 = new THREE.Color('#0047AB')
const COLOR_BCA2 = new THREE.Color('#6B3FA0')

/**
 * Upper Deck Plate – large horizontal plane.
 * Changes color based on Measure 4/5 (BCA steel grade).
 */
export function DeckPlate() {
  const meshRef = useRef<THREE.Mesh>(null!)
  const measures = useAppStore((s) => s.measures)

  const targetColor =
    measures.measure4_5 === 'BCA2'
      ? COLOR_BCA2
      : measures.measure4_5 === 'BCA1'
        ? COLOR_BCA1
        : COLOR_DEFAULT

  useFrame(() => {
    if (!meshRef.current) return
    const mat = meshRef.current.material as THREE.MeshStandardMaterial
    mat.color.lerp(targetColor, 0.08)
  })

  return (
    <mesh ref={meshRef} position={[0, 0, 0]} receiveShadow>
      <boxGeometry args={[8, 0.15, 5]} />
      <meshStandardMaterial color={COLOR_DEFAULT} roughness={0.5} metalness={0.6} />
    </mesh>
  )
}
