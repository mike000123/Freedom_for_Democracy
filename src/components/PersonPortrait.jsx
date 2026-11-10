import { useState } from 'react'
import DiscussionIcon from '../icons/DiscussionIcon'

export default function PersonPortrait({ person, large = false }) {
  const [failedFile, setFailedFile] = useState(null)
  const file = person.portrait?.file
  const available = file && file !== failedFile
  return <span className={`party-person-photo${large ? ' large' : ''}`}>
    {available ? <img src={`${import.meta.env.BASE_URL}person-portraits/${file}`} alt={`Φωτογραφία: ${person.name}`} style={{ objectPosition: person.portrait.position || '50% 30%' }} loading="lazy" decoding="async" onError={() => setFailedFile(file)} />
      : <span role="img" aria-label={`Φωτογραφία μη διαθέσιμη: ${person.name}`}><DiscussionIcon name="person" /></span>}
  </span>
}
