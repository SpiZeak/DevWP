import Versions from './components/Versions'
import { JSX } from 'react'
import DockerLoader from './components/DockerLoader'
import SiteList from './components/SiteList'

function App(): JSX.Element {
  return (
    <>
      <DockerLoader />
      <SiteList />
      <Versions />
    </>
  )
}

export default App
