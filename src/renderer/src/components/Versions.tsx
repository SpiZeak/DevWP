import { useState, JSX } from 'react'

function Versions(): JSX.Element {
  const [versions] = useState(window.electron.process.versions)

  return (
    <ul className="inline-flex bottom-8 left-1/2 fixed justify-center items-center bg-rich-black-400 backdrop-blur-lg mx-auto py-4 rounded-3xl overflow-hidden font-mono -translate-x-1/2 transform">
      <li className="flex flex-col items-center opacity-80 px-4 border-seasalt-600 border-r text-xs">
        <span className="text-seasalt-400 uppercase tracking-wide">Electron</span>
        <span className="mt-1 font-semibold text-white">v{versions.electron}</span>
      </li>
      <li className="flex flex-col items-center opacity-80 px-4 border-seasalt-600 border-r text-xs">
        <span className="text-seasalt-400 uppercase tracking-wide">Chromium</span>
        <span className="mt-1 font-semibold text-white">v{versions.chrome}</span>
      </li>
      <li className="flex flex-col items-center opacity-80 px-4 border-seasalt-600 border-r text-xs">
        <span className="text-seasalt-400 uppercase tracking-wide">Node</span>
        <span className="mt-1 font-semibold text-white">v{versions.node}</span>
      </li>
      <li className="flex flex-col items-center opacity-100 px-4 text-xs">
        <span className="text-seasalt-400 uppercase tracking-wide">Developer</span>
        <a
          href="https://trewhitt.au"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 font-semibold text-pumpkin hover:underline no-underline"
        >
          Trewhitt
        </a>
      </li>
    </ul>
  )
}

export default Versions
