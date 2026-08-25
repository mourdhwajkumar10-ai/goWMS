import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownToLine,
  Bell,
  Box,
  CheckSquare,
  Eye,
  HeartPulse,
  PackageOpen,
  RefreshCw,
  ScanLine,
  Search,
  Square,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { FLOOR_SECTION_ORDER, groupNavBySection, type NavItemDef } from '../utils/navCatalog'
import { canUseDevice } from '../utils/permissions'

const TILE_ICONS: Record<string, LucideIcon> = {
  '/receiving': PackageOpen,
  '/dock-receiving': Box,
  '/item-verifier': CheckSquare,
  '/box-verification': ScanLine,
  '/putaway-runner': ArrowDownToLine,
  '/pick': CheckSquare,
  '/pack': Square,
  '/dispatch': Truck,
  '/cycle-count': RefreshCw,
  '/quick-count': Search,
  '/stock-scan': ScanLine,
  '/stock-peek': Eye,
  '/qi': HeartPulse,
  '/exceptions': AlertTriangle,
  '/notifications': Bell,
}

type Props = {
  title: string
  subtitle: string
  tiles: NavItemDef[]
}

export default function FloorTaskLauncher({ title, subtitle, tiles }: Props) {
  const navigate = useNavigate()
  const suggestDesk = canUseDevice('desktop')
  const sections = groupNavBySection(tiles, FLOOR_SECTION_ORDER)

  return (
    <div className="floor-launcher">
      <h1 className="floor-launcher-title">{title}</h1>
      <p className="floor-launcher-sub">{subtitle}</p>

      {tiles.length === 0 ? (
        <div className="floor-launcher-empty" role="status">
          <p className="floor-launcher-empty-msg">No floor tasks for your role</p>
          {suggestDesk && (
            <p className="floor-launcher-empty-hint">
              Switch to desk view from the user menu for management tools.
            </p>
          )}
        </div>
      ) : (
        sections.map((section) => (
          <div key={section.id} className="floor-launcher-section">
            <div className="floor-launcher-section-label">{section.title}</div>
            <div className="floor-launcher-grid">
              {section.items.map((tile) => {
                const Icon = TILE_ICONS[tile.to]
                return (
                  <button
                    key={tile.to}
                    type="button"
                    className="floor-launcher-tile"
                    onClick={() => navigate(tile.to)}
                  >
                    {Icon ? <Icon size={22} strokeWidth={1.8} aria-hidden /> : null}
                    <span className="floor-launcher-tile-label">{tile.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
