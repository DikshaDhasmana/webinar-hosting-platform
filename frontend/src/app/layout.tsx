import './globals.css'
import { ReactNode } from 'react'

export const metadata = {
  title: 'Webinar Hosting Platform',
  description: 'Scalable webinar hosting platform frontend',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="bg-gradient-to-b from-gray-100 to-white dark:from-black dark:to-black text-gray-900 dark:text-gray-100 min-h-screen">
        {children}
      </body>
    </html>
  )
}
