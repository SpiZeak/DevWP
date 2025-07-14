import Versions from '../Versions'
import { JSX } from 'react'
import DockerLoader from '../DockerLoader'
import SiteList from '../SiteList'
import Services from '../Services'

function App(): JSX.Element {
  return (
    <>
      <div className="flex gap-6 p-6 w-full">
        <Services />
        <SiteList />
      </div>
      <Versions />
      <DockerLoader />
    </>
  )
}

export default App
