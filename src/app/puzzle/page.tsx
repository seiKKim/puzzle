// app/puzzle/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Image from 'next/image'

/* ===================== Types ===================== */
interface Tile {
  id: number
  row: number
  col: number
  x: number
  y: number
  angle: number
  locked: boolean
  selected?: boolean
  groupId: number
}
interface Edges { top: number; right: number; bottom: number; left: number }
type Rect = { x: number; y: number; w: number; h: number }

/* ===================== Utils ===================== */
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const range = (n: number) => Array.from({ length: n }, (_, i) => i)
const isEdge = (r: number, c: number, rows: number, cols: number) => r === 0 || c === 0 || r === rows - 1 || c === cols - 1
const norm = (a: number) => (a % 360 + 360) % 360

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

// edges grid 만들기
function buildEdges(rows: number, cols: number, rng: () => number): Edges[][] {
  const edges: Edges[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ top: 0, right: 0, bottom: 0, left: 0 })),
  )
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const e = edges[r][c]
      e.top = r === 0 ? 0 : -edges[r - 1][c].bottom
      e.left = c === 0 ? 0 : -edges[r][c - 1].right
      e.right = c === cols - 1 ? 0 : rng() > 0.5 ? 1 : -1
      e.bottom = r === rows - 1 ? 0 : rng() > 0.5 ? 1 : -1
    }
  }
  return edges
}

// SVG path 생성
function buildPiecePath(w: number, h: number, e: Edges, knob = Math.min(w, h) * 0.22): string {
  const k = knob, cw = w / 2, ch = h / 2, c = k * 0.552
  const top = (s: number) => !s ? `L ${w} 0` : [
    `L ${cw - k} 0`,
    `C ${cw - k + c} 0 ${cw - c} ${-s * k} ${cw} ${-s * k}`,
    `C ${cw + c} ${-s * k} ${cw + k - c} 0 ${cw + k} 0`,
    `L ${w} 0`,
  ].join(' ')
  const right = (s: number) => !s ? `L ${w} ${h}` : [
    `L ${w} ${ch - k}`,
    `C ${w} ${ch - k + c} ${w + s * k} ${ch - c} ${w + s * k} ${ch}`,
    `C ${w + s * k} ${ch + c} ${w} ${ch + k - c} ${w} ${ch + k}`,
    `L ${w} ${h}`,
  ].join(' ')
  const bottom = (s: number) => !s ? `L 0 ${h}` : [
    `L ${cw + k} ${h}`,
    `C ${cw + k - c} ${h} ${cw + c} ${h + s * k} ${cw} ${h + s * k}`,
    `C ${cw - c} ${h + s * k} ${cw - k + c} ${h} ${cw - k} ${h}`,
    `L 0 ${h}`,
  ].join(' ')
  const left = (s: number) => !s ? `Z` : [
    `L 0 ${ch + k}`,
    `C 0 ${ch + k - c} ${-s * k} ${ch + c} ${-s * k} ${ch}`,
    `C ${-s * k} ${ch - c} 0 ${ch - k + c} 0 ${ch - k}`,
    `Z`,
  ].join(' ')
  return [`M 0 0`, top(e.top), right(e.right), bottom(e.bottom), left(e.left)].join(' ')
}

/* ---- 시작 시 겹치지 않게 흩뿌리기 ---- */
type Spawn = { x: number; y: number }
type R = { x: number; y: number; w: number; h: number }
const overlap = (a: R, b: R, gap: number) =>
  !((a.x + a.w + gap) <= b.x || (b.x + b.w + gap) <= a.x || (a.y + a.h + gap) <= b.y || (b.y + b.h + gap) <= a.y)

