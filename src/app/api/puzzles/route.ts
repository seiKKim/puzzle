// src/app/api/puzzles/route.ts

import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

interface PuzzleImage {
  id: string
  category: 'color' | 'gray'
  url: string
  difficulty: number[]
  fileName: string
}

// 이미지 파일에서 퍼즐 데이터 생성
function generatePuzzleData(): PuzzleImage[] {
  const puzzles: PuzzleImage[] = []
  
  try {
    // public/images/puzzles 경로
    const publicPath = path.join(process.cwd(), 'public', 'images', 'puzzles')
    
    // 컬러 퍼즐 스캔
    const colorPath = path.join(publicPath, 'color')
    if (fs.existsSync(colorPath)) {
      const colorFiles = fs.readdirSync(colorPath)
        .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
        .sort()
      
      colorFiles.forEach((file, index) => {
        puzzles.push({
          id: `color-${index + 1}`,
          category: 'color',
          url: `/images/puzzles/color/${file}`,
          fileName: file,
          difficulty: generateDifficulty(index)
        })
      })
    }
    
    // 흑백 퍼즐 스캔
    const grayPath = path.join(publicPath, 'gray')
    if (fs.existsSync(grayPath)) {
      const grayFiles = fs.readdirSync(grayPath)
        .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
        .sort()
      
      grayFiles.forEach((file, index) => {
        puzzles.push({
          id: `gray-${index + 1}`,
          category: 'gray',
          url: `/images/puzzles/gray/${file}`,
          fileName: file,
          difficulty: generateDifficulty(index)
        })
      })
    }
    
  } catch (error) {
    console.error('파일 시스템 읽기 오류:', error)
  }
  
  return puzzles
}

// 난이도 자동 생성 (파일 인덱스 기반)
function generateDifficulty(index: number): number[] {
  const patterns = [
    [4, 9, 16, 36],
    [4, 9, 16],
    [9, 16, 36],
    [4, 9, 16, 36],
    [4, 9, 16],
    [9, 16, 36],
    [4, 9, 16],
    [16, 36],
    [9, 16, 36],
    [4, 9, 16]
  ]
  return patterns[index % patterns.length]
}

// GET 요청 처리
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const difficulty = searchParams.get('difficulty')
    
    // 파일 시스템에서 퍼즐 데이터 생성
    let puzzles = generatePuzzleData()
    
    // 카테고리 필터링
    if (category && (category === 'color' || category === 'gray')) {
      puzzles = puzzles.filter(puzzle => puzzle.category === category)
    }
    
    // 난이도 필터링
    if (difficulty) {
      const difficultyNum = parseInt(difficulty)
      if (!isNaN(difficultyNum) && difficultyNum > 0) {
        puzzles = puzzles.filter(puzzle => 
          puzzle.difficulty.includes(difficultyNum)
        )
      }
    }
    
    return NextResponse.json({
      success: true,
      data: puzzles,
      total: puzzles.length,
      filters: {
        category,
        difficulty: difficulty ? parseInt(difficulty) : null
      }
    })
    
  } catch (error) {
    console.error('Puzzles API Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch puzzles',
        data: [],
        total: 0
      },
      { status: 500 }
    )
  }
}

// 특정 퍼즐 정보 조회
export async function POST(request: Request) {
  try {
    const { id } = await request.json()
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Puzzle ID is required' },
        { status: 400 }
      )
    }
    
    const puzzles = generatePuzzleData()
    const puzzle = puzzles.find(p => p.id === id)
    
    if (!puzzle) {
      return NextResponse.json(
        { success: false, error: 'Puzzle not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: puzzle
    })
    
  } catch (error) {
    console.error('Puzzle Detail API Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch puzzle details' },
      { status: 500 }
    )
  }
}