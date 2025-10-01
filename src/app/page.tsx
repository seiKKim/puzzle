// 홈페이지 컴포넌트 - CSS 모듈 적용
// src/app/page.tsx

'use client'

import { useEffect, useState } from 'react'

import Link from 'next/link'
import styles from '../app/homepage.module.css'

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
      <header className={styles.header}>
        <div className={styles.headerContainer}>
          <div className={styles.headerContent}>
            <div className={styles.headerLogo}>
              <div className={styles.headerLogoIcon}>
                <div className="text-2xl">🧩</div>
                <img 
                  src="/icons/logo_mindring.png" 
                  alt="Puzzle Master Logo" 
                  className={styles.headerLogoImage}
                />
              </div>
              <div className={styles.headerSubtitle}>온라인 직소퍼즐 게임</div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContainer}>
                    <div className={styles.heroContent}>
                                  <p className={styles.heroDescription}>
                            함께하는 시간이, 인생을 빛나게 합니다
            </p>
            <h2 className={styles.heroTitle}>

              마음과 기억을 이어주는 따뜻한 연결, 오늘도 당신 곁에 있습니다.
            </h2>

            <p className={styles.heroSubtext}>
              다양한 아름다운 이미지를 퍼즐로 즐겨보세요.<br />
              4단계 난이도로 도전할 수 있으며, 컬러와 흑백 퍼즐 중 원하는 이미지로 선택할 수 있어요.
            </p>
          </div>
        </div>
      </section>

      {/* Recommended Puzzles Section */}
      <section className={styles.recommendedSection}>
        <div className={styles.recommendedContainer}>
          <div className={styles.recommendedHeader}>
            <div className={styles.recommendedHeaderLeft}>
              <div className={styles.recommendedHeaderTitle}>
                <div className="text-2xl">✨</div>
                <h3 className={styles.recommendedHeaderTitleText}>오늘의 추천 퍼즐</h3>
              </div>
              <div className={styles.recommendedBadge}>
                매일 새로운 추천
              </div>
            </div>
            <button
              onClick={refreshRecommendations}
              disabled={loading || recommendedPuzzles.length === 0}
              className={styles.recommendedRefreshButton}
              title="새로운 추천 퍼즐 보기"
            >
              🔄 새로운 추천
            </button>
          </div>

          {/* 추천 퍼즐 로딩 */}
          {loading && (
            <div className={styles.loadingState}>
              <div className={styles.loadingSpinner} />
              <span className={styles.loadingText}>추천 퍼즐을 준비중...</span>
            </div>
          )}

          {/* 추천 퍼즐 그리드 */}
          {!loading && recommendedPuzzles.length > 0 && (
            <div className={styles.recommendedGrid}>
              {recommendedPuzzles.map((puzzle, index) => (
                <div
                  key={`rec-${puzzle.id}-${recommendationSeed}`}
                  className={styles.recommendedCard}
                  style={{
                    animationDelay: `${index * 100}ms`,
                  }}
                >
                  <div className={styles.recommendedImageContainer}>
                    <img
                      src={puzzle.url}
                      alt={`추천 퍼즐 #${puzzle.id}`}
                      className={styles.recommendedImage}
                      loading="lazy"
                      onError={(e) => {
                        const target = e.currentTarget
                        target.onerror = null
                        target.src = `https://via.placeholder.com/300x300/cccccc/666666?text=퍼즐+${puzzle.id}`
                      }}
                    />
                    {/* 추천 배지 */}
                    <div className={styles.recommendedBadgeContainer}>
                      ⭐ 추천
                    </div>
                    {/* 순위 배지 */}
                    <div className={styles.rankBadge}>
                      #{index + 1}
                    </div>
                    {/* 호버 오버레이 */}
                    <div className={styles.hoverOverlay}>
                      <Link
                        href={`/puzzle?image=${encodeURIComponent(puzzle.url)}&id=${puzzle.id}&difficulty=16`}
                        className={styles.hoverButton}
                      >
                        🧩 플레이
                      </Link>
                    </div>
                  </div>
                  <div className={styles.recommendedCardContent}>
                    <h4 className={styles.recommendedCardTitle}>퍼즐 #{puzzle.id}</h4>
                    <div className={styles.recommendedDifficultyTags}>
                      {puzzle.difficulty.slice(0, 2).map((pieces, diffIndex) => (
                        <Link
                          key={pieces}
                          href={`/puzzle?image=${encodeURIComponent(puzzle.url)}&id=${puzzle.id}&difficulty=${pieces}`}
                          className={`${styles.difficultyTag} ${
                            diffIndex === 0 ? styles.difficultyTagGreen : styles.difficultyTagBlue
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
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🎭</div>
              <p className={styles.emptyMessage}>추천할 퍼즐을 준비중입니다...</p>
            </div>
          )}
        </div>
      </section>

      {/* Filters */}
      <section className={styles.filtersSection}>
        <div className={styles.filtersContainer}>
          <div className={styles.filtersContent}>
            {/* Color/Gray Toggle */}
            <div className={styles.filterGroup}>
              <h4 className={styles.filterGroupTitle}>퍼즐 타입</h4>
              <div className={styles.filterButtons}>
                <button
                  onClick={() => handleCategoryChange('color')}
                  aria-pressed={categoryType === 'color'}
                  className={`${styles.categoryButton} ${
                    categoryType === 'color' 
                      ? `${styles.categoryButtonActive} ${styles.categoryButtonColor}` 
                      : styles.categoryButtonInactive
                  }`}
                >
                  <div className={styles.categoryColorDots}>
                    <div className={`${styles.colorDot} ${styles.colorDotRed}`} />
                    <div className={`${styles.colorDot} ${styles.colorDotBlue}`} />
                    <div className={`${styles.colorDot} ${styles.colorDotGreen}`} />
                  </div>
                  컬러 퍼즐
                </button>
                <button
                  onClick={() => handleCategoryChange('gray')}
                  aria-pressed={categoryType === 'gray'}
                  className={`${styles.categoryButton} ${
                    categoryType === 'gray' 
                      ? `${styles.categoryButtonActive} ${styles.categoryButtonGray}` 
                      : styles.categoryButtonInactive
                  }`}
                >
                  <div className={styles.categoryColorDots}>
                    <div className={`${styles.colorDot} ${styles.colorDotGray300}`} />
                    <div className={`${styles.colorDot} ${styles.colorDotGray500}`} />
                    <div className={`${styles.colorDot} ${styles.colorDotGray700}`} />
                  </div>
                  흑백 퍼즐
                </button>
              </div>
            </div>

            {/* Difficulty */}
            <div className={styles.filterGroup}>
              <h4 className={styles.filterGroupTitle}>난이도 선택</h4>
              <div className={styles.difficultyButtons}>
                {DIFFICULTIES.map((diff) => (
                  <button
                    key={diff.pieces}
                    onClick={() => setSelectedDifficulty(diff.pieces)}
                    aria-pressed={selectedDifficulty === diff.pieces}
                    className={`${styles.difficultyButton} ${
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
      <section className={styles.gallerySection}>
        <div className={styles.galleryContainer}>
          <div className={styles.galleryHeader}>
            <h3 className={styles.galleryTitle}>
              {categoryType === 'color' ? '🎨' : '⚫'} {categoryType === 'color' ? '컬러' : '흑백'} 퍼즐 갤러리
              {!loading && ` (${puzzleImages.length}개)`}
            </h3>
            <div className={styles.galleryFilter}>
              {selectedDifficulty !== 0 &&
                `${DIFFICULTIES.find((d) => d.pieces === selectedDifficulty)?.label} 선택됨`}
            </div>
          </div>

          {/* 로딩 */}
          {loading && (
            <div className={styles.loadingState}>
              <div className={styles.loadingSpinner} />
              <span className={styles.loadingText}>퍼즐 로딩 중...</span>
            </div>
          )}

          {/* 오류 */}
          {error && (
            <div className={styles.errorState}>
              <div className={styles.errorIcon}>⚠️</div>
              <h4 className={styles.errorTitle}>오류가 발생했습니다</h4>
              <p className={styles.errorMessage}>{error}</p>
              <button
                onClick={() => fetchPuzzles()}
                className={styles.errorButton}
              >
                다시 시도
              </button>
            </div>
          )}

          {/* 그리드 */}
          {!loading && !error && (
            <div className={styles.galleryGrid}>
              {puzzleImages.map((puzzle, index) => (
                <div
                  key={`${puzzle.id}`}
                  className={styles.galleryCard}
                  style={{
                    animationDelay: `${index * 50}ms`,
                  }}
                >
                  <div className={styles.galleryImageContainer}>
                    <img
                      src={puzzle.url}
                      alt={`퍼즐 #${puzzle.id} 썸네일`}
                      className={styles.galleryImage}
                      loading="lazy"
                      onError={(e) => {
                        const target = e.currentTarget
                        target.onerror = null
                        target.src = `https://via.placeholder.com/400x400/cccccc/666666?text=퍼즐+${puzzle.id}`
                      }}
                    />
                  </div>
                  <div className={styles.galleryCardContent}>
                    <h4 className={styles.galleryCardTitle}>퍼즐 #{puzzle.id}</h4>
                    <div className={styles.galleryDifficultyTags}>
                      {puzzle.difficulty.map((pieces, diffIndex) => (
                        <Link
                          key={pieces}
                          href={`/puzzle?image=${encodeURIComponent(puzzle.url)}&id=${puzzle.id}&difficulty=${pieces}`}
                          className={`${styles.galleryDifficultyTag} ${
                            diffIndex === 0
                              ? styles.galleryDifficultyTagGreen
                              : diffIndex === 1
                              ? styles.galleryDifficultyTagBlue
                              : diffIndex === 2
                              ? styles.galleryDifficultyTagOrange
                              : styles.galleryDifficultyTagRed
                          }`}
                        >
                          {pieces}조각
                        </Link>
                      ))}
                    </div>
                    <Link
                      href={`/puzzle?image=${encodeURIComponent(puzzle.url)}&id=${puzzle.id}&difficulty=16`}
                      className={`${styles.galleryPlayButton} ${
                        categoryType === 'color'
                          ? styles.galleryPlayButtonColor
                          : styles.galleryPlayButtonGray
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
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🔍</div>
              <h4 className={styles.emptyTitle}>해당 조건의 퍼즐이 없습니다</h4>
              <p className={styles.emptyMessage}>다른 난이도를 선택하거나 퍼즐 타입을 변경해보세요.</p>
            </div>
          )}
        </div>
      </section>

      {/* Stats Section */}
      <section className={styles.statsSection}>
        <div className={styles.statsContainer}>
          <h3 className={styles.statsTitle}>📊 퍼즐 통계</h3>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <div className={`${styles.statNumber} ${styles.statNumberOrange}`}>10</div>
              <div className={styles.statLabel}>컬러 퍼즐</div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statNumber} ${styles.statNumberGray}`}>8</div>
              <div className={styles.statLabel}>흑백 퍼즐</div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statNumber} ${styles.statNumberPurple}`}>4</div>
              <div className={styles.statLabel}>난이도 단계</div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statNumber} ${styles.statNumberYellow}`}>6</div>
              <div className={styles.statLabel}>매일 추천</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
<footer className={styles.siteFooter}>
  <div className={styles.siteFooterContainer}>
    <div className={styles.siteFooterRow}>
      {/* 좌측: 회사 정보 */}
      <div className={styles.siteFooterLeft}>
        <div className={styles.brandLine}>
          <span className={styles.brandPrimary}>Great Senior</span>
          <span className={styles.brandSecondary}>network</span>
          <span className={styles.legalLinks}>제휴문의 | 이메일 무단 수집 거부</span>
        </div>

        <div className={styles.addressBlock}>
          <p className={styles.addressLine}>
            <span className={styles.strong}>마인드라</span> 대표자 서현숙
            <span className={`${styles.strong} ${styles.labelGap}`}>사업자등록번호:</span> 255-37-01508
          </p>
          <p>경기도 고양시 일산동구 중앙로 1036 4층(고양중장년기술창업센터, 1-1층)</p>
          <p><span className={styles.strong}>통신판매신고번호:</span> 제2025-고양일산동-0921호</p>
          <p className={styles.notice}>Copyright 2025. MINDRA INC. All rights reserved.</p>
        </div>
      </div>

      {/* 우측: 패밀리 사이트 */}
      <div className={styles.siteFooterRight}>
        <p className={styles.familyLabel}>FAMILY SITE</p>
        <div className={styles.familyRow}>
          <span className={styles.familyBrand}>
            Mind<span className={styles.familyBrandAccent}>ra</span>
          </span>
          <button
            type="button"
            aria-label="패밀리 사이트 메뉴 열기"
            className={styles.familyButton}
          >
            <svg className={styles.caretIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</footer>
    </div>
  )
}