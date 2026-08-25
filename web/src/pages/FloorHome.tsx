import { getRole } from '../services/api'
import { getPermissions } from '../utils/permissions'
import { listFloorTiles } from '../utils/navCatalog'
import FloorTaskLauncher from '../components/FloorTaskLauncher'

export default function FloorHome() {
  const tiles = listFloorTiles(getRole(), getPermissions())
  return (
    <FloorTaskLauncher
      title="Floor tasks"
      subtitle="Choose a job for this shift"
      tiles={tiles}
    />
  )
}
