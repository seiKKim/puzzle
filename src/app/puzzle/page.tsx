// app/puzzle/page.tsx
// 홈페이지에서 선택한 이미지가 제대로 전달되도록 수정 + 효과음(SFX) 추가

'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'

import { useSearchParams } from 'next/navigation'

// ---------------- Types ----------------
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
interface Edges {
  top: number
  right: number
  bottom: number
  left: number
}
type Rect = { x: number; y: number; w: number; h: number }

// ---------------- Utils ----------------
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const range = (n: number) => Array.from({ length: n }, (_, i) => i)
const isEdge = (r: number, c: number, rows: number, cols: number) =>
  r === 0 || c === 0 || r === rows - 1 || c === cols - 1
const norm = (a: number) => (a % 360 + 360) % 360

type PointerCaptureTarget = Element & { setPointerCapture(pointerId: number): void }
function isPointerCaptureTarget(t: EventTarget | null): t is PointerCaptureTarget {
  return !!t && typeof (t as Element).setPointerCapture === 'function'
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
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

function buildEdges(rows: number, cols: number, rng: () => number): Edges[][] {
  const edges: Edges[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ top: 0, right: 0, bottom: 0, left: 0 })),
  )
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const e = edges[r][c]
      if (r === 0) e.top = 0
      else e.top = -edges[r - 1][c].bottom

      if (c === 0) e.left = 0
      else e.left = -edges[r][c - 1].right

      if (c === cols - 1) e.right = 0
      else e.right = Math.random() > 0.5 ? 1 : -1

      if (r === rows - 1) e.bottom = 0
      else e.bottom = Math.random() > 0.5 ? 1 : -1
    }
  }
  return edges
}

function buildPiecePath(w: number, h: number, e: Edges, knob = Math.min(w, h) * 0.22): string {
  const k = knob, cw = w / 2, ch = h / 2, c = k * 0.552
  const top = (s: number) =>
    !s
      ? `L ${w} 0`
      : [
          `L ${cw - k} 0`,
          `C ${cw - k + c} 0 ${cw - c} ${-s * k} ${cw} ${-s * k}`,
          `C ${cw + c} ${-s * k} ${cw + k - c} 0 ${cw + k} 0`,
          `L ${w} 0`,
        ].join(' ')
  const right = (s: number) =>
    !s
      ? `L ${w} ${h}`
      : [
          `L ${w} ${ch - k}`,
          `C ${w} ${ch - k + c} ${w + s * k} ${ch - c} ${w + s * k} ${ch}`,
          `C ${w + s * k} ${ch + c} ${w} ${ch + k - c} ${w} ${ch + k}`,
          `L ${w} ${h}`,
        ].join(' ')
  const bottom = (s: number) =>
    !s
      ? `L 0 ${h}`
      : [
          `L ${cw + k} ${h}`,
          `C ${cw + k - c} ${h} ${cw + c} ${h + s * k} ${cw} ${h + s * k}`,
          `C ${cw - c} ${h + s * k} ${cw - k + c} ${h} ${cw - k} ${h}`,
          `L 0 ${h}`,
        ].join(' ')
  const left = (s: number) =>
    !s
      ? `Z`
      : [
          `L 0 ${ch + k}`,
          `C 0 ${ch + k - c} ${-s * k} ${ch + c} ${-s * k} ${ch}`,
          `C ${-s * k} ${ch - c} 0 ${ch - k + c} 0 ${ch - k}`,
          `Z`,
        ].join(' ')
  return [`M 0 0`, top(e.top), right(e.right), bottom(e.bottom), left(e.left)].join(' ')
}

// ---------- Non-overlapping spawn positions ----------
function rectsOverlap(a: Rect, b: Rect, gap: number) {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  )
}
function shuffleInPlace<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}
function generateNonOverlappingSpawnPositions(
  outerW: number,
  outerH: number,
  play: Rect,
  tileW: number,
  tileH: number,
  count: number,
  rng: () => number,
) {
  const gapBase = Math.max(10, Math.round(Math.min(tileW, tileH) * 0.12))
  const bands: Rect[] = [
    { x: 0, y: 0, w: Math.max(0, play.x), h: outerH },
    { x: play.x + play.w, y: 0, w: Math.max(0, outerW - (play.x + play.w)), h: outerH },
    { x: 0, y: 0, w: outerW, h: Math.max(0, play.y) },
    { x: 0, y: play.y + play.h, w: outerW, h: Math.max(0, outerH - (play.y + play.h)) },
  ]
  const candidates: Rect[] = []
  for (const b of bands) {
    if (b.w <= 0 || b.h <= 0) continue
    const stepX = tileW + gapBase, stepY = tileH + gapBase
    for (let y = b.y; y <= b.y + b.h - tileH; y += stepY) {
      for (let x = b.x; x <= b.x + b.w - tileW; x += stepX) {
        candidates.push({ x, y, w: tileW, h: tileH })
      }
    }
  }
  shuffleInPlace(candidates, rng)
  const out: Rect[] = []
  const trySelect = (rects: Rect[], gap: number) => {
    for (const r of rects) {
      if (out.length >= count) break
      let ok = true
      for (const c of out) {
        if (rectsOverlap(c, r, gap)) {
          ok = false
          break
        }
      }
      if (ok) out.push(r)
    }
  }
  trySelect(candidates, gapBase)
  let gap = gapBase
  while (out.length < count && gap > 2) {
    gap = Math.floor(gap * 0.7)
    trySelect(candidates, gap)
  }
  let guard = 6000
  while (out.length < count && guard-- > 0) {
    const x = Math.floor(rng() * (outerW - tileW))
    const y = Math.floor(rng() * (outerH - tileH))
    const r = { x, y, w: tileW, h: tileH }
    if (rectsOverlap(r, play, 0)) continue
    let ok = true
    for (const c of out) {
      if (rectsOverlap(c, r, 4)) {
        ok = false
        break
      }
    }
    if (ok) out.push(r)
  }
  return out.slice(0, count).map(({ x, y }) => ({ x, y }))
}

