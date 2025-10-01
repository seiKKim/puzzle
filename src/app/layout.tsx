// src/app/layout.tsx

import './globals.css'

import Script from 'next/script'

export const metadata = {
  title: 'Puzzle Master',
  description: '온라인 직소퍼즐 게임',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        <link 
          rel="preconnect" 
          href="https://cdn.jsdelivr.net" 
        />
        <link 
          rel="stylesheet" 
          href="https://cdn.jsdelivr.net/gh/sunn-us/SUIT/fonts/variable/woff2/SUIT-Variable.css"
        />
        <style dangerouslySetInnerHTML={{
          __html: `
            * {
              font-family: 'SUIT Variable', -apple-system, BlinkMacSystemFont, system-ui, sans-serif !important;
            }
          `
        }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}