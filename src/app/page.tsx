'use client'

import { useEffect, useState } from 'react'

import Link from 'next/link'

/** ---------------- Types ---------------- */
interface PuzzleImage {
  id: string
  category: 'color' | 'gray'
  url: string
  difficulty: number[]
}

interface ApiResponse {
  success: boolean
  data: PuzzleImage[]
  total: number
  filters?: {
    category: string | null
    difficulty: number | null
  }
}

/** ---------------- Constants ---------------- */
const DIFFICULTIES: Array<{ pieces: number; label: string; color: string }> = [
  { pieces: 0, label: '전체', color: 'bg-gray-100' },
  { pieces: 4, label: '1단계', color: 'bg-green-100 text-green-800' },
  { pieces: 9, label: '2단계', color: 'bg-blue-100 text-blue-800' },
  { pieces: 16, label: '3단계', color: 'bg-orange-100 text-orange-800' },
  { pieces: 36, label: '4단계', color: 'bg-red-100 text-red-800' },
]

/** ---------------- Utils ---------------- */
// 클라이언트 사이드에서 배열을 랜덤하게 섞는 함수
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// 추천 퍼즐을 선별하는 함수
function getRecommendedPuzzles(puzzles: PuzzleImage[], count: number = 6): PuzzleImage[] {
  const shuffled = shuffleArray(puzzles)
  return shuffled.slice(0, count)
}