/* ===================== SFX: 웹오디오 효과음 훅 ===================== */
type SfxApi = {
  enabled: boolean
  volume: number
  setEnabled: (b: boolean) => void
  setVolume: (n: number) => void
  prime: () => void
  click: () => void
  snap: () => void
  merge: () => void
  rotate: () => void
  shuffle: () => void
  complete: () => void
  error: () => void
}
function useSfx(): SfxApi {
  const ctxRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [volume, setVolume] = useState(0.6)

const ensureCtx = () => {
  if (!ctxRef.current) {
    const AC: typeof AudioContext | undefined =
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AC) return null
    const ctx: AudioContext = new AC()
    const g = ctx.createGain()
    g.gain.value = volume
    g.connect(ctx.destination)
    ctxRef.current = ctx
    gainRef.current = g
  }
  if (ctxRef.current!.state === 'suspended') ctxRef.current!.resume()
  return ctxRef.current
}


  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume
  }, [volume])

  const env = (startTime: number, node: GainNode, dur: number, a = 0.005, r = 0.08, peak = 1) => {
    node.gain.cancelScheduledValues(startTime)
    node.gain.setValueAtTime(0.0001, startTime)
    node.gain.linearRampToValueAtTime(peak, startTime + a)
    node.gain.exponentialRampToValueAtTime(0.0001, startTime + dur - r)
  }
  const pluck = (freq: number, dur = 0.15, type: OscillatorType = 'sine', detune = 0) => {
    if (!enabled) return
    const ctx = ensureCtx(); if (!ctx) return
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    osc.detune.value = detune
    osc.connect(g)
    g.connect(gainRef.current!)
    const t = ctx.currentTime
    env(t, g, dur, 0.01, 0.06, 0.9)
    osc.start(t)
    osc.stop(t + dur)
  }
  const woodTick = () => pluck(900, 0.07, 'triangle') // 클릭
  const softBell = () => { pluck(660, 0.12, 'sine'); pluck(990, 0.12, 'sine', -5) } // 스냅
  const woodMerge = () => { pluck(520, 0.12, 'triangle'); pluck(780, 0.12, 'triangle', -8) } // 병합
  const rotateFx = () => pluck(420, 0.09, 'square')
  const shuffleFx = () => { pluck(260, 0.08, 'square'); pluck(330, 0.08, 'square'); pluck(390, 0.08, 'square') }
  const errorFx = () => pluck(180, 0.18, 'sawtooth')
  const fanfare = () => { // 완성 팬페어 (짧은 아르페지오)
    if (!enabled) return
    const seq = [523, 659, 784, 1046] // C5-E5-G5-C6
    seq.forEach((f, i) => setTimeout(() => pluck(f, 0.16, 'sine'), i * 90))
  }

  const prime = () => { // 첫 사용자 제스처 시 호출
    const ctx = ensureCtx()
    if (ctx && ctx.state === 'suspended') ctx.resume()
  }

  return {
    enabled, volume, setEnabled, setVolume,
    prime,
    click: woodTick,
    snap: softBell,
    merge: woodMerge,
    rotate: rotateFx,
    shuffle: shuffleFx,
    complete: fanfare,
    error: errorFx,
  }
}

