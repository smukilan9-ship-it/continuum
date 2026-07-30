"use client";

import { BookOpen, Ellipsis, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Badge,
  Banner,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  CitationChip,
  ConfirmationDialog,
  ContextChip,
  DataRegion,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  List,
  LoadingButton,
  LoadingState,
  Menu,
  Modal,
  Popover,
  ProgressBar,
  Radio,
  Row,
  Select,
  SidePanel,
  Skeleton,
  StatusChip,
  SuccessState,
  Switch,
  Table,
  Tabs,
  Textarea,
  ToastProvider,
  Tooltip,
  useToast,
  type RegionStatus,
  type StatusTone,
} from "@/components/ui";

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="kit-section">
      <div className="kit-section-head">
        <h2>{title}</h2>
        {note ? <p>{note}</p> : null}
      </div>
      <div className="kit-section-body">{children}</div>
    </section>
  );
}

function ThemeSwitcher() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  return (
    <div className="kit-toolbar">
      <Tabs
        label="Theme"
        variant="segmented"
        value={theme}
        onChange={setTheme}
        options={[{ value: "light" as const, label: "Light" }, { value: "dark" as const, label: "Dark" }]}
      />
      <DensitySwitcher />
    </div>
  );
}

function DensitySwitcher() {
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  useEffect(() => { document.documentElement.dataset.density = density; }, [density]);
  return (
    <Tabs
      label="Density"
      variant="segmented"
      value={density}
      onChange={setDensity}
      options={[{ value: "comfortable" as const, label: "Comfortable" }, { value: "compact" as const, label: "Compact" }]}
    />
  );
}

const STATUS_TONES: StatusTone[] = ["neutral", "success", "warning", "danger", "info", "processing"];
const REGION_STATES: RegionStatus[] = ["idle", "loading", "error", "empty", "ready"];

function ToastDemo() {
  const { push } = useToast();
  return (
    <div className="kit-row">
      <Button variant="secondary" onClick={() => push({ tone: "info", message: "Saved to your library." })}>Info</Button>
      <Button variant="secondary" onClick={() => push({ tone: "success", message: "Week saved.", action: { label: "Undo", onSelect: () => {} } })}>Success + undo</Button>
      <Button variant="secondary" onClick={() => push({ tone: "error", message: "Couldn't reach OpenAlex. Your saved sources still work." })}>Error (persists)</Button>
    </div>
  );
}

export function KitGallery() {
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [panel, setPanel] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [switched, setSwitched] = useState(true);
  const [tab, setTab] = useState("overview");

  return (
    <ToastProvider>
      <main className="kit-page">
        <header className="kit-head">
          <p className="eyebrow">Design system</p>
          <h1>Component kit</h1>
          <p>Every component in every state. This page is the visual-regression fixture — if a component is not here, it is not in the kit.</p>
          <ThemeSwitcher />
        </header>

        <Section title="Button" note="One primary per screen region. Variants never appear two-primaries side by side.">
          <div className="kit-row">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="quiet">Quiet</Button>
            <Button variant="danger">Danger</Button>
          </div>
          <div className="kit-row">
            <Button variant="primary" size="sm">Small</Button>
            <Button variant="primary">Medium</Button>
            <Button variant="primary" size="lg">Large</Button>
          </div>
          <div className="kit-row">
            <Button variant="primary" disabled>Disabled</Button>
            <LoadingButton variant="primary" loading loadingLabel="Saving…">Save</LoadingButton>
          </div>
          <div className="kit-row">
            <Tooltip label="Add a source"><IconButton label="Add a source"><Plus size={16} /></IconButton></Tooltip>
            <IconButton label="More actions" size={28}><Ellipsis size={16} /></IconButton>
            <IconButton label="Delete" variant="danger" size={36}><Trash2 size={16} /></IconButton>
          </div>
        </Section>

        <Section title="Status and chips" note="Status is text plus icon — never colour alone.">
          <div className="kit-row">{STATUS_TONES.map((tone) => <StatusChip key={tone} tone={tone} label={tone} />)}</div>
          <div className="kit-row">
            <Badge tone="neutral">neutral</Badge>
            <Badge tone="green">green</Badge>
            <Badge tone="orange">orange</Badge>
            <Badge tone="red">red</Badge>
          </div>
          <div className="kit-row">
            <ContextChip kind="goal" label="Raise SAT to 1570+" />
            <ContextChip kind="project" label="OASIS" onRemove={() => {}} />
            <ContextChip kind="file" label="student_records.py" onRemove={() => {}} />
          </div>
          <div className="kit-row">
            <CitationChip kind="decision" label="OASIS" detail="cross-marker association" onOpen={() => {}} />
            <CitationChip kind="source" label="Stack et al. 2014" detail="p.3" onOpen={() => {}} />
            <CitationChip kind="concept" label="Advanced geometry" />
          </div>
        </Section>

        <Section title="Progress">
          <div className="kit-stack">
            <ProgressBar value={42} label="SAT goal" size={4} />
            <ProgressBar value={68} label="SQL goal" size={2} />
            <ProgressBar value={100} label="Done" size={4} valueText="Complete" />
          </div>
        </Section>

        <Section title="Form controls" note="Every control is labelled; errors are programmatically associated.">
          <div className="kit-grid">
            <Field label="Goal title" hint="One sentence — what you're working toward.">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} placeholder="Raise my SAT score to 1550" />}
            </Field>
            <Field label="Username" error="That username is already taken.">
              {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} defaultValue="mukilan" />}
            </Field>
            <Field label="Session length">
              {({ id }) => <Select id={id} defaultValue="45"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></Select>}
            </Field>
            <Field label="Notes">
              {({ id }) => <Textarea id={id} placeholder="What did you work out?" />}
            </Field>
          </div>
          <div className="kit-row">
            <Checkbox label="Use my sources" defaultChecked />
            <Checkbox label="Use my Obsidian notes" />
            <Radio name="kit-radio" label="Fast" defaultChecked />
            <Radio name="kit-radio" label="Deep" />
          </div>
          <Switch label="Let the assistant read my Zotero library" description="Takes effect immediately." checked={switched} onCheckedChange={setSwitched} />
          <Switch label="Disabled switch" checked={false} onCheckedChange={() => {}} disabled />
        </Section>

        <Section title="Navigation">
          <Breadcrumb items={[{ label: "Master SQL and Python", href: "/" }, { label: "Study" }]} />
          <Tabs label="Goal views" value={tab} onChange={setTab} options={[
            { value: "overview", label: "Overview" },
            { value: "plan", label: "Plan" },
            { value: "study", label: "Study" },
            { value: "sources", label: "Sources", badge: 12 },
          ]} />
          <Tabs label="Goal views compact" variant="segmented" value={tab} onChange={setTab} options={[
            { value: "overview", label: "Overview" },
            { value: "plan", label: "Plan" },
            { value: "study", label: "Study" },
          ]} />
        </Section>

        <Section title="Lists and tables" note="A list is the default for collections; a table is for comparable numbers.">
          <Card>
            <List label="Sources">
              <Row leading={<BookOpen size={16} />} title="Spatial analysis of multiplex immunohistochemistry" meta="Stack et al. · 2014 · OpenAlex" trailing={<StatusChip tone="success" label="Ready" />} actions={<IconButton label="More" size={28}><Ellipsis size={14} /></IconButton>} onSelect={() => {}} />
              <Row leading={<BookOpen size={16} />} title="Cross-marker association methods" meta="Uploaded · 2.4 MB" trailing={<StatusChip tone="processing" label="Processing…" />} onSelect={() => {}} />
              <Row leading={<BookOpen size={16} />} title="A scanned worksheet with no text layer" meta="Upload failed" trailing={<StatusChip tone="danger" label="Failed" />} selected onSelect={() => {}} />
            </List>
          </Card>
          <Table
            caption="Mastery by concept"
            getKey={(item) => item.concept}
            items={[
              { concept: "Advanced geometry", transfer: 28, retention: 61, practised: "3 days ago" },
              { concept: "Quadratics", transfer: 74, retention: 80, practised: "yesterday" },
            ]}
            columns={[
              { key: "concept", header: "Concept", render: (item) => item.concept },
              { key: "transfer", header: "Transfer", numeric: true, render: (item) => `${item.transfer}%` },
              { key: "retention", header: "Retention", numeric: true, render: (item) => `${item.retention}%` },
              { key: "practised", header: "Last practised", render: (item) => item.practised },
            ]}
          />
        </Section>

        <Section title="Overlays">
          <div className="kit-row">
            <Button variant="secondary" onClick={() => setModal(true)}>Modal</Button>
            <Button variant="secondary" onClick={() => setConfirm(true)}>Confirmation</Button>
            <Button variant="secondary" onClick={() => setPanel(true)}>Side panel</Button>
            <Button variant="secondary" onClick={() => setDrawer(true)}>Drawer</Button>
            <Popover trigger={<Button variant="secondary">Popover</Button>}><p style={{ margin: 0, padding: "8px 12px" }}>Lightweight picker content.</p></Popover>
            <Menu
              label="Row actions"
              trigger={<Button variant="secondary">Menu</Button>}
              items={[
                { label: "Open", onSelect: () => {} },
                { label: "Ask about this", onSelect: () => {} },
                { label: "Send to project", onSelect: () => {}, disabled: true, disabledReason: "This source has no project yet" },
                { label: "Delete", onSelect: () => {}, destructive: true, icon: <Trash2 size={14} /> },
              ]}
            />
          </div>
          <Modal open={modal} onOpenChange={setModal} title="Add a source" description="Upload a file, add a link, or import from Zotero." footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button><Button variant="primary">Add source</Button></>}>
            <Field label="Link or DOI">{({ id }) => <Input id={id} placeholder="10.1038/nature12373" />}</Field>
          </Modal>
          <ConfirmationDialog open={confirm} onOpenChange={setConfirm} title="Delete this source?" description="The passages it contributed stay cited in your claims, marked as removed." confirmLabel="Delete source" onConfirm={() => setConfirm(false)} destructive />
          <SidePanel open={panel} onOpenChange={setPanel} title="What this answer used">
            <div className="kit-stack">
              <CitationChip kind="decision" label="OASIS" detail="cross-marker association" />
              <p style={{ margin: 0, color: "var(--ink-2)", fontSize: "var(--t-small)" }}>The exact passage the assistant retrieved appears here, with Open and “Don’t use this again”.</p>
            </div>
          </SidePanel>
          <Drawer open={drawer} onOpenChange={setDrawer} title="Navigation"><div style={{ padding: "16px" }}><p style={{ margin: 0 }}>Mobile navigation drawer.</p></div></Drawer>
        </Section>

        <Section title="Feedback" note="One empty state, one loading pattern, one error pattern — product-wide.">
          <div className="kit-stack">
            <Banner tone="info" title="Confirm your email">Confirm your email to enable password recovery.</Banner>
            <Banner tone="warning">Two notes need review before Continuum can sync.</Banner>
            <Banner tone="danger" title="Couldn't write to your vault">Obsidian refused the write. Retry, or check the folder still exists.</Banner>
            <Banner tone="success" onDismiss={() => {}}>Password updated. Other sessions were signed out.</Banner>
          </div>
          <ToastDemo />
          <div className="kit-grid">
            <Card><EmptyState title="No claims yet" body="Claims stay unverified until they cite a passage you own." action={<Button variant="primary" size="sm">Add a claim</Button>} /></Card>
            <Card><ErrorState title="OpenAlex is unavailable" body="Your saved sources still work." action={<Button variant="secondary" size="sm">Retry</Button>} detail="502 Bad Gateway from api.openalex.org" /></Card>
            <Card><SuccessState title="Transfer updated" body="You applied it to something new — 28% to 41%." /></Card>
            <Card><LoadingState rows={3} /></Card>
          </div>
          <div className="kit-stack">
            <Skeleton height={38} width="58%" />
            <Skeleton height={80} />
          </div>
          <div className="kit-grid">
            {REGION_STATES.map((status) => (
              <Card key={status}>
                <p className="eyebrow" style={{ padding: "8px 12px 0" }}>{status}</p>
                <DataRegion
                  status={status}
                  idle={<EmptyState title="Search 250M+ works" body="Start with a topic, a title, or a DOI." />}
                  error={<ErrorState title="That query wasn't understood" body="Try fewer operators." />}
                  empty={<EmptyState title="No results for 'xyz'" body="Broaden the query or remove a filter." />}
                >
                  <p style={{ padding: "12px", margin: 0 }}>Ready — 24 of 16,320 results.</p>
                </DataRegion>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="Reading surface" note="Serif is scoped to reading only — lesson bodies, passages, answers.">
          <Card>
            <div className="prose-reading" style={{ padding: "20px" }}>
              <p>A concept moves forward when you answer something you have not seen before — not when you finish a video. Continuum records the attempt, names the dimension that changed, and shows you the number before and after.</p>
            </div>
          </Card>
        </Section>
      </main>
    </ToastProvider>
  );
}
