import { Html } from '@react-three/drei'

/**
 * 3D scene annotations using drei's Html component.
 * Labels the main structural elements.
 */
export function Annotations() {
  return (
    <>
      {/* Upper Deck label */}
      <Html
        position={[3.5, 0.4, 2.2]}
        center
        distanceFactor={10}
        style={{ pointerEvents: 'none' }}
      >
        <div className="annotation">Upper Deck</div>
      </Html>

      {/* Hatch Coaming label */}
      <Html
        position={[-3.5, 2.8, 0.3]}
        center
        distanceFactor={10}
        style={{ pointerEvents: 'none' }}
      >
        <div className="annotation">Hatch Coaming</div>
      </Html>

      {/* Deck Butt Weld label */}
      <Html
        position={[0, -0.4, 2.8]}
        center
        distanceFactor={10}
        style={{ pointerEvents: 'none' }}
      >
        <div className="annotation annotation-weld">Deck Butt Weld</div>
      </Html>

      {/* Coaming Butt Weld label */}
      <Html
        position={[0, 3.2, 0.3]}
        center
        distanceFactor={10}
        style={{ pointerEvents: 'none' }}
      >
        <div className="annotation annotation-weld">Coaming Butt Weld</div>
      </Html>
    </>
  )
}
