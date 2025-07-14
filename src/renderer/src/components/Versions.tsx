import { useState, JSX } from 'react'

function Versions(): JSX.Element {
  const [versions] = useState(window.electron.process.versions)

  return (
    <ul className="inline-flex bottom-8 fixed items-center bg-[#202127] backdrop-blur-lg mx-auto py-4 rounded-3xl overflow-hidden font-mono">
      <li className="block float-left opacity-80 px-4 border-gray-600 border-r text-xs leading-3">
        Electron v{versions.electron}
      </li>
      <li className="block float-left opacity-80 px-4 border-gray-600 border-r text-xs leading-3">
        Chromium v{versions.chrome}
      </li>
      <li className="block float-left opacity-80 px-4 border-gray-600 border-r text-xs leading-3">
        Node v{versions.node}
      </li>
      <li className="block float-left opacity-100 px-4 text-xs leading-3">
        Developed by{' '}
        <a
          href="https://trewhitt.au"
          target="_blank"
          rel="noopener noreferrer"
          className="text-green-400 hover:underline no-underline"
        >
          Trewhitt
        </a>
      </li>
    </ul>
  )
}

export default Versions
