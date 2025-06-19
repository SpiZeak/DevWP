import { useState, JSX } from 'react'

function Versions(): JSX.Element {
  const [versions] = useState(window.electron.process.versions)

  return (
    <ul className="versions">
      <li className="electron-version">Electron v{versions.electron}</li>
      <li className="chrome-version">Chromium v{versions.chrome}</li>
      <li className="node-version">Node v{versions.node}</li>
      <li className="developer-credit">
        Developed by{' '}
        <a href="https://trewhitt.au" target="_blank" rel="noopener noreferrer">
          Trewhitt
        </a>
      </li>
    </ul>
  )
}

export default Versions
