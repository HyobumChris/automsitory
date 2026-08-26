import { useEffect, useRef, useState } from 'react'

function clampPos(p, el) {
  if (typeof window === 'undefined' || !el) return p
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.min(el.offsetWidth || 300, vw)
  const h = Math.min(el.offsetHeight || 200, vh)
  return {
    x: Math.min(Math.max(0, p.x), Math.max(0, vw - w)),
    y: Math.min(Math.max(0, p.y), Math.max(0, vh - h - 26)),
  }
}

/**
 * Modern draggable floating panel. Positions are clamped into the viewport
 * on mount and while dragging. With `dockable`, the window can dock as a
 * bottom sheet (default on narrow viewports via `initialDocked`) and be
 * floated again from the title-bar button.
 */
export default function WinWindow({
  title,
  initial,
  width,
  onClose,
  children,
  className = '',
  dockable = false,
  initialDocked = false,
}) {
  const [docked, setDocked] = useState(dockable && initialDocked)
  const [pos, setPos] = useState(initial ?? { x: 16, y: 16 })
  const elRef = useRef(null)
  const drag = useRef(null)

  // clamp into the viewport on mount and when undocking
  useEffect(() => {
    if (docked) return
    setPos((p) => clampPos(p, elRef.current))
  }, [docked])

  const handlers = {
    onPointerDown: (e) => {
      if (e.target.closest('button')) return // let title-bar buttons receive clicks
      drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e) => {
      if (!drag.current) return
      setPos(
        clampPos(
          { x: drag.current.ox + e.clientX - drag.current.sx, y: drag.current.oy + e.clientY - drag.current.sy },
          elRef.current,
        ),
      )
    },
    onPointerUp: () => {
      drag.current = null
    },
  }

  const titleBar = (isDocked) => (
    <div
      {...(isDocked ? {} : handlers)}
      className={
        'flex h-7 items-center gap-2 bg-chrome px-2.5 text-[11px] font-medium text-white ' +
        (isDocked ? '' : 'cursor-move touch-none')
      }
    >
      {title}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {dockable && (
          <button
            type="button"
            onClick={() => setDocked(!isDocked)}
            title={isDocked ? 'Float window (창 분리)' : 'Dock to bottom (하단 고정)'}
            className="flex h-4 w-4 items-center justify-center rounded-full bg-white/15 text-[8px] leading-none text-white transition-colors hover:bg-white/30"
          >
            {isDocked ? '⇱' : '⇲'}
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="flex h-4 w-4 items-center justify-center rounded-full bg-[#e5484d] text-[8px] font-bold leading-none text-[#7a1216] transition-opacity hover:opacity-80"
          >
            ✕
          </button>
        )}
      </span>
    </div>
  )

  if (docked) {
    return (
      <div ref={elRef} className="absolute inset-x-0 bottom-0 z-40 select-none">
        <div className="border-t border-black/40 bg-white shadow-[0_-10px_28px_rgb(0_0_0/0.25)]">
          {titleBar(true)}
          <div className="max-h-[46vh] overflow-auto">{children}</div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={elRef}
      className={'absolute select-none ' + (className || 'z-50')}
      style={{
        left: pos.x,
        top: pos.y,
        width: typeof width === 'number' ? 'min(' + width + 'px, 92vw)' : width,
        maxWidth: '96vw',
      }}
    >
      <div className="overflow-hidden rounded-lg bg-white shadow-[0_12px_32px_rgb(0_0_0/0.18)] ring-1 ring-hairline">
        {titleBar(false)}
        <div className="max-h-[calc(100vh-108px)] overflow-auto">{children}</div>
      </div>
    </div>
  )
}