function generateNonOverlappingSpawnPositions(
  outerW: number, outerH: number, play: Rect,
  tileW: number, tileH: number, count: number, rng: () => number
): Spawn[] {
  const gapBase = Math.max(10, Math.round(Math.min(tileW, tileH) * 0.12))
  // 플레이 영역 바깥의 4방향 밴드
  const bands: R[] = [
    { x: 0, y: 0, w: Math.max(0, play.x), h: outerH },
    { x: play.x + play.w, y: 0, w: Math.max(0, outerW - (play.x + play.w)), h: outerH },
    { x: 0, y: 0, w: outerW, h: Math.max(0, play.y) },
    { x: 0, y: play.y + play.h, w: outerW, h: Math.max(0, outerH - (play.y + play.h)) },
  ]
  const candidates: R[] = []
  for (const b of bands) {
    if (b.w <= 0 || b.h <= 0) continue
    const stepX = tileW + gapBase
    const stepY = tileH + gapBase
    for (let y = b.y; y <= b.y + b.h - tileH; y += stepY) {
      for (let x = b.x; x <= b.x + b.w - tileW; x += stepX) {
        candidates.push({ x, y, w: tileW, h: tileH })
      }
    }
  }
  // 섞기
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp
  }

  const out: R[] = []
  const tryPick = (gap: number) => {
    for (const r of candidates) {
      if (out.length >= count) break
      let ok = !overlap(r, play, 0)
      if (ok) for (const c of out) { if (overlap(c, r, gap)) { ok = false; break } }
      if (ok) out.push(r)
    }
  }
  tryPick(gapBase)
  let gap = gapBase
  while (out.length < count && gap > 2) { gap = Math.floor(gap * 0.7); tryPick(gap) }

  // 부족하면 랜덤 보정
  let guard = 4000
  while (out.length < count && guard--) {
    const r: R = { x: Math.floor(rng() * (outerW - tileW)), y: Math.floor(rng() * (outerH - tileH)), w: tileW, h: tileH }
    if (overlap(r, play, 0)) continue
    let ok = true
    for (const c of out) { if (overlap(c, r, 4)) { ok = false; break } }
    if (ok) out.push(r)
  }
  return out.slice(0, count).map(({ x, y }) => ({ x, y }))
}

