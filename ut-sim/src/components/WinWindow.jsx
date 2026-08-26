import { useRef, useState } from 'react'

/** Modern draggable floating panel (drag by the title bar). */
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
      <div className="overflow-hidden rounded-lg bg-white shadow-[0_12px_32px_rgb(0_0_0/0.18)] ring-1 ring-hairline">
        <div
          {...handlers}
          className="flex h-7 cursor-move touch-none items-center gap-2 bg-chrome px-2.5 text-[11px] font-medium text-white"
        >
          {title}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#e5484d] text-[8px] font-bold leading-none text-[#7a1216] transition-opacity hover:opacity-80"
            >
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