// ---------------- Main Component ----------------
function PuzzleGameContent() {
  const searchParams = useSearchParams()

  // --- SFX
const sfx = useSfx()

useEffect(() => {
  const handler = () => sfx.prime()

  // 옵션을 타입 안전하게 선언
  const opts: AddEventListenerOptions = { once: true, capture: true }

  window.addEventListener('pointerdown', handler, opts)

  // remove 시에는 capture 값만 일치하면 되므로 boolean 사용 (any 불필요)
  return () => window.removeEventListener('pointerdown', handler, true)
}, [])
 // 최초 1회

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<string>('')
  const [puzzleId, setPuzzleId] = useState<string>('')
  const [cols, setCols] = useState(4)
  const [rows, setRows] = useState(4)

  const [bgOpacity, setBgOpacity] = useState(0.35)
  const [bgBlur, setBgBlur] = useState(true)
  const [showPieceShapes, setShowPieceShapes] = useState(true)

  const [snapTolerance, setSnapTolerance] = useState(40)
  const [boardScale, setBoardScale] = useState(1)
  const [showGuides, setShowGuides] = useState(true)

  const [edgesOnly, setEdgesOnly] = useState(false)
  const [rotationMode, setRotationMode] = useState(false)
  const [captureMode, setCaptureMode] = useState(false)

  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [imageLoaded, setImageLoaded] = useState(false)

  const boardRef = useRef<HTMLDivElement | null>(null)
  const [outerRect, setOuterRect] = useState({ w: 1100, h: 800 })

  const playSize = Math.min(640, Math.max(400, Math.floor(Math.min(outerRect.w, outerRect.h) * 0.6)))
  const playW = playSize
  const playH = playSize
  const playX = Math.floor((outerRect.w - playW) / 2)
  const playY = Math.floor((outerRect.h - playH) / 2)
  const playRect: Rect = { x: playX, y: playY, w: playW, h: playH }

  // --------- 이미지 트랜스폼 (배경/조각 동일) ---------
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 })
  const imageTransform = useMemo(() => {
    if (!imageNaturalSize.width || !imageNaturalSize.height) {
      return { scale: 1, offsetX: 0, offsetY: 0, renderWidth: playW, renderHeight: playH }
    }
    const containerAspect = playW / playH
    const imageAspectRatio = imageNaturalSize.width / imageNaturalSize.height
    let renderWidth: number, renderHeight: number, offsetX: number, offsetY: number
    if (imageAspectRatio > containerAspect) {
      renderHeight = playH
      renderWidth = playH * imageAspectRatio
      offsetX = (playW - renderWidth) / 2
      offsetY = 0
    } else {
      renderWidth = playW
      renderHeight = playW / imageAspectRatio
      offsetX = 0
      offsetY = (playH - renderHeight) / 2
    }
    return {
      scale: renderWidth / imageNaturalSize.width,
      offsetX,
      offsetY,
      renderWidth,
      renderHeight,
    }
  }, [imageNaturalSize, playW, playH])
  const { renderWidth, renderHeight, offsetX, offsetY } = imageTransform

  const tileW = Math.floor(playW / cols)
  const tileH = Math.floor(playH / rows)

  const [tiles, setTiles] = useState<Tile[]>([])
  const [dragging, setDragging] = useState<{ ids: number[]; anchor: { dx: number; dy: number }[] } | null>(null)

  const edgesGrid = useMemo(() => {
    const seed = hashString(`${imageUrl}|${rows}x${cols}`)
    const rng = mulberry32(seed)
    return buildEdges(rows, cols, rng)
  }, [imageUrl, rows, cols])

  // 🔥 URL 파라미터에서 퍼즐 설정 로드
  useEffect(() => {
    const imageParam = searchParams.get('image')
    const idParam = searchParams.get('id')
    const difficultyParam = searchParams.get('difficulty')

    if (imageParam) {
      try {
        const decodedUrl = decodeURIComponent(imageParam)
        setImageUrl(decodedUrl)
        setImageLoaded(false)
      } catch {
        setImageUrl(imageParam)
      }
    }
    if (idParam) setPuzzleId(idParam)

    if (difficultyParam) {
      const pieces = parseInt(difficultyParam)
      if (!isNaN(pieces)) {
        switch (pieces) {
          case 4: setCols(2); setRows(2); break
          case 9: setCols(3); setRows(3); break
          case 16: setCols(4); setRows(4); break
          case 36: setCols(6); setRows(6); break
          default: break
        }
      }
    }
  }, [searchParams])

  // 파일 업로드 시 URL 파라미터 정보 초기화
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      setImageFile(file)
      const url = URL.createObjectURL(file)
      setImageUrl(url)
      setPuzzleId('')
      setImageLoaded(false)

      if (typeof window !== 'undefined') {
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.delete('image')
        newUrl.searchParams.delete('id')
        newUrl.searchParams.delete('difficulty')
        window.history.replaceState({}, '', newUrl.toString())
      }
    }
  }

  // objectURL 정리
  useEffect(() => {
    return () => {
      if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl)
    }
  }, [imageUrl])

  const clampIntoBoard = (x: number, y: number) => ({
    x: clamp(x, 0, outerRect.w - tileW),
    y: clamp(y, 0, outerRect.h - tileH),
  })

  const shuffle = () => {
    if (!imageUrl) return
    const total = rows * cols
    const seed = hashString(
      `spawn|${outerRect.w}x${outerRect.h}|${playX},${playY},${playW}x${playH}|${rows}x${cols}`,
    )
    const rng = mulberry32(seed)
    const spawns = generateNonOverlappingSpawnPositions(
      outerRect.w, outerRect.h, playRect, tileW, tileH, total, rng,
    )
    const init = range(rows).flatMap((r) =>
      range(cols).map((c) => {
        const id = r * cols + c
        const pos = spawns[id] || {
          x: Math.random() * (outerRect.w - tileW),
          y: Math.random() * (outerRect.h - tileH),
        }
        const clamped = clampIntoBoard(pos.x, pos.y)
        const tile: Tile = {
          id, row: r, col: c, x: clamped.x, y: clamped.y, angle: 0, locked: false, groupId: id,
        }
        return tile
      }),
    )
    setTiles(init)
    setElapsed(0)
    setPaused(false)
    sfx.shuffle()
  }

  // 보드 크기 트래킹
  useEffect(() => {
    const update = () => {
      if (!boardRef.current) return
      const r = boardRef.current.getBoundingClientRect()
      setOuterRect({ w: Math.round(r.width), h: Math.round(r.height) })
    }
    update()
    const ro = new ResizeObserver(update)
    if (boardRef.current) ro.observe(boardRef.current)
    return () => ro.disconnect()
  }, [])

  // 이미지가 로드되면 자동으로 섞기
  useEffect(() => {
    if (imageUrl && imageLoaded) {
      shuffle()
    }
  }, [rows, cols, imageUrl, imageLoaded])

  // 기본 이미지 (쿼리에서 안 온 경우에만)
  useEffect(() => {
    if (!imageUrl && !searchParams.get('image')) {
      const fallback =
        'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop'
      setImageUrl(fallback)
    }
  }, [imageUrl, searchParams])

  const solved = useMemo(
    () => tiles.length > 0 && tiles.length === rows * cols && tiles.every((t) => t.locked),
    [tiles, rows, cols],
  )

  // 완료 사운드 1회 재생
  const prevSolvedRef = useRef(false)
  useEffect(() => {
    if (solved && !prevSolvedRef.current) {
      sfx.complete()
    }
    prevSolvedRef.current = solved
  }, [solved])

  // 타이머
  useEffect(() => {
    let raf: number
    let last = performance.now()
    const loop = () => {
      const now = performance.now()
      if (!paused && !solved) setElapsed((e) => e + (now - last) / 1000)
      last = now
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [paused, solved])

  // 단축키
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'c') setCaptureMode((v) => !v)
      if (e.key === 'p') setPaused((v) => !v)
      if (e.key === 'r') shuffle()
      if (e.key === 'g') setShowGuides((v) => !v)
      if (e.key === 's') setShowPieceShapes((v) => !v)
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && rotationMode) {
        e.preventDefault()
        rotateSelected(e.key === 'ArrowRight' ? 90 : -90)
        sfx.rotate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rotationMode])

  // 선택/회전
  function toggleSelect(id: number) {
    setTiles((prev) => {
      const me = prev.find((t) => t.id === id)
      if (!me) return prev
      const gid = me.groupId
      const willSelect = !me.selected
      return prev.map((t) => (t.groupId === gid ? { ...t, selected: willSelect } : t))
    })
  }
  function rotateSelected(delta: number) {
    setTiles((prev) =>
      prev.map((t) => (t.selected && !t.locked ? { ...t, angle: (t.angle + delta + 360) % 360 } : t)),
    )
  }

  // 전체 조립 체크
  function finalizeIfAssembled(next: Tile[]) {
    const total = rows * cols
    const groups = new Map<number, Tile[]>()
    for (const t of next) {
      const arr = groups.get(t.groupId)
      if (arr) arr.push(t)
      else groups.set(t.groupId, [t])
    }
    const tol = Math.max(25, Math.min(tileW, tileH) * 0.35)

    for (const [, group] of groups) {
      if (group.length !== total) continue
      const a0 = norm(group[0].angle)
      if (!group.every((t) => norm(t.angle) === a0)) continue
      if (a0 !== 0) continue

      const baseX = group[0].x - group[0].col * tileW
      const baseY = group[0].y - group[0].row * tileH
      const fitsGrid = group.every(
        (t) =>
          Math.abs(t.x - (baseX + t.col * tileW)) <= tol &&
          Math.abs(t.y - (baseY + t.row * tileH)) <= tol,
      )
      if (!fitsGrid) continue

      const dx = playX - baseX
      const dy = playY - baseY
      const ids = new Set(group.map((t) => t.id))
      next = next.map((t) =>
        ids.has(t.id)
          ? {
              ...t,
              x: Math.round(t.x + dx),
              y: Math.round(t.y + dy),
              angle: 0,
              locked: true,
              selected: false,
            }
          : t,
      )
      break
    }
    next = next.map((t) => {
      const c = clampIntoBoard(t.x, t.y)
      return { ...t, x: c.x, y: c.y }
    })
    return next
  }

  // 포인터 핸들링
  const knob = Math.min(tileW, tileH) * 0.22
  const pad = Math.round(knob + 6)

  const onPointerDown = (e: React.PointerEvent, id: number) => {
    const board = boardRef.current
    if (!board) return
    const rect = board.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    setTiles((prev) => {
      let next = prev
      const t = next.find((x) => x.id === id)
      if (!t || t.locked) return next

      if (captureMode) next = next.map((x) => (x.id === id ? { ...x, selected: !x.selected } : x))
      else {
        const me = next.find((x) => x.id === id)!
        const gid = me.groupId
        next = next.map((x) => ({ ...x, selected: x.groupId === gid }))
      }

      const group = next.filter((x) => x.selected && !x.locked)
      const anchors = group.map((g) => ({ dx: px - (g.x - pad), dy: py - (g.y - pad) }))
      setDragging({ ids: group.map((g) => g.id), anchor: anchors })

      const el = e.target
      if (isPointerCaptureTarget(el)) el.setPointerCapture(e.pointerId)

      sfx.click()
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

    setTiles((prev) => {
      const idSet = new Set(dragging.ids)
      return prev.map((t) => {
        if (!idSet.has(t.id) || t.locked) return t
        const idx = dragging.ids.indexOf(t.id)
        const a = dragging.anchor[idx]

        const newLeft = clamp(px - a.dx, -pad, outerRect.w - (tileW + pad))
        const newTop = clamp(py - a.dy, -pad, outerRect.h - (tileH + pad))

        const baseX = clamp(newLeft + pad, 0, Math.max(0, outerRect.w - tileW))
        const baseY = clamp(newTop + pad, 0, Math.max(0, outerRect.h - tileH))

        const angleOk = (t.angle % 360) === 0
        const slotX = playX + t.col * tileW
        const slotY = playY + t.row * tileH
        const dx = Math.abs(baseX - slotX)
        const dy = Math.abs(baseY - slotY)
        const magnetRange = snapTolerance * 1.5
        const within = angleOk && dx <= magnetRange && dy <= magnetRange
        const strength = within ? Math.max(0, (magnetRange - Math.max(dx, dy)) / magnetRange) : 0

        const pulledX = clamp(baseX + (slotX - baseX) * strength * 0.3, 0, Math.max(0, outerRect.w - tileW))
        const pulledY = clamp(baseY + (slotY - baseY) * strength * 0.3, 0, Math.max(0, outerRect.h - tileH))

        return { ...t, x: pulledX, y: pulledY }
      })
    })
  }

  const onPointerUp = () => {
    if (!dragging) return
    const ids = dragging.ids
    setDragging(null)

    setTiles((prev) => {
      let next = prev
      let snappedAny = false
      let mergedAny = false

      // 1) 슬롯 스냅
      next = next.map((t) => {
        if (!ids.includes(t.id) || t.locked) return t
        const slotX = playX + t.col * tileW
        const slotY = playY + t.row * tileH
        const dx = Math.abs(t.x - slotX)
        const dy = Math.abs(t.y - slotY)
        const angleOk = (t.angle % 360) === 0
        const shouldSnap = dx <= snapTolerance && dy <= snapTolerance && angleOk
        if (!shouldSnap) return t
        const cl = clampIntoBoard(slotX, slotY)
        snappedAny = true
        return { ...t, x: cl.x, y: cl.y, angle: 0, locked: true, selected: false }
      })

      // 2) 그룹 병합
      const idSet = new Set(ids)
      const getByRC = (r: number, c: number) => next.find((tt) => tt.row === r && tt.col === c)
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
        const expect =
          dir === 'R' ? { dx: tileW, dy: 0 }
            : dir === 'L' ? { dx: -tileW, dy: 0 }
            : dir === 'T' ? { dx: 0, dy: -tileH }
            : { dx: 0, dy: tileH }
        const ddx = Math.abs(b.x - a.x - expect.dx)
        const ddy = Math.abs(b.y - a.y - expect.dy)
        const tol = Math.max(30, Math.min(tileW, tileH) * 0.35)
        if (ddx > tol || ddy > tol) return false

        const from = b.groupId, to = a.groupId
        const offsetX2 = a.x + expect.dx - b.x
        const offsetY2 = a.y + expect.dy - b.y
        next = next.map((t) =>
          t.groupId === from ? { ...t, groupId: to, x: t.x + offsetX2, y: t.y + offsetY2, angle: a.angle } : t,
        )
        next = next.map((t) => (t.groupId === to ? { ...t, ...clampIntoBoard(t.x, t.y) } : t))
        mergedAny = true
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
        const gids = new Set(next.filter((t) => idSet.has(t.id)).map((t) => t.groupId))
        const expanded = next.filter((t) => gids.has(t.groupId)).map((t) => t.id)
        for (const i of expanded) idSet.add(i)
      }

      if (snappedAny) sfx.snap()
      else if (mergedAny) sfx.merge()

      // 3) 전체 조립 확인
      next = finalizeIfAssembled(next)
      return next.sort((a, b) => Number(a.locked) - Number(b.locked))
    })
  }

  const onWheel = (e: React.WheelEvent, id: number) => {
    if (!rotationMode) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? 90 : -90
    setTiles((prev) =>
      prev.map((t) =>
        t.id === id || (t.selected && !t.locked) ? { ...t, angle: (t.angle + delta + 360) % 360 } : t,
      ),
    )
    sfx.rotate()
  }
  const onTileClick = (id: number) => {
    if (rotationMode) {
      setTiles((prev) =>
        prev.map((t) => (t.id === id || (t.selected && !t.locked) ? { ...t, angle: (t.angle + 90) % 360 } : t)),
      )
      sfx.rotate()
    }
  }

  const presets = [
    {
      label: 'Vibrant Vibes',
      url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop',
    },
    {
      label: 'Mountains',
      url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=1600&auto=format&fit=crop',
    },
    {
      label: 'City Night',
      url: 'https://images.unsplash.com/photo-1482192596544-9eb780fc7f66?q=80&w=1600&auto=format&fit=crop',
    },
  ]

  const piecePaths = useMemo(
    () => range(rows).flatMap((r) => range(cols).map((c) => buildPiecePath(tileW, tileH, edgesGrid[r][c], knob))),
    [rows, cols, tileW, tileH, edgesGrid, knob],
  )

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes celebration {
          0% { transform: scale(0.5) rotate(-5deg); opacity: 0; }
          50% { transform: scale(1.1) rotate(2deg); opacity: 1; }
          100% { transform: scale(1.05) rotate(0deg); opacity: 1; }
        }
      `}</style>

      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg bg-black px-2 py-1 text-xs font-semibold text-white">
              🧩 Puzzle {puzzleId && `#${puzzleId}`}
            </div>
            <div className="text-sm text-gray-600">{solved ? '완료!' : '진행 중'}</div>
            <div className="text-sm tabular-nums text-gray-700">
              ⏱ {elapsed.toFixed(1)}s {paused && '(일시정지)'}
            </div>
            <div className="text-xs text-gray-500">
              완성: {tiles.filter((t) => t.locked).length}/{tiles.length}
            </div>

            {/* 🔊 SFX 컨트롤 */}
            <div className="ml-2 flex items-center gap-2 rounded-md border bg-white px-2 py-1">
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={sfx.enabled}
                  onChange={(e) => sfx.setEnabled(e.target.checked)}
                />
                효과음
              </label>
              <input
                title="효과음 볼륨"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={sfx.volume}
                onChange={(e) => sfx.setVolume(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              이미지 업로드
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              <div className="rounded-md bg-blue-500 px-3 py-1 text-sm text-white transition-colors hover:bg-blue-600">
                {imageFile ? imageFile.name.slice(0, 20) + (imageFile.name.length > 20 ? '...' : '') : '파일 선택'}
              </div>
            </label>

            <select
              className="rounded-md border px-2 py-1 text-sm"
              value={`${cols}x${rows}`}
              onChange={(e) => {
                const [c, r] = e.target.value.split('x').map(Number)
                setCols(c)
                setRows(r)
              }}
            >
              <option value="2x2">2 × 2 (4조각)</option>
              <option value="3x3">3 × 3 (9조각)</option>
              <option value="4x4">4 × 4 (16조각)</option>
              <option value="6x6">6 × 6 (36조각)</option>
            </select>

            <label className="flex items-center gap-2 text-sm">
              자석력
              <input
                type="number"
                min={20}
                max={80}
                value={snapTolerance}
                onChange={(e) => setSnapTolerance(Number(e.target.value))}
                className="w-20 rounded-md border px-2 py-1 text-sm"
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              Scale
              <input
                type="range"
                min={0.6}
                max={1.4}
                step={0.05}
                value={boardScale}
                onChange={(e) => setBoardScale(Number(e.target.value))}
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              배경 불투명도
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={bgOpacity}
                onChange={(e) => setBgOpacity(Number(e.target.value))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={bgBlur} onChange={(e) => setBgBlur(e.target.checked)} />
              배경 흐림
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showPieceShapes}
                onChange={(e) => setShowPieceShapes(e.target.checked)}
              />
              조각 모양 표시
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edgesOnly} onChange={(e) => setEdgesOnly(e.target.checked)} />
              Edges Only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={rotationMode} onChange={(e) => setRotationMode(e.target.checked)} />
              Rotation
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={captureMode} onChange={(e) => setCaptureMode(e.target.checked)} />
              Capture
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />
              Guides
            </label>

            <button
              onClick={() => {
                shuffle()
              }}
              className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!imageUrl}
            >
              섞기
            </button>
            <button onClick={() => setPaused((v) => !v)} className="rounded-lg border px-3 py-1.5 text-sm">
              {paused ? '재개' : '일시정지'}
            </button>
          </div>
        </header>

        {/* 선택된 이미지 정보 */}
        {puzzleId && (
          <div className="mb-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
            <div className="text-sm text-blue-800">
              🎯 선택된 퍼즐: <strong>#{puzzleId}</strong> ({rows}×{cols} = {rows * cols}조각)
            </div>
          </div>
        )}

        {/* 이미지 로딩 상태 */}
        {imageUrl && !imageLoaded && (
          <div className="mb-3 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-yellow-800">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600"></div>
              🖼️ 이미지 로딩 중...
            </div>
          </div>
        )}

        <div className="mb-3 flex flex-wrap gap-2">
          {!imageFile &&
            presets.map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  setImageUrl(p.url)
                  setPuzzleId('')
                  setImageLoaded(false)
                }}
                className={`rounded-md border px-2 py-1 text-sm ${
                  imageUrl === p.url ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          {imageFile && (
            <button
              onClick={() => {
                setImageFile(null)
                setImageUrl('')
                setPuzzleId('')
                setImageLoaded(false)
              }}
              className="rounded-md border border-red-300 px-2 py-1 text-sm text-red-600 hover:bg-red-50"
            >
              업로드한 이미지 제거
            </button>
          )}
          <div className="text-xs text-gray-500">
            단축키: c(캡처), r(섞기), p(타이머), g(가이드), s(조각모양), ←/→(회전)
          </div>
        </div>

        {/* Board */}
        <div className="overflow-auto rounded-2xl border bg-neutral-100 p-4 shadow-md">
          <div
            className="relative mx-auto select-none rounded-xl border bg-neutral-200"
            ref={boardRef}
            style={{
              width: outerRect.w,
              height: outerRect.h,
              transform: `scale(${boardScale})`,
              transformOrigin: 'top left',
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* Play area background */}
            {imageUrl && (
              <div
                className="absolute overflow-hidden rounded-xl"
                style={{
                  left: playX, top: playY, width: playW, height: playH,
                  opacity: bgOpacity,
                  filter: bgBlur ? 'blur(2px) brightness(0.9) saturate(0.95)' : 'none',
                }}
              >
                <img
                  src={imageUrl}
                  alt="puzzle background"
                  style={{ position: 'absolute', left: offsetX, top: offsetY, width: renderWidth, height: renderHeight }}
                  onLoad={(e) => {
                    const img = e.currentTarget
                    setImageNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
                    setImageLoaded(true)
                  }}
                  onError={() => {
                    setImageLoaded(false)
                    sfx.error()
                  }}
                />
              </div>
            )}

            {/* 퍼즐 조각 모양 가이드 */}
            {imageUrl && showPieceShapes && (
              <div className="pointer-events-none absolute" style={{ left: playX, top: playY, width: playW, height: playH }}>
                <svg width={playW} height={playH} viewBox={`0 0 ${playW} ${playH}`} className="absolute inset-0">
                  {range(rows).flatMap((r) =>
                    range(cols).map((c) => {
                      const id = r * cols + c
                      const tile = tiles.find((t) => t.id === id)
                      if (tile && tile.locked) return null
                      const pathD = buildPiecePath(tileW, tileH, edgesGrid[r][c], knob)
                      const slotX = c * tileW
                      const slotY = r * tileH
                      const magnetRange = snapTolerance * 1.5
                      const showMagnetZone =
                        tile &&
                        !tile.locked &&
                        tile.angle % 360 === 0 &&
                        Math.abs(tile.x - (playX + slotX)) <= magnetRange &&
                        Math.abs(tile.y - (playY + slotY)) <= magnetRange
                      return (
                        <g key={`shape-guide-${id}`}>
                          {showMagnetZone && (
                            <rect
                              x={slotX - magnetRange / 4}
                              y={slotY - magnetRange / 4}
                              width={tileW + magnetRange / 2}
                              height={tileH + magnetRange / 2}
                              fill="rgba(59,130,246,0.1)"
                              stroke="rgba(59,130,246,0.3)"
                              strokeWidth="1"
                              rx="4"
                              className="animate-pulse"
                            />
                          )}
                          <path
                            d={pathD}
                            transform={`translate(${slotX}, ${slotY})`}
                            fill="none"
                            stroke={showMagnetZone ? 'rgba(59,130,246,0.9)' : 'rgba(255,255,255,0.8)'}
                            strokeWidth={showMagnetZone ? 3 : 2}
                            strokeDasharray={showMagnetZone ? '6,2' : '8,4'}
                            className={showMagnetZone ? 'animate-pulse' : ''}
                          />
                          <path
                            d={pathD}
                            transform={`translate(${slotX}, ${slotY})`}
                            fill="none"
                            stroke="rgba(0,0,0,0.3)"
                            strokeWidth={1}
                            strokeDasharray="8,4"
                            strokeDashoffset={2}
                          />
                        </g>
                      )
                    }),
                  )}
                </svg>
              </div>
            )}

            {/* 이미지 없음/로딩 중 안내 */}
            {!imageUrl && (
              <div
                className="absolute flex items-center justify-center rounded-xl border-2 border-dashed border-gray-400 bg-gray-100"
                style={{ left: playX, top: playY, width: playW, height: playH }}
              >
                <div className="text-center text-gray-500">
                  <div className="mb-2 text-4xl">📷</div>
                  <div className="text-sm">이미지를 업로드하거나</div>
                  <div className="text-sm">프리셋을 선택해주세요</div>
                </div>
              </div>
            )}

            {imageUrl && !imageLoaded && (
              <div
                className="absolute flex items-center justify-center rounded-xl border-2 border-dashed border-blue-400 bg-blue-50"
                style={{ left: playX, top: playY, width: playW, height: playH }}
              >
                <div className="text-center text-blue-500">
                  <div className="mb-2 animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                  <div className="text-sm">이미지 로딩 중...</div>
                  <div className="text-xs text-blue-400 mt-1">잠시만 기다려주세요</div>
                </div>
              </div>
            )}

            {/* Play area border */}
            <div
              className="absolute rounded-xl border-2 border-dashed"
              style={{ left: playX, top: playY, width: playW, height: playH, borderColor: 'rgba(0,0,0,0.35)' }}
            />

            {/* Grid guide */}
            {showGuides && (
              <div className="pointer-events-none absolute" style={{ left: playX, top: playY, width: playW, height: playH }}>
                {range(rows + 1).map((r) => (
                  <div
                    key={`r-${r}`}
                    className="absolute left-0 right-0 border-t"
                    style={{ top: r * tileH, borderColor: 'rgba(255,255,255,0.55)' }}
                  />
                ))}
                {range(cols + 1).map((c) => (
                  <div
                    key={`c-${c}`}
                    className="absolute top-0 bottom-0 border-l"
                    style={{ left: c * tileW, borderColor: 'rgba(255,255,255,0.55)' }}
                  />
                ))}
              </div>
            )}

            {/* Tiles */}
            {imageUrl && imageLoaded &&
              tiles.map((t) => {
                if (edgesOnly && !isEdge(t.row, t.col, rows, cols) && !t.locked) return null
                const pathD = piecePaths[t.id]
                const clipId = `clip-${rows}-${cols}-${t.id}`

                // 배경과 동일한 트랜스폼 적용
                const imgX = offsetX - t.col * tileW
                const imgY = offsetY - t.row * tileH

                const stroke = t.locked ? '#34d399' : t.selected ? '#60a5fa' : 'rgba(0,0,0,0.2)'

                return (
                  <div
                    key={t.id}
                    role="button"
                    aria-label={`tile-${t.id}`}
                    className="absolute cursor-grab touch-none"
                    style={{
                      left: t.x - pad,
                      top:  t.y - pad,
                      width:  tileW + pad * 2,
                      height: tileH + pad * 2,
                      zIndex: t.locked ? 1 : 2,
                    }}
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
                        <image
                          href={imageUrl}
                          x={imgX}
                          y={imgY}
                          width={renderWidth}
                          height={renderHeight}
                          preserveAspectRatio="none"
                        />
                      </g>
                      <path d={pathD} fill="none" stroke={stroke} strokeWidth={t.selected ? 2 : 1} />
                    </svg>
                  </div>
                )
              })}

            {/* Completion popup */}
            {solved && (
              <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
                <div className="relative">
                  <div className="fixed inset-0 animate-pulse bg-black/70 backdrop-blur-sm" style={{ animation: 'fadeIn 0.5s ease-out' }} />
                  <div
                    className="relative rounded-2xl border-4 border-yellow-300 bg-gradient-to-br from-yellow-200 via-orange-200 to-pink-200 p-8 shadow-2xl"
                    style={{
                      animation: 'celebration 1s ease-out',
                      transform: 'scale(1.05)',
                      boxShadow: '0 20px 40px rgba(0,0,0,0.3), 0 0 20px rgba(255,215,0,0.5)',
                    }}
                  >
                    <div className="text-center">
                      <div className="mb-4 text-6xl animate-bounce">🎉✨🏆✨🎉</div>
                      <div className="mb-3 text-3xl font-bold text-gray-800">퍼즐 완성!</div>
                      <div className="mb-2 text-xl text-gray-700">축하합니다</div>
                      <div className="mb-4 rounded-lg bg-white/80 p-3 backdrop-blur-sm">
                        <div className="text-lg font-semibold text-gray-800">⏱ 완료 시간: {elapsed.toFixed(1)}초</div>
                        <div className="text-sm text-gray-600">
                          {Math.floor(elapsed / 60)}분 {Math.floor(elapsed % 60)}초
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          shuffle()
                          setElapsed(0)
                        }}
                        className="transform rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-3 text-lg font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 hover:from-blue-600 hover:to-purple-700 hover:shadow-xl"
                        style={{ pointerEvents: 'auto' }}
                      >
                        🎯 새 게임 시작하기
                      </button>
                    </div>
                    <div className="absolute -top-2 -right-2 text-2xl text-yellow-400 animate-spin" style={{ animationDuration: '3s' }}>
                      ⭐
                    </div>
                    <div className="absolute -top-1 -left-3 text-xl text-yellow-300 animate-bounce" style={{ animationDelay: '0.5s' }}>
                      ✨
                    </div>
                    <div className="absolute -bottom-2 -right-3 text-xl text-pink-400 animate-pulse" style={{ animationDelay: '1s' }}>
                      💫
                    </div>
                    <div className="absolute -bottom-1 -left-2 text-lg text-orange-400 animate-bounce" style={{ animationDelay: '1.5s' }}>
                      🌟
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="mt-4 text-center text-xs text-gray-500">
          🎯 홈페이지에서 선택한 이미지로 퍼즐을 즐기세요! 자석 효과로 조각이 올바른 위치에 자동으로 끌려갑니다.
        </footer>
      </div>
    </div>
  )
}

// ---------------- Component ----------------
export default function PuzzlePage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-gray-500">URL 파라미터 로딩 중…</div>}>
      <PuzzleGameContent />
    </Suspense>
  )
}