/* ===================== Component ===================== */
export default function PuzzlePage() {
  // URL에서 이미지/난이도 읽어서 초기 세팅
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [rows, setRows] = useState(4)
  const [cols, setCols] = useState(4)

  useEffect(() => {
    // 클라이언트에서만 실행
    const sp = new URLSearchParams(window.location.search)
    const img = sp.get('image')
    if (img) setImageUrl(decodeURIComponent(img))
    const diff = Number(sp.get('difficulty') || '')
    if (diff && Number.isFinite(diff)) {
      const n = Math.sqrt(diff)
      if (Number.isInteger(n) && n >= 2 && n <= 10) {
        setRows(n); setCols(n)
      }
    }
    // 이미지 없으면 기본값
    if (!img) {
      setImageUrl('https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop')
    }
  }, [])

  // UI 상태들
  const [bgOpacity, setBgOpacity] = useState(0.35)
  const [bgBlur, setBgBlur] = useState(true)
  const [snapTolerance, setSnapTolerance] = useState(50)
  const [boardScale, setBoardScale] = useState(1)
  const [showGuides, setShowGuides] = useState(true)
  const [edgesOnly, setEdgesOnly] = useState(false)
  const [rotationMode, setRotationMode] = useState(false)
  const [captureMode, setCaptureMode] = useState(false)

  // 타이머
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  // 레이아웃/보드
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [outerRect, setOuterRect] = useState({ w: 1100, h: 800 })
  useEffect(() => {
  const update = () => {
    if (!boardRef.current) return
    const r = boardRef.current.getBoundingClientRect()
    setOuterRect({ w: Math.round(r.width), h: Math.round(r.height) })
  }

  update()

  const ro = new ResizeObserver(update)
  const el = boardRef.current
  if (el) ro.observe(el)

  return () => {
    if (el) ro.unobserve(el)
    ro.disconnect()
  }
}, [])


  // 중앙 플레이 영역
  const playSize = Math.min(640, Math.max(400, Math.floor(Math.min(outerRect.w, outerRect.h) * 0.6)))
  const playW = playSize, playH = playSize
  const playX = Math.floor((outerRect.w - playW) / 2)
  const playY = Math.floor((outerRect.h - playH) / 2)
  const playRect: Rect = useMemo(() => ({ x: playX, y: playY, w: playW, h: playH }), [playX, playY, playW, playH])

  // 타일 크기/그리드
  const tileW = Math.floor(playW / cols)
  const tileH = Math.floor(playH / rows)

  const [tiles, setTiles] = useState<Tile[]>([])
  const [dragging, setDragging] = useState<{ ids: number[]; anchor: { dx: number; dy: number }[] } | null>(null)

  // 엣지 모양 고정
  const edgesGrid = useMemo(() => {
    const seed = hashString(`${imageUrl}|${rows}x${cols}`)
    const rng = mulberry32(seed)
    return buildEdges(rows, cols, rng)
  }, [imageUrl, rows, cols])

  // 스폰 위치 생성 & 섞기
  const clampIntoBoard = useCallback((x: number, y: number) => ({
    x: clamp(x, 0, outerRect.w - tileW),
    y: clamp(y, 0, outerRect.h - tileH),
  }), [outerRect.w, outerRect.h, tileW, tileH])

  const shuffle = useCallback(() => {
    if (!imageUrl) return
    const total = rows * cols
    const seed = hashString(`spawn|${outerRect.w}x${outerRect.h}|${playRect.x},${playRect.y},${playRect.w}x${playRect.h}|${rows}x${cols}`)
    const rng = mulberry32(seed)
    const spawns = generateNonOverlappingSpawnPositions(outerRect.w, outerRect.h, playRect, tileW, tileH, total, rng)

    const init = range(rows).flatMap(r =>
      range(cols).map(c => {
        const id = r * cols + c
        const pos = spawns[id] || { x: Math.random() * (outerRect.w - tileW), y: Math.random() * (outerRect.h - tileH) }
        const cl = clampIntoBoard(pos.x, pos.y)
        return { id, row: r, col: c, x: cl.x, y: cl.y, angle: 0, locked: false, groupId: id } as Tile
      }),
    )
    setTiles(init)
    setElapsed(0)
    setPaused(false)
  }, [imageUrl, rows, cols, outerRect.w, outerRect.h, playRect, tileW, tileH, clampIntoBoard])

  // 이미지/난이도 바뀌면 섞기
  useEffect(() => { shuffle() }, [shuffle])

  // 완료 여부
  const solved = useMemo(
    () => tiles.length > 0 && tiles.length === rows * cols && tiles.every(t => t.locked),
    [tiles, rows, cols],
  )

  // 타이머
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const loop = () => {
      const now = performance.now()
      if (!paused && !solved) setElapsed(e => e + (now - last) / 1000)
      last = now
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [paused, solved])

  // 단축키
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'c') setCaptureMode(v => !v)
      if (e.key === 'p') setPaused(v => !v)
      if (e.key === 'r') shuffle()
      if (e.key === 'g') setShowGuides(v => !v)
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && rotationMode) {
        e.preventDefault()
        rotateSelected(e.key === 'ArrowRight' ? 90 : -90)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rotationMode, shuffle])

  /* ---------------- Actions ---------------- */
  function toggleSelect(id: number) {
    setTiles(prev => {
      const me = prev.find(t => t.id === id)
      if (!me) return prev
      const gid = me.groupId
      const will = !me.selected
      return prev.map(t => (t.groupId === gid ? { ...t, selected: will } : t))
    })
  }
  function rotateSelected(delta: number) {
    setTiles(prev => prev.map(t => (t.selected && !t.locked ? { ...t, angle: (t.angle + delta + 360) % 360 } : t)))
  }

  // 드래그
  const onPointerDown = (e: React.PointerEvent, id: number) => {
    if (!boardRef.current) return
    const rect = boardRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    setTiles(prev => {
      let next = prev
      const t = next.find(x => x.id === id)
      if (!t || t.locked) return next

      if (captureMode) next = next.map(x => (x.id === id ? { ...x, selected: !x.selected } : x))
      else {
        const gid = t.groupId
        next = next.map(x => ({ ...x, selected: x.groupId === gid }))
      }

      const group = next.filter(x => x.selected && !x.locked)
      const anchors = group.map(g => ({ dx: px - g.x, dy: py - g.y }))
      setDragging({ ids: group.map(g => g.id), anchor: anchors })

      ;(e.target as Element)?.setPointerCapture?.(e.pointerId)
      return next
    })
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !boardRef.current) return
    const rect = boardRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    setTiles(prev => {
      const idSet = new Set(dragging.ids)
      return prev.map(t => {
        if (!idSet.has(t.id) || t.locked) return t
        const idx = dragging.ids.indexOf(t.id)
        const a = dragging.anchor[idx]
        return {
          ...t,
          x: clamp(px - a.dx, 0, Math.max(0, outerRect.w - tileW)),
          y: clamp(py - a.dy, 0, Math.max(0, outerRect.h - tileH)),
        }
      })
    })
  }
  const onPointerUp = () => {
    if (!dragging) return
    const ids = dragging.ids
    setDragging(null)

    setTiles(prev => {
      let next = prev

      // 1) 슬롯 스냅
      next = next.map(t => {
        if (!ids.includes(t.id) || t.locked) return t
        const slotX = playX + t.col * tileW
        const slotY = playY + t.row * tileH
        const dx = Math.abs(t.x - slotX)
        const dy = Math.abs(t.y - slotY)
        const angleOk = (t.angle % 360) === 0
        const shouldSnap = dx <= snapTolerance && dy <= snapTolerance && angleOk
        if (!shouldSnap) return t
        const cl = clampIntoBoard(slotX, slotY)
        return { ...t, x: cl.x, y: cl.y, angle: 0, locked: true, selected: false }
      })

      // 2) 그룹 결합(인터락)
      const idSet = new Set(ids)
      const getByRC = (r: number, c: number) => next.find(tt => tt.row === r && tt.col === c)
      const tryMergePair = (a: Tile, b: Tile, dir: 'R' | 'L' | 'T' | 'B') => {
        if (a.locked || b.locked) return false
        if ((a.angle % 360) !== (b.angle % 360)) return false
        const eA = edgesGrid[a.row][a.col], eB = edgesGrid[b.row][b.col]
        const ok =
          (dir === 'R' && eA.right === 1 && eB.left === -1) ||
          (dir === 'L' && eA.left === -1 && eB.right === 1) ||
          (dir === 'T' && eA.top === -1 && eB.bottom === 1) ||
          (dir === 'B' && eA.bottom === 1 && eB.top === -1)
        if (!ok) return false

        const expect = dir === 'R' ? { dx: tileW, dy: 0 } :
                       dir === 'L' ? { dx: -tileW, dy: 0 } :
                       dir === 'T' ? { dx: 0, dy: -tileH } : { dx: 0, dy: tileH }

        const ddx = Math.abs(b.x - a.x - expect.dx)
        const ddy = Math.abs(b.y - a.y - expect.dy)
        const tol = Math.max(30, Math.min(tileW, tileH) * 0.35) // 관대하게
        if (ddx > tol || ddy > tol) return false

        const from = b.groupId, to = a.groupId
        const offsetX = a.x + expect.dx - b.x
        const offsetY = a.y + expect.dy - b.y
        next = next.map(t => (t.groupId === from ? { ...t, groupId: to, x: t.x + offsetX, y: t.y + offsetY, angle: a.angle } : t))
        next = next.map(t => (t.groupId === to ? { ...t, ...clampIntoBoard(t.x, t.y) } : t))
        return true
      }

      let merged = true
      while (merged) {
        merged = false
        for (const a of next) {
          if (!idSet.has(a.id)) continue
          const rightN = getByRC(a.row, a.col + 1)
          const leftN = getByRC(a.row, a.col - 1)
          const topN = getByRC(a.row - 1, a.col)
          const bottomN = getByRC(a.row + 1, a.col)
          if (rightN && a.groupId !== rightN.groupId) merged = tryMergePair(a, rightN, 'R') || merged
          if (leftN && a.groupId !== leftN.groupId) merged = tryMergePair(a, leftN, 'L') || merged
          if (topN && a.groupId !== topN.groupId) merged = tryMergePair(a, topN, 'T') || merged
          if (bottomN && a.groupId !== bottomN.groupId) merged = tryMergePair(a, bottomN, 'B') || merged
        }
        const gids = new Set(next.filter(t => idSet.has(t.id)).map(t => t.groupId))
        const expanded = next.filter(t => gids.has(t.groupId)).map(t => t.id)
        for (const i of expanded) idSet.add(i)
      }

      // 3) 전체 조립되었으면 중앙으로 스냅
      const total = rows * cols
      const groups = new Map<number, Tile[]>()
      for (const t of next) {
  const id = t.groupId
  const arr = groups.get(id)
  if (arr) {
    arr.push(t)
  } else {
    groups.set(id, [t])
  }
}
      const tolAll = Math.max(25, Math.min(tileW, tileH) * 0.35)
      for (const [, group] of groups) {
        if (group.length !== total) continue
        const a0 = norm(group[0].angle)
        if (!group.every(t => norm(t.angle) === a0) || a0 !== 0) continue
        const baseX = group[0].x - group[0].col * tileW
        const baseY = group[0].y - group[0].row * tileH
        const fits = group.every(t =>
          Math.abs(t.x - (baseX + t.col * tileW)) <= tolAll &&
          Math.abs(t.y - (baseY + t.row * tileH)) <= tolAll,
        )
        if (!fits) continue
        const dx = playX - baseX, dy = playY - baseY
        const ids = new Set(group.map(t => t.id))
        next = next.map(t => ids.has(t.id) ? { ...t, x: Math.round(t.x + dx), y: Math.round(t.y + dy), angle: 0, locked: true, selected: false } : t)
        break
      }

      return next.sort((a, b) => Number(a.locked) - Number(b.locked))
    })
  }

  // 휠 회전/탭 회전
  const onWheel = (e: React.WheelEvent, id: number) => {
    if (!rotationMode) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? 90 : -90
    setTiles(prev => prev.map(t => (t.id === id || (t.selected && !t.locked)) ? { ...t, angle: (t.angle + delta + 360) % 360 } : t))
  }
  const onTileClick = (id: number) => {
    if (rotationMode) setTiles(prev => prev.map(t => (t.id === id || (t.selected && !t.locked)) ? { ...t, angle: (t.angle + 90) % 360 } : t))
  }

  // SVG 준비
  const knob = Math.min(tileW, tileH) * 0.22
  const pad = Math.round(knob + 6)
  const piecePaths = useMemo(
    () => range(rows).flatMap(r => range(cols).map(c => buildPiecePath(tileW, tileH, edgesGrid[r][c], knob))),
    [rows, cols, tileW, tileH, edgesGrid, knob],
  )

  /* ---------------- Render ---------------- */
  return (
    <div className="min-h-screen w-full bg-gray-50">
      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes celebration { 0% { transform: scale(0.5) rotate(-5deg); opacity: 0; } 50% { transform: scale(1.1) rotate(2deg); opacity: 1; } 100% { transform: scale(1.05) rotate(0deg); opacity: 1; } }
      `}</style>

      <div className="mx-auto max-w-[1400px] px-4 py-6">
        {/* Header */}
        <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-black px-2 py-1 text-xs font-semibold text-white">🧩 Puzzle</div>
            <div className="text-sm text-gray-600">{solved ? '완료!' : '진행 중'}</div>
            <div className="text-sm tabular-nums text-gray-700">⏱ {elapsed.toFixed(1)}s {paused && '(일시정지)'}</div>
            <div className="text-xs text-gray-500">완성: {tiles.filter(t => t.locked).length}/{tiles.length}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select className="rounded-md border px-2 py-1 text-sm" value={`${cols}x${rows}`}
              onChange={(e) => { const [c, r] = e.target.value.split('x').map(Number); setCols(c); setRows(r) }}>
              <option value="2x2">2 × 2</option>
              <option value="3x3">3 × 3</option>
              <option value="4x4">4 × 4</option>
              <option value="6x6">6 × 6</option>
            </select>

            <label className="flex items-center gap-2 text-sm">
              Snap(px)
              <input type="number" min={10} max={100} value={snapTolerance}
                onChange={(e) => setSnapTolerance(Number(e.target.value))}
                className="w-20 rounded-md border px-2 py-1 text-sm" />
            </label>

            <label className="flex items-center gap-2 text-sm">
              Scale
              <input type="range" min={0.6} max={1.4} step={0.05} value={boardScale}
                onChange={(e) => setBoardScale(Number(e.target.value))} />
            </label>

            <label className="flex items-center gap-2 text-sm">
              배경 불투명도
              <input type="range" min={0} max={1} step={0.05} value={bgOpacity}
                onChange={(e) => setBgOpacity(Number(e.target.value))} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={bgBlur} onChange={(e) => setBgBlur(e.target.checked)} />
              배경 흐림
            </label>

            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edgesOnly} onChange={(e) => setEdgesOnly(e.target.checked)} />Edges Only</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rotationMode} onChange={(e) => setRotationMode(e.target.checked)} />Rotation</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={captureMode} onChange={(e) => setCaptureMode(e.target.checked)} />Capture</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />Guides</label>

            <button onClick={shuffle} className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800">섞기</button>
            <button onClick={() => setPaused(v => !v)} className="rounded-lg border px-3 py-1.5 text-sm">{paused ? '재개' : '일시정지'}</button>
          </div>
        </header>

        {/* Board */}
        <div className="overflow-auto rounded-2xl border bg-neutral-100 p-4 shadow-md">
          <div
            className="relative mx-auto select-none rounded-xl border bg-neutral-200"
            ref={boardRef}
            style={{ width: outerRect.w, height: outerRect.h, transform: `scale(${boardScale})`, transformOrigin: 'top left' }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* 중앙 플레이 영역 배경 */}
            <div
  className="absolute rounded-xl overflow-hidden"
  style={{
    left: playX,
    top: playY,
    width: playW,
    height: playH,
    // 래퍼에 두면 이미지/타일 위에 동일하게 적용됩니다.
    opacity: bgOpacity,
    filter: bgBlur ? 'blur(2px) brightness(0.9) saturate(0.95)' : 'none',
  }}
>
  {/* 부모가 fill을 쓰니 position:relative가 필요합니다 */}
  <div className="relative" style={{ width: '100%', height: '100%' }}>
    {imageUrl && (
      <Image
        src={imageUrl}
        alt="puzzle background"
        fill                // 부모 박스를 가득 채움
        sizes={`${playW}px`} // LCP 최적화를 위한 힌트
        style={{ objectFit: 'cover', objectPosition: 'center' }}
        priority            // 배경이라면 LCP에 유리
        unoptimized={imageUrl.startsWith('blob:')} // 업로드(blob:)는 최적화 비활성화
      />
    )}
  </div>
</div>

            {/* 플레이 영역 외곽선 & 그리드 */}
            <div className="absolute rounded-xl border-2 border-dashed" style={{ left: playX, top: playY, width: playW, height: playH, borderColor: 'rgba(0,0,0,0.35)' }} />
            {showGuides && (
              <div className="pointer-events-none absolute" style={{ left: playX, top: playY, width: playW, height: playH }}>
                {range(rows + 1).map(r => (<div key={`r-${r}`} className="absolute left-0 right-0 border-t" style={{ top: r * tileH, borderColor: 'rgba(255,255,255,0.55)' }} />))}
                {range(cols + 1).map(c => (<div key={`c-${c}`} className="absolute top-0 bottom-0 border-l" style={{ left: c * tileW, borderColor: 'rgba(255,255,255,0.55)' }} />))}
              </div>
            )}

            {/* 타일들 */}
            {tiles.map(t => {
              if (edgesOnly && !isEdge(t.row, t.col, rows, cols) && !t.locked) return null
              const pathD = piecePaths[t.id]
              const clipId = `clip-${rows}-${cols}-${t.id}`
              const imgX = -t.col * tileW
              const imgY = -t.row * tileH
              const stroke = t.locked ? '#34d399' : t.selected ? '#60a5fa' : 'rgba(0,0,0,0.2)'

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
                    <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><path d={pathD} /></clipPath></defs>
                    <g clipPath={`url(#${clipId})`}>
  {imageUrl ? (
    <image
      href={imageUrl}
      x={imgX}
      y={imgY}
      width={playW}
      height={playH}
      preserveAspectRatio="xMidYMid slice"
    />
  ) : null}
</g>

                    <path d={pathD} fill="none" stroke={stroke} strokeWidth={t.selected ? 2 : 1} />
                  </svg>
                </div>
              )
            })}

            {/* 완료 팝업 */}
            {solved && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-50">
                <div className="relative">
                  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" style={{ animation: 'fadeIn 0.5s ease-out' }} />
                  <div className="relative bg-gradient-to-br from-yellow-200 via-orange-200 to-pink-200 rounded-2xl p-8 shadow-2xl border-4 border-yellow-300"
                       style={{ animation: 'celebration 1s ease-out', transform: 'scale(1.05)' }}>
                    <div className="text-center">
                      <div className="text-6xl mb-4">🎉✨🏆✨🎉</div>
                      <div className="text-3xl font-bold text-gray-800 mb-3">퍼즐 완성!</div>
                      <div className="bg-white/80 rounded-lg p-3 mb-4">
                        <div className="text-lg font-semibold text-gray-800">⏱ 완료 시간: {elapsed.toFixed(1)}초</div>
                        <div className="text-sm text-gray-600">{Math.floor(elapsed / 60)}분 {Math.floor(elapsed % 60)}초</div>
                      </div>
                      <button onClick={() => { shuffle(); setElapsed(0) }}
                        className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-xl font-semibold text-lg">
                        🎯 새 게임 시작하기
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="mt-4 text-center text-xs text-gray-500">
          메인 페이지에서 선택한 이미지가 퍼즐 조각으로 적용됩니다 · 조각은 회색 보드 내부에서만 이동합니다
        </footer>
      </div>
    </div>
  )
}