export default function HomePage() {
  const [categoryType, setCategoryType] = useState<'color' | 'gray'>('color')
  const [selectedDifficulty, setSelectedDifficulty] = useState<number>(0)
  const [puzzleImages, setPuzzleImages] = useState<PuzzleImage[]>([])
  const [recommendedPuzzles, setRecommendedPuzzles] = useState<PuzzleImage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recommendationSeed, setRecommendationSeed] = useState(0) // 추천 퍼즐 갱신용

  /** API에서 퍼즐 데이터 가져오기 */
  const fetchPuzzles = async (signal?: AbortSignal) => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      params.append('category', categoryType)
      if (selectedDifficulty > 0) {
        params.append('difficulty', String(selectedDifficulty))
      }

      const res = await fetch(`/api/puzzles?${params}`, { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result: ApiResponse = await res.json()

      if (result.success) {
        setPuzzleImages(result.data)
      } else {
        setError('퍼즐 데이터를 불러오는데 실패했습니다.')
      }
    } catch (err) {
      // 빠르게 탭/필터를 바꿀 때 이전 요청은 취소됨(정상)
      if ((err as Error).name !== 'AbortError') {
        console.error('API 호출 오류:', err)
        setError('네트워크 오류가 발생했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }

  /** 추천 퍼즐 업데이트 */
  const updateRecommendations = () => {
    if (puzzleImages.length > 0) {
      const recommended = getRecommendedPuzzles(puzzleImages)
      setRecommendedPuzzles(recommended)
    }
  }

  /** 추천 퍼즐 새로고침 */
  const refreshRecommendations = () => {
    setRecommendationSeed(Date.now())
    updateRecommendations()
  }

  /** 마운트/필터 변경 시 데이터 가져오기 (요청 취소 포함) */
  useEffect(() => {
    const ac = new AbortController()
    fetchPuzzles(ac.signal)
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryType, selectedDifficulty])

  /** 퍼즐 데이터가 변경될 때 추천 퍼즐 업데이트 */
  useEffect(() => {
    updateRecommendations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleImages, recommendationSeed])

  /** 카테고리 변경 */
  const handleCategoryChange = (newCategory: 'color' | 'gray') => {
    setCategoryType(newCategory)
    setSelectedDifficulty(0) // 난이도 초기화
  }

  /** 컴포넌트 마운트 시 초기 추천 시드 설정 */
  useEffect(() => {
    setRecommendationSeed(Date.now())
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="text-2xl">🧩</div>
                <h1 className="text-2xl font-bold text-gray-900">Puzzle Master</h1>
              </div>
              <div className="hidden md:block text-sm text-gray-600">온라인 직소퍼즐 게임</div>
            </div>
            <nav className="flex items-center gap-4">
              <Link href="/puzzle" className="text-sm text-gray-600 hover:text-gray-900">
                퍼즐 플레이
              </Link>
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                이미지 업로드
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 text-white">
        <div className="mx-auto max-w-7xl px-4 py-16">
          <div className="text-center">
            <h2 className="text-4xl md:text-6xl font-bold mb-6">
              직소퍼즐의 즐거움을
              <br />
              온라인에서 경험하세요
            </h2>
            <p className="text-xl md:text-2xl text-blue-100 mb-8 max-w-3xl mx-auto">
              다양한 아름다운 이미지로 퍼즐을 만들고, 4단계 난이도로 도전해보세요.
              컬러와 흑백 퍼즐 중에서 선택할 수 있습니다!
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/puzzle"
                className="inline-flex items-center justify-center rounded-xl bg-white px-8 py-4 text-lg font-semibold text-gray-900 hover:bg-gray-100 transition-colors"
              >
                🎯 지금 시작하기
              </Link>
              <button className="inline-flex items-center justify-center rounded-xl border-2 border-white px-8 py-4 text-lg font-semibold text-white hover:bg-white hover:text-gray-900 transition-colors">
                📷 내 이미지 업로드
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Recommended Puzzles Section */}
      <section className="py-12 bg-gradient-to-r from-purple-50 to-pink-50 border-b">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="text-2xl">✨</div>
                <h3 className="text-2xl font-bold text-gray-900">오늘의 추천 퍼즐</h3>
              </div>
              <div className="px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm rounded-full font-medium">
                매일 새로운 추천
              </div>
            </div>
            <button
              onClick={refreshRecommendations}
              disabled={loading || recommendedPuzzles.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-medium hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
              title="새로운 추천 퍼즐 보기"
            >
              🔄 새로운 추천
            </button>
          </div>

          {/* 추천 퍼즐 로딩 */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
              <span className="ml-3 text-gray-600">추천 퍼즐을 준비중...</span>
            </div>
          )}

          {/* 추천 퍼즐 그리드 */}
          {!loading && recommendedPuzzles.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {recommendedPuzzles.map((puzzle, index) => (
                <div
                  key={`rec-${puzzle.id}-${recommendationSeed}`}
                  className="group relative overflow-hidden rounded-xl bg-white shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105"
                  style={{ 
                    animationDelay: `${index * 100}ms`,
                    animation: 'fadeInScale 0.6s ease-out forwards'
                  }}
                >
                  <div className="aspect-square overflow-hidden relative">
                    <img
                      src={puzzle.url}
                      alt={`추천 퍼즐 #${puzzle.id}`}
                      className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-300"
                      loading="lazy"
                      onError={(e) => {
                        const target = e.currentTarget
                        target.onerror = null
                        target.src = `https://via.placeholder.com/300x300/cccccc/666666?text=퍼즐+${puzzle.id}`
                      }}
                    />
                    {/* 추천 배지 */}
                    <div className="absolute top-2 left-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs px-2 py-1 rounded-full font-bold shadow-lg">
                      ⭐ 추천
                    </div>
                    {/* 순위 배지 */}
                    <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs px-2 py-1 rounded-full font-bold">
                      #{index + 1}
                    </div>
                    {/* 호버 오버레이 */}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                        <Link
                          href={`/puzzle?image=${encodeURIComponent(puzzle.url)}&id=${puzzle.id}&difficulty=16`}
                          className="bg-white text-gray-900 px-4 py-2 rounded-lg font-medium text-sm hover:bg-gray-100 transition-colors"
                        >
                          🧩 플레이
                        </Link>
                      </div>
                    </div>
                  </div>
                  <div className="p-3">
                    <h4 className="font-medium text-gray-900 text-sm mb-2">퍼즐 #{puzzle.id}</h4>
                    <div className="flex flex-wrap gap-1">
                      {puzzle.difficulty.slice(0, 2).map((pieces, diffIndex) => (
                        <Link
                          key={pieces}
                          href={`/puzzle?image=${encodeURIComponent(puzzle.url)}&id=${puzzle.id}&difficulty=${pieces}`}
                          className={`px-2 py-1 rounded text-xs transition-colors hover:scale-105 ${
                            diffIndex === 0
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          }`}
                        >
                          {pieces}조각
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && recommendedPuzzles.length === 0 && (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">🎭</div>
              <p className="text-gray-600">추천할 퍼즐을 준비중입니다...</p>
            </div>
          )}
        </div>
      </section>

      {/* Filters */}
      <section className="py-8 bg-white border-t">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-col gap-6">
            {/* Color/Gray Toggle */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">퍼즐 타입</h4>
              <div className="flex gap-3">
                <button
                  onClick={() => handleCategoryChange('color')}
                  aria-pressed={categoryType === 'color'}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
                    categoryType === 'color'
                      ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <div className="flex gap-1">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-blue-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  컬러 퍼즐
                </button>
                <button
                  onClick={() => handleCategoryChange('gray')}
                  aria-pressed={categoryType === 'gray'}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
                    categoryType === 'gray'
                      ? 'bg-gradient-to-r from-gray-600 to-gray-800 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <div className="flex gap-1">
                    <div className="w-3 h-3 rounded-full bg-gray-300" />
                    <div className="w-3 h-3 rounded-full bg-gray-500" />
                    <div className="w-3 h-3 rounded-full bg-gray-700" />
                  </div>
                  흑백 퍼즐
                </button>
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">난이도 선택</h4>
              <div className="flex flex-wrap gap-2">
                {DIFFICULTIES.map((diff) => (
                  <button
                    key={diff.pieces}
                    onClick={() => setSelectedDifficulty(diff.pieces)}
                    aria-pressed={selectedDifficulty === diff.pieces}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedDifficulty === diff.pieces
                        ? categoryType === 'color'
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-700 text-white'
                        : diff.color
                    }`}
                  >
                    {diff.label}
                    {diff.pieces > 0 && ` (${diff.pieces}조각)`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Puzzle Gallery */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-2xl font-bold text-gray-900">
              {categoryType === 'color' ? '🎨' : '⚫'} {categoryType === 'color' ? '컬러' : '흑백'} 퍼즐 갤러리
              {!loading && ` (${puzzleImages.length}개)`}
            </h3>
            <div className="text-sm text-gray-600">
              {selectedDifficulty !== 0 &&
                `${DIFFICULTIES.find((d) => d.pieces === selectedDifficulty)?.label} 선택됨`}
            </div>
          </div>

          {/* 로딩 */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
              <span className="ml-3 text-gray-600">퍼즐 로딩 중...</span>
            </div>
          )}

          {/* 오류 */}
          {error && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">⚠️</div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">오류가 발생했습니다</h4>
              <p className="text-gray-600 mb-4">{error}</p>
              <button
                onClick={() => fetchPuzzles()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                다시 시도
              </button>
            </div>
          )}

          {/* 그리드 */}
          {!loading && !error && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {puzzleImages.map((puzzle, index) => (
                <div
                  key={`${puzzle.id}`}
                  className="group relative overflow-hidden rounded-xl bg-white shadow-md hover:shadow-lg transition-all duration-200"
                  style={{ 
                    animationDelay: `${index * 50}ms`,
                    animation: 'fadeInUp 0.5s ease-out forwards'
                  }}
                >
                  <div className="aspect-square overflow-hidden">
                    <img
                      src={puzzle.url}
                      alt={`퍼즐 #${puzzle.id} 썸네일`}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      onError={(e) => {
                        const target = e.currentTarget
                        target.onerror = null
                        target.src = `https://via.placeholder.com/400x400/cccccc/666666?text=퍼즐+${puzzle.id}`
                      }}
                    />
                  </div>
                  <div className="p-4">
                    <h4 className="font-medium text-gray-900 mb-2">퍼즐 #{puzzle.id}</h4>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {puzzle.difficulty.map((pieces, diffIndex) => (
                        <Link
                          key={pieces}
                          href={`/puzzle?image=${encodeURIComponent(puzzle.url)}&id=${puzzle.id}&difficulty=${pieces}`}
                          className={`px-2 py-1 rounded text-xs transition-colors hover:scale-105 ${
                            diffIndex === 0
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : diffIndex === 1
                              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                              : diffIndex === 2
                              ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                              : 'bg-red-100 text-red-700 hover:bg-red-200'
                          }`}
                        >
                          {pieces}조각
                        </Link>
                      ))}
                    </div>
                    <Link
                      href={`/puzzle?image=${encodeURIComponent(puzzle.url)}&id=${puzzle.id}&difficulty=16`}
                      className={`block w-full text-center rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors ${
                        categoryType === 'color'
                          ? 'bg-orange-500 hover:bg-orange-600'
                          : 'bg-gray-700 hover:bg-gray-800'
                      }`}
                    >
                      🧩 퍼즐 시작하기
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 검색 결과 없음 */}
          {!loading && !error && puzzleImages.length === 0 && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔍</div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">해당 조건의 퍼즐이 없습니다</h4>
              <p className="text-gray-600 mb-4">다른 난이도를 선택하거나 퍼즐 타입을 변경해보세요.</p>
            </div>
          )}
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gray-900 text-white">
        <div className="mx-auto max-w-7xl px-4">
          <h3 className="text-2xl font-bold text-center mb-8">📊 퍼즐 통계</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl md:text-4xl font-bold text-orange-400 mb-2">10</div>
              <div className="text-gray-300">컬러 퍼즐</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold text-gray-400 mb-2">8</div>
              <div className="text-gray-300">흑백 퍼즐</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold text-purple-400 mb-2">4</div>
              <div className="text-gray-300">난이도 단계</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold text-yellow-400 mb-2">6</div>
              <div className="text-gray-300">매일 추천</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t py-12">
        <div className="mx-auto max-w-7xl px-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="text-2xl">🧩</div>
              <span className="text-xl font-bold text-gray-900">Puzzle Master</span>
            </div>
            <p className="text-gray-600 mb-4">컬러와 흑백, 4단계 난이도로 즐기는 온라인 직소퍼즐</p>
            <div className="text-sm text-gray-500">© 2024 Puzzle Master. 모든 권리 보유.</div>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  )
}