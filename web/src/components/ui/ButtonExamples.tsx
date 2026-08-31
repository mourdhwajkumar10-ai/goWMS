import { Button, ButtonGroup, ActionBar, Toolbar } from '.'
import { Plus, Save, X, Edit, Trash2, Download, Upload, Search, Filter, ChevronDown } from 'lucide-react'

export function ButtonLayoutExamples() {
  return (
    <div className="desk-page space-y-8 p-6">
      <h1 className="page-title">Button Layout Examples</h1>

      <section className="erpnext-card p-6 space-y-6">
        <h2 className="text-lg font-semibold">Button Variants</h2>
        <ButtonGroup spacing="md" wrap>
          <Button variant="default">Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </ButtonGroup>

        <h3 className="text-medium font-medium mt-6">Button Sizes</h3>
        <ButtonGroup spacing="md" wrap>
          <Button size="xs">Extra Small</Button>
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
        </ButtonGroup>
      </section>

      <section className="erpnext-card p-6 space-y-6">
        <h2 className="text-lg font-semibold">Icon Buttons</h2>
        <ButtonGroup spacing="sm">
          <Button size="icon" aria-label="Add"><Plus size={16} /></Button>
          <Button size="icon" variant="secondary" aria-label="Save"><Save size={16} /></Button>
          <Button size="icon" variant="outline" aria-label="Cancel"><X size={16} /></Button>
          <Button size="icon" variant="destructive" aria-label="Delete"><Trash2 size={16} /></Button>
        </ButtonGroup>

        <ButtonGroup spacing="sm">
          <Button size="icon-sm" aria-label="Edit"><Edit size={14} /></Button>
          <Button size="icon" aria-label="Download"><Download size={16} /></Button>
          <Button size="icon-lg" aria-label="Upload"><Upload size={20} /></Button>
        </ButtonGroup>

        <ButtonGroup spacing="sm">
          <Button variant="secondary" size="icon" aria-label="Search"><Search size={16} /></Button>
          <Button variant="secondary" size="icon" aria-label="Filter"><Filter size={16} /></Button>
          <Button variant="secondary" size="icon" aria-label="Menu"><ChevronDown size={16} /></Button>
        </ButtonGroup>
      </section>

      <section className="erpnext-card p-6 space-y-6">
        <h2 className="text-lg font-semibold">Action Bar (Page-level actions)</h2>
        <ActionBar
          primary={
            <>
              <Button variant="secondary">Cancel</Button>
              <Button variant="default">Save Changes</Button>
            </>
          }
          secondary={
            <Button variant="outline">Preview</Button>
          }
          leading={
            <Button variant="ghost" size="sm">← Back</Button>
          }
        />

        <ActionBar
          primary={
            <Button variant="default">
              <Plus size={16} className="mr-2" />
              Create New
            </Button>
          }
          secondary={
            <>
              <Button variant="outline">Export</Button>
              <Button variant="outline"><Download size={14} className="mr-1" /> CSV</Button>
            </>
          }
        />
      </section>

      <section className="erpnext-card p-6 space-y-6">
        <h2 className="text-lg font-semibold">Toolbar (Complex layouts)</h2>
        <Toolbar
          left={
            <ButtonGroup spacing="sm">
              <Button variant="outline" size="sm"><Search size={14} className="mr-1" /> Search</Button>
              <Button variant="outline" size="sm"><Filter size={14} className="mr-1" /> Filter</Button>
            </ButtonGroup>
          }
          center={
            <ButtonGroup spacing="sm">
              <Button variant="secondary" size="sm">10 per page</Button>
              <Button variant="outline" size="sm"><ChevronDown size={12} /></Button>
            </ButtonGroup>
          }
          right={
            <ButtonGroup spacing="sm">
              <Button variant="secondary" size="sm"><Plus size={14} className="mr-1" /> New</Button>
              <Button variant="default" size="sm">Import</Button>
            </ButtonGroup>
          }
        />

        <Toolbar
          left={
            <h3 className="font-semibold">Sales Orders (42)</h3>
          }
          right={
            <ButtonGroup spacing="sm">
              <Button variant="ghost" size="sm"><ChevronDown size={14} /> Columns</Button>
              <Button variant="outline" size="sm"><Download size={14} className="mr-1" /> Export</Button>
              <Button variant="default" size="sm"><Plus size={14} className="mr-1" /> New Order</Button>
            </ButtonGroup>
          }
        />
      </section>

      <section className="erpnext-card p-6 space-y-6">
        <h2 className="text-lg font-semibold">Vertical Button Groups</h2>
        <ButtonGroup orientation="vertical" spacing="sm">
          <Button variant="default"><Plus size={16} className="mr-2" /> Add Item</Button>
          <Button variant="outline"><Edit size={16} className="mr-2" /> Edit</Button>
          <Button variant="outline"><Trash2 size={16} className="mr-2" /> Delete</Button>
          <Button variant="ghost"><Save size={16} className="mr-2" /> Save as Draft</Button>
        </ButtonGroup>
      </section>

      <section className="erpnext-card p-6 space-y-6">
        <h2 className="text-lg font-semibold">Real-world Examples</h2>

        <div className="erpnext-card p-4 space-y-4">
          <h4 className="font-medium">List Page Header</h4>
          <Toolbar
            left={
              <h3 className="font-semibold">Sales Orders (1,234)</h3>
            }
            right={
              <ButtonGroup spacing="sm">
                <Button variant="ghost" size="sm"><ChevronDown size={14} /> Columns</Button>
                <Button variant="outline" size="sm"><Download size={14} className="mr-1" /> Export CSV</Button>
                <Button variant="default" size="sm"><Plus size={14} className="mr-1" /> New Order</Button>
              </ButtonGroup>
            }
          />
        </div>

        <div className="erpnext-card p-4 space-y-4">
          <h4 className="font-medium">Detail Page Actions</h4>
          <ActionBar
            leading={
              <Button variant="ghost" size="sm">← Back to List</Button>
            }
            primary={
              <ButtonGroup spacing="sm">
                <Button variant="secondary">Cancel</Button>
                <Button variant="destructive">Delete</Button>
                <Button variant="default">Save Changes</Button>
              </ButtonGroup>
            }
          />
        </div>

        <div className="erpnext-card p-4 space-y-4">
          <h4 className="font-medium">Inline Row Actions</h4>
          <ButtonGroup spacing="sm" wrap>
            <Button variant="ghost" size="xs"><Edit size={12} /></Button>
            <Button variant="destructive" size="xs"><Trash2 size={12} /></Button>
          </ButtonGroup>
          <p className="text-sm text-text-dim">Use in table rows for edit/delete actions</p>
        </div>
      </section>
    </div>
  )
}