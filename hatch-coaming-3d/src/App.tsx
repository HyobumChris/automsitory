import { SceneSetup } from './components/scene/SceneSetup'
import { ControlPanel } from './components/ui/ControlPanel'
import { InfoBar } from './components/ui/InfoBar'

export default function App() {
  return (
    <div className="app-root">
      <InfoBar />
      <main className="app-main">
        <div className="scene-container">
          <SceneSetup />
        </div>
        <ControlPanel />
      </main>
    </div>
  )
}
