import Versions from '../Versions'
import { JSX } from 'react'
import DockerLoader from '../DockerLoader'
import SiteList from '../SiteList'
import Services from '../Services/Services'
import './App.scss'

function App(): JSX.Element {
  return (
    <>
      <div className="App">
        <Services />
        <SiteList />
      </div>
      <Versions />
      <DockerLoader />
    </>
  )
}

export default App
