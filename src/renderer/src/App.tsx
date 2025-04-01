import Versions from './components/Versions'
import { JSX } from 'react'
import DockerLoader from './components/DockerLoader'
import SiteList from './components/SiteList'
import Services from './components/Services/Services'

function App(): JSX.Element {
  return (
    <>
      <Services />
      <DockerLoader />
      <SiteList />
      <Versions />
    </>
  )
}

export default App
