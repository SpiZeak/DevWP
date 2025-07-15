import { JSX } from 'react'

type IconProps = {
  className?: string
  content?: string
}

const Icon = ({ className, content }: IconProps): JSX.Element => (
  <span className={`text-seasalt ${className || ''} icon`}>{content || '󰖟'}</span>
)

export default Icon
