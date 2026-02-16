/**
 * Hatch Side Coaming – vertical plate rising from the deck.
 * Positioned at the center of the deck along the length axis.
 */
export function CoamingPlate() {
  return (
    <mesh
      position={[0, 1.5, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[8, 3, 0.12]} />
      <meshStandardMaterial color="#5C5C5C" roughness={0.45} metalness={0.65} />
    </mesh>
  )
}
