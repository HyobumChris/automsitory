import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei'
import { DeckPlate } from './DeckPlate'
import { CoamingPlate } from './CoamingPlate'
import { WeldStrip } from './WeldStrip'
import { Annotations } from './Annotations'

/**
 * Main 3D scene with isometric-like camera and all structural components.
 */
export function SceneSetup() {
  return (
    <Canvas
      shadows
      camera={{
        position: [7, 5, 7],
        fov: 35,
        near: 0.1,
        far: 100,
      }}
      style={{ background: '#0f172a' }}
    >
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-4, 6, -4]} intensity={0.3} />

      {/* Environment for reflections */}
      <Environment preset="city" />

      {/* Ground shadows */}
      <ContactShadows
        position={[0, -0.08, 0]}
        opacity={0.4}
        scale={15}
        blur={2}
        far={6}
      />

      {/* Structural components */}
      <DeckPlate />
      <CoamingPlate />
      <WeldStrip type="deck" />
      <WeldStrip type="coaming" />

      {/* Annotations */}
      <Annotations />

      {/* Grid helper */}
      <gridHelper args={[20, 20, '#1e3a5f', '#1e3a5f']} position={[0, -0.09, 0]} />

      {/* Camera controls */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={5}
        maxDistance={25}
        maxPolarAngle={Math.PI / 2}
      />
    </Canvas>
  )
}
