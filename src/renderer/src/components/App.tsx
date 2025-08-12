import Versions from './Versions'
import { JSX, useState, lazy, Suspense } from 'react'
import DockerLoader from './DockerLoader'
import SiteList from './SiteList'
import Services from './Services'

// Lazy load the settings modal
const SettingsModal = lazy(() => import('./Settings/SettingsModal'))

function App(): JSX.Element {
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)

  const handleOpenSettings = (): void => {
    setIsSettingsOpen(true)
  }

  const handleCloseSettings = (): void => {
    setIsSettingsOpen(false)
  }

  return (
    <>
      <div className="flex gap-6 p-6 w-full">
        <Services onOpenSettings={handleOpenSettings} />
        <SiteList />
      </div>
      <Versions />
      <DockerLoader />
      
      <Suspense fallback={<div>Loading...</div>}>
        <SettingsModal isOpen={isSettingsOpen} onClose={handleCloseSettings} />
      </Suspense>
    </>
  )
}

export default App
