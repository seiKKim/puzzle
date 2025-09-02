// src/app/puzzle/page.tsx
// Next 15 + React 19 — Jigsaw Puzzle v3
// New: true jigsaw piece shapes (凸/凹) via SVG clipPath, seed-based matching tabs/blanks.
// Keeps: EdgesOnly / Capture / Rotation / Timer / Snap-to-slot(+angle)

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

// ---------------- Types ----------------
interface Tile {
  id: number
  row: number
  col: number
  x: number
  y: number
  angle: number // 0,90,180,270
  locked: boolean
  selected?: boolean
  groupId: number // 그룹 결합: 같은 groupId는 함께 이동
}

interface Edges { top: number; right: number; bottom: number; left: number }

// ---------------- Utils ----------------
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const range = (n: number) => Array.from({ length: n }, (_, i) => i)
const isEdge = (r: number, c: number, rows: number, cols: number) => r === 0 || c === 0 || r === rows - 1 || c === cols - 1

// Simple seeded PRNG (Mulberry32)
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) || 1
}

function randomEdgePosition(boardW: number, boardH: number, tileW: number, tileH: number) {
  const edge = Math.floor(Math.random() * 4)
  const pad = 8
  switch (edge) {
    case 0: return { x: Math.random() * (boardW - tileW), y: -tileH - pad }
    case 1: return { x: boardW + pad, y: Math.random() * (boardH - tileH) }
    case 2: return { x: Math.random() * (boardW - tileW), y: boardH + pad }
    default: return { x: -tileW - pad, y: Math.random() * (boardH - tileH) }
  }
}

// Build edges grid with matching tabs/blanks: -1(blank), 0(flat outer), 1(tab)
function buildEdges(rows: number, cols: number, rng: () => number): Edges[][] {
  const edges: Edges[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ top: 0, right: 0, bottom: 0, left: 0 })))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const e = edges[r][c]
      // top
      if (r === 0) e.top = 0
      else e.top = -edges[r - 1][c].bottom
      // left
      if (c === 0) e.left = 0
      else e.left = -edges[r][c - 1].right
      // right (decide unless border)
      if (c === cols - 1) e.right = 0
      else e.right = rng() > 0.5 ? 1 : -1
      // bottom (decide unless border)
      if (r === rows - 1) e.bottom = 0
      else e.bottom = rng() > 0.5 ? 1 : -1
    }
  }
  return edges
}

// Build SVG path for a single piece given its 4 edges
function buildPiecePath(w: number, h: number, e: Edges, knob = Math.min(w, h) * 0.22): string {
  const k = knob // knob size
  const cw = w / 2
  const ch = h / 2
  const c = k * 0.552 // bezier approximation for circular bumps

  // Helpers to draw each side. sign: -1 (blank, inward), 0 (flat), 1 (tab, outward)
  const top = (sign: number) => {
    if (!sign) return `L ${w} 0`
    return [
      `L ${cw - k} 0`,
      `C ${cw - k + c} 0 ${cw - c} ${-sign * k} ${cw} ${-sign * k}`,
      `C ${cw + c} ${-sign * k} ${cw + k - c} 0 ${cw + k} 0`,
      `L ${w} 0`,
    ].join(' ')
  }

  const right = (sign: number) => {
    if (!sign) return `L ${w} ${h}`
    return [
      `L ${w} ${ch - k}`,
      `C ${w} ${ch - k + c} ${w + sign * k} ${ch - c} ${w + sign * k} ${ch}`,
      `C ${w + sign * k} ${ch + c} ${w} ${ch + k - c} ${w} ${ch + k}`,
      `L ${w} ${h}`,
    ].join(' ')
  }

  const bottom = (sign: number) => {
    if (!sign) return `L 0 ${h}`
    return [
      `L ${cw + k} ${h}`,
      `C ${cw + k - c} ${h} ${cw + c} ${h + sign * k} ${cw} ${h + sign * k}`,
      `C ${cw - c} ${h + sign * k} ${cw - k + c} ${h} ${cw - k} ${h}`,
      `L 0 ${h}`,
    ].join(' ')
  }

  const left = (sign: number) => {
    if (!sign) return `Z`
    return [
      `L 0 ${ch + k}`,
      `C 0 ${ch + k - c} ${-sign * k} ${ch + c} ${-sign * k} ${ch}`,
      `C ${-sign * k} ${ch - c} 0 ${ch - k + c} 0 ${ch - k}`,
      `Z`,
    ].join(' ')
  }

  // Start at (0,0)
  return [`M 0 0`, top(e.top), right(e.right), bottom(e.bottom), left(e.left)].join(' ')
}

