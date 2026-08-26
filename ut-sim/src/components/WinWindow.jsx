import { useRef, useState } from 'react'

/** Classic-Windows draggable floating window frame (drag by the title bar). */
export default function WinWindow({ title, initial, width, onClose, children, className = '' }) {
  const [pos, setPos] = useState(initial)
  const drag = useRef(null)
  const handlers = {
    onPointerDown: (e) => {
      drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e) => {
      if (!drag.current) return
      setPos({ x: drag.current.ox + e.clientX - drag.current.sx, y: drag.current.oy + e.clientY - drag.current.sy })
    },
    onPointerUp: () => {
      drag.current = null
    },
  }
  return (
    <div className={'absolute select-none ' + (className || 'z-50')} style={{ left: pos.x, top: pos.y, width }}>
      <div className="bevel-out shadow-[4px_4px_8px_rgba(0,0,0,0.35)]">
        <div
          {...handlers}
          className="flex cursor-move touch-none items-center gap-2 bg-[linear-gradient(90deg,#000080,#1084d0)] px-1.5 py-0.5 text-[11px] font-bold text-white"
        >
          {title}
          {onClose && (
            <button type="button" onClick={onClose} className="bevel-out ml-auto h-[15px] w-[17px] text-[9px] leading-none text-black">
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
