import { IsometricView } from './components/scene/IsometricView'
import { ControlPanel } from './components/ui/ControlPanel'
import { InfoBar } from './components/ui/InfoBar'
import { DetailPanel } from './components/ui/DetailPanel'

export default function App() {
  return (
    <div className="app-root">
      <InfoBar />
      <main className="app-main">
        <aside className="left-panel">
          <ControlPanel />
        </aside>
        <div className="center-area">
          <div className="scene-container">
            <IsometricView />
          </div>
          <DetailPanel />
        </div>
      </main>
    </div>
  )
}