// ---------------- Component ----------------
export default function PuzzlePage() {
  // Core state
  const [imageUrl, setImageUrl] = useState('https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop')
  const [cols, setCols] = useState(6)
  const [rows, setRows] = useState(4)
  const [snapTolerance, setSnapTolerance] = useState(22)
  const [boardScale, setBoardScale] = useState(1)

  // UX toggles
  const [edgesOnly, setEdgesOnly] = useState(false)
  const [rotationMode, setRotationMode] = useState(false)
  const [captureMode, setCaptureMode] = useState(false)

  // Timer
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  // Layout
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [boardRect, setBoardRect] = useState({ w: 960, h: 640 })
  const tileW = Math.floor(boardRect.w / cols)
  const tileH = Math.floor(boardRect.h / rows)

  // Tiles
  const [tiles, setTiles] = useState<Tile[]>([])
  const [dragging, setDragging] = useState<{ ids: number[]; anchor: { dx: number; dy: number }[] } | null>(null)

  // Seeded edges (stable for given image/grid)
  const edgesGrid = useMemo(() => {
    const seed = hashString(`${imageUrl}|${rows}x${cols}`)
    const rng = mulberry32(seed)
    return buildEdges(rows, cols, rng)
  }, [imageUrl, rows, cols])

  const slots = useMemo(() => range(rows).flatMap(r => range(cols).map(c => ({ id: r * cols + c, x: c * tileW, y: r * tileH }))), [rows, cols, tileW, tileH])

  // Init / Shuffle
  const shuffle = () => {
    const w = boardRef.current?.clientWidth ?? boardRect.w
    const h = boardRef.current?.clientHeight ?? boardRect.h
    const init = range(rows).flatMap(r => range(cols).map(c => {
      const id = r * cols + c
      const pos = randomEdgePosition(w, h, tileW, tileH)
      return { id, row: r, col: c, x: pos.x, y: pos.y, angle: 0, locked: false, groupId: id } as Tile
    }))
    setTiles(init)
    setElapsed(0); setPaused(false)
  }

  // Resize observer
  useEffect(() => {
    const update = () => {
      if (!boardRef.current) return
      const r = boardRef.current.getBoundingClientRect()
      setBoardRect({ w: Math.round(r.width), h: Math.round(r.height) })
    }
    update()
    const ro = new ResizeObserver(update)
    if (boardRef.current) ro.observe(boardRef.current)
    return () => ro.disconnect()
  }, [])

  // Grid/image change → shuffle
  useEffect(() => { shuffle() }, [rows, cols, imageUrl])

  // Timer
  useEffect(() => {
    let raf: number
    let last = performance.now()
    const loop = () => {
      const now = performance.now()
      if (!paused) setElapsed(e => e + (now - last) / 1000)
      last = now
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [paused])

  // Shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'c') setCaptureMode(v => !v)
      if (e.key === 'p') setPaused(v => !v)
      if (e.key === 'r') rearrangeLooseToPerimeter()
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && rotationMode) {
        e.preventDefault()
        rotateSelected(e.key === 'ArrowRight' ? 90 : -90)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rotationMode])

  // Actions
  function toggleSelect(id: number) {
    setTiles(prev => {
      const me = prev.find(t => t.id === id)
      if (!me) return prev
      // 같은 그룹 모두 토글
      const gid = me.groupId
      const willSelect = !me.selected
      return prev.map(t => t.groupId === gid ? { ...t, selected: willSelect } : t)
    })
  }
  function clearSelection() { setTiles(prev => prev.map(t => ({ ...t, selected: false }))) }
  function rotateSelected(delta: number) { setTiles(prev => prev.map(t => t.selected && !t.locked ? { ...t, angle: ((t.angle + delta + 360) % 360) } : t)) }
  function rearrangeLooseToPerimeter() {
    const w = boardRect.w, h = boardRect.h
    setTiles(prev => prev.map(t => {
      if (t.locked) return t
      const pos = randomEdgePosition(w, h, tileW, tileH)
      return { ...t, x: pos.x, y: pos.y }
    }))
  }

  // Pointer handlers
  const onPointerDown = (e: React.PointerEvent, id: number) => {
    const board = boardRef.current
    if (!board) return
    const rect = board.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    setTiles(prev => {
      let next = prev
      const t = next.find(x => x.id === id)
      if (!t || t.locked) return next

      if (captureMode) next = next.map(x => x.id === id ? { ...x, selected: !x.selected } : x)
      else {
        // 단일 드래그: 해당 타일의 그룹 전체 선택
        const me = next.find(x => x.id === id)!
        const gid = me.groupId
        next = next.map(x => ({ ...x, selected: x.groupId === gid }))
      }

      const group = next.filter(x => x.selected && !x.locked)
      const anchors = group.map(g => ({ dx: px - g.x, dy: py - g.y }))
      setDragging({ ids: group.map(g => g.id), anchor: anchors })
      ;(e.target as Element).setPointerCapture(e.pointerId)
      return next
    })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const board = boardRef.current
    if (!board) return
    const rect = board.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    setTiles(prev => {
      const idSet = new Set(dragging.ids)
      return prev.map((t) => {
        if (!idSet.has(t.id) || t.locked) return t
        const idx = dragging.ids.indexOf(t.id)
        const a = dragging.anchor[idx]
        return { ...t, x: clamp(px - a.dx, -tileW - 48, boardRect.w + 48), y: clamp(py - a.dy, -tileH - 48, boardRect.h + 48) }
      })
    })
  }

  const onPointerUp = () => {
    if (!dragging) return
    const ids = dragging.ids
    setDragging(null)

    setTiles(prev => {
      let next = prev
      // 1) 슬롯 스냅 시도 (각도 0)
      next = next.map(t => {
        if (!ids.includes(t.id) || t.locked) return t
        const slotX = t.col * tileW
        const slotY = t.row * tileH
        const dx = Math.abs(t.x - slotX)
        const dy = Math.abs(t.y - slotY)
        const angleOk = (t.angle % 360) === 0
        const shouldSnap = dx <= snapTolerance && dy <= snapTolerance && angleOk
        return shouldSnap ? { ...t, x: slotX, y: slotY, angle: 0, locked: true, selected: false } : t
      })

      // 2) 그룹 결합(인터락) 시도: 드래그한 그룹의 모든 타일 기준으로 인접 4방 검사
      const idSet = new Set(ids)
      const getByRC = (r: number, c: number) => next.find(tt => tt.row === r && tt.col === c)
      const tryMergePair = (a: Tile, b: Tile, dir: 'R'|'L'|'T'|'B') => {
        if (a.locked || b.locked) return false
        if ((a.angle % 360) !== (b.angle % 360)) return false
        // 엣지 모양이 서로 보완적인지 확인
        const eA = edgesGrid[a.row][a.col]
        const eB = edgesGrid[b.row][b.col]
        const ok = (
          (dir === 'R' && eA.right === 1 && eB.left === -1) ||
          (dir === 'L' && eA.left === -1 && eB.right === 1) ||
          (dir === 'T' && eA.top === -1 && eB.bottom === 1) ||
          (dir === 'B' && eA.bottom === 1 && eB.top === -1)
        )
        if (!ok) return false
        // 기대 좌표 차이
        const expect = (
          dir === 'R' ? { dx: tileW, dy: 0 } :
          dir === 'L' ? { dx: -tileW, dy: 0 } :
          dir === 'T' ? { dx: 0, dy: -tileH } : { dx: 0, dy: tileH }
        )
        const ddx = Math.abs((b.x - a.x) - expect.dx)
        const ddy = Math.abs((b.y - a.y) - expect.dy)
        const tol = Math.max(10, Math.min(tileW, tileH) * 0.18)
        if (ddx > tol || ddy > tol) return false

        // merge: 두 그룹을 하나로 통합하고, 틈새 보정 스냅
        const from = b.groupId
        const to = a.groupId
        const offsetX = a.x + expect.dx - b.x
        const offsetY = a.y + expect.dy - b.y
        next = next.map(t => t.groupId === from ? { ...t, groupId: to, x: t.x + offsetX, y: t.y + offsetY, angle: a.angle } : t)
        return true
      }

      // 인접 검사 루프 (새로 합쳐진 것까지 연쇄적으로 시도)
      let merged = true
      while (merged) {
        merged = false
        for (const a of next) {
          if (!idSet.has(a.id)) continue // 드래그 그룹 기준으로만 확장
          // 4방 이웃
          const rightN = getByRC(a.row, a.col + 1)
          const leftN = getByRC(a.row, a.col - 1)
          const topN = getByRC(a.row - 1, a.col)
          const bottomN = getByRC(a.row + 1, a.col)
          if (rightN && a.groupId !== rightN.groupId) merged = tryMergePair(a, rightN, 'R') || merged
          if (leftN && a.groupId !== leftN.groupId) merged = tryMergePair(a, leftN, 'L') || merged
          if (topN && a.groupId !== topN.groupId) merged = tryMergePair(a, topN, 'T') || merged
          if (bottomN && a.groupId !== bottomN.groupId) merged = tryMergePair(a, bottomN, 'B') || merged
        }
        // 드래그 id 집합을, 방금 합쳐진 groupId로 갱신해 연쇄 결합 이어가기
        const gids = new Set(next.filter(t => idSet.has(t.id)).map(t => t.groupId))
        const expanded = next.filter(t => gids.has(t.groupId)).map(t => t.id)
        for (const i of expanded) idSet.add(i)
      }

      // 시각층 정렬: locked 아래, 그 외 위
      return next.sort((a, b) => Number(a.locked) - Number(b.locked))
    })
  }

  // Wheel rotate (when rotation mode)
  const onWheel = (e: React.WheelEvent, id: number) => {
    if (!rotationMode) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? 90 : -90
    setTiles(prev => prev.map(t => (t.id === id || (t.selected && !t.locked)) ? { ...t, angle: ((t.angle + delta + 360) % 360) } : t))
  }

  // Tap rotate on mobile
  const onTileClick = (id: number) => { if (rotationMode) setTiles(prev => prev.map(t => (t.id === id || (t.selected && !t.locked)) ? { ...t, angle: ((t.angle + 90) % 360) } : t)) }

  const solved = useMemo(() => tiles.length > 0 && tiles.every(t => t.locked), [tiles])

  const presets = [
    { label: 'Vibrant Vibes', url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop' },
    { label: 'Mountains', url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=1600&auto=format&fit=crop' },
    { label: 'City Night', url: 'https://images.unsplash.com/photo-1482192596544-9eb780fc7f66?q=80&w=1600&auto=format&fit=crop' },
  ]

  // Precompute piece paths per tile (memo to avoid re-gen every render)
  const knob = Math.min(tileW, tileH) * 0.22
  const pad = Math.round(knob + 6) // svg viewBox padding to include protrusions

  const piecePaths = useMemo(() => {
    return range(rows).flatMap(r => range(cols).map(c => buildPiecePath(tileW, tileH, edgesGrid[r][c], knob)))
  }, [rows, cols, tileW, tileH, edgesGrid, knob])

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-black px-2 py-1 text-xs font-semibold text-white">🧩 Puzzle</div>
            <div className="text-sm text-gray-600">{solved ? '완료!' : '진행 중'}</div>
            <div className="text-sm tabular-nums text-gray-700">⏱ {elapsed.toFixed(1)}s {paused && '(일시정지)'}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              이미지 URL
              <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" className="w-[320px] rounded-md border px-2 py-1 text-sm" />
            </label>

            <select className="rounded-md border px-2 py-1 text-sm" value={`${cols}x${rows}`} onChange={(e) => { const [c, r] = e.target.value.split('x').map(Number); setCols(c); setRows(r) }}>
              <option value="3x2">3 × 2</option>
              <option value="4x3">4 × 3</option>
              <option value="6x4">6 × 4</option>
              <option value="8x6">8 × 6</option>
            </select>

            <label className="flex items-center gap-2 text-sm">
              Snap(px)
              <input type="number" min={6} max={64} value={snapTolerance} onChange={(e) => setSnapTolerance(Number(e.target.value))} className="w-20 rounded-md border px-2 py-1 text-sm" />
            </label>

            <label className="flex items-center gap-2 text-sm">
              Scale
              <input type="range" min={0.6} max={1.4} step={0.05} value={boardScale} onChange={(e) => setBoardScale(Number(e.target.value))} />
            </label>

            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edgesOnly} onChange={(e) => setEdgesOnly(e.target.checked)} />Edges Only</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rotationMode} onChange={(e) => setRotationMode(e.target.checked)} />Rotation</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={captureMode} onChange={(e) => setCaptureMode(e.target.checked)} />Capture</label>

            <button onClick={shuffle} className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800">섞기</button>
            <button onClick={() => setPaused(v => !v)} className="rounded-lg border px-3 py-1.5 text-sm">{paused ? '재개' : '일시정지'}</button>
          </div>
        </header>

        <div className="mb-3 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p.label} onClick={() => setImageUrl(p.url)} className={`rounded-md border px-2 py-1 text-sm ${imageUrl === p.url ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'}`}>{p.label}</button>
          ))}
          <div className="text-xs text-gray-500">단축키: c(캡처), r(가장자리로), p(타이머), ←/→(회전)</div>
        </div>

        {/* Board */}
        <div className="overflow-auto rounded-2xl border bg-white p-4 shadow-md">
          <div className="mx-auto select-none" style={{ width: boardRect.w, height: boardRect.h, transform: `scale(${boardScale})`, transformOrigin: 'top left' }}>
            <div
              ref={boardRef}
              className="relative mx-auto aspect-[3/2] w-[960px] max-w-full overflow-visible rounded-xl border bg-neutral-100"
              style={{ backgroundImage: `url(${imageUrl})`, backgroundSize: `${boardRect.w}px ${boardRect.h}px`, backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {/* Grid guide */}
              <div className="pointer-events-none absolute inset-0">
                {range(rows).map((r) => (<div key={r} className="absolute left-0 right-0 border-t border-white/40" style={{ top: r * tileH }} />))}
                {range(cols).map((c) => (<div key={c} className="absolute top-0 bottom-0 border-l border-white/40" style={{ left: c * tileW }} />))}
              </div>

              {/* Tiles (SVG clipped) */}
              {tiles.map((t) => {
                if (edgesOnly && !isEdge(t.row, t.col, rows, cols) && !t.locked) return null
                const pathD = piecePaths[t.id]
                const clipId = `clip-${rows}-${cols}-${t.id}`
                const imgX = -t.col * tileW
                const imgY = -t.row * tileH
                const stroke = t.locked ? '#34d399' : t.selected ? '#60a5fa' : 'rgba(0,0,0,0.15)'

                return (
                  <div
                    key={t.id}
                    role="button"
                    aria-label={`tile-${t.id}`}
                    className="absolute cursor-grab touch-none"
                    style={{ left: t.x, top: t.y, width: tileW, height: tileH, zIndex: t.locked ? 1 : 2 }}
                    onPointerDown={(e) => onPointerDown(e, t.id)}
                    onWheel={(e) => onWheel(e, t.id)}
                    onClick={() => (captureMode ? toggleSelect(t.id) : onTileClick(t.id))}
                  >
                    <svg
                      width={tileW + pad * 2}
                      height={tileH + pad * 2}
                      viewBox={`${-pad} ${-pad} ${tileW + pad * 2} ${tileH + pad * 2}`}
                      style={{ pointerEvents: 'none', transform: `rotate(${t.angle}deg)`, transformOrigin: 'center' }}
                    >
                      <defs>
                        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                          <path d={pathD} />
                        </clipPath>
                      </defs>
                      <g clipPath={`url(#${clipId})`}>
                        <image href={imageUrl} x={imgX} y={imgY} width={boardRect.w} height={boardRect.h} preserveAspectRatio="none"/>
                      </g>
                      {/* outline */}
                      <path d={pathD} fill="none" stroke={stroke} strokeWidth={t.selected ? 2 : 1} />
                    </svg>
                  </div>
                )
              })}

              {solved && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-xl bg-black/60 px-6 py-3 text-white shadow-xl">🎉 퍼즐 완료! 다시 &quot;섞기&quot;를 눌러보세요.</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="mt-4 text-center text-xs text-gray-500">SVG clipPath 기반 인터락 조각. Seed 고정으로 양쪽 맞물림 유지.</footer>
      </div>
    </div>
  )
}
