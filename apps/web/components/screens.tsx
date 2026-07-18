"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  ArrowRight,
  BookMarked,
  BookOpen,
  Brain,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Filter,
  FlaskConical,
  GitBranch,
  Info,
  Layers3,
  Link2,
  LockKeyhole,
  MoreHorizontal,
  Network,
  Plus,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { InlineMath } from "react-katex";
import { useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ConceptMap } from "@/components/concept-map";
import { Badge, Button, Card, Progress } from "@/components/ui";
import {
  activity,
  demoUser,
  diagnosticQuestions,
  integrations,
  learningResources,
  masteryAfter,
  masteryBefore,
  memories,
  papers,
  physicsGoal,
  researchClaims,
  researchProject,
  routes,
} from "@/lib/demo-data";
import type { ScheduleItem, View } from "@/components/continuum-app";

type Navigate = (view: View) => void;
type Toast = (message: string | null) => void;

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: React.ReactNode; description: string; action?: React.ReactNode }) {
  return (
    <div className="page-intro">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>
      {action && <div className="page-action">{action}</div>}
    </div>
  );
}

export function TodayScreen({
  schedule,
  setSchedule,
  onNavigate,
  showToast,
  learningComplete,
}: {
  schedule: ScheduleItem[];
  setSchedule: Dispatch<SetStateAction<ScheduleItem[]>>;
  onNavigate: Navigate;
  showToast: Toast;
  learningComplete: boolean;
}) {
  const [replanned, setReplanned] = useState(false);

  const replan = () => {
    setSchedule((items) => items.map((item) => {
      if (item.id === "block_research_1") return { ...item, status: "missed", time: "—", end: "—" };
      if (item.id === "block_review_1") return { ...item, time: "16:50", end: "17:20", reason: "Moved into the first unaffected high-energy window" };
      return item;
    }).concat(items.some((item) => item.id === "block_research_replan") ? [] : [{
      id: "block_research_replan",
      taskId: "task_research",
      time: "18:10",
      end: "18:55",
      duration: 45,
      title: "Validate grouped split",
      kind: "research",
      status: "planned",
      flexible: true,
      evidence: "Save comparison note",
      reason: "Moved after the missed block; completed work was preserved",
    }]));
    setReplanned(true);
    showToast("Plan repaired. Only the missed research task and one flexible review moved.");
  };

  return (
    <div className="screen today-screen">
      <PageIntro
        eyebrow="SATURDAY · 18 JULY"
        title={<>Good morning, {demoUser.name}.<br /><em>Let’s make today count.</em></>}
        description="Your plan balances tomorrow’s Physics assessment with one research blocker. Hard commitments are protected."
        action={<Button className="button-secondary" onClick={replan}><RefreshCw size={16} /> Quick replan</Button>}
      />

      {replanned && <div className="replan-banner"><CheckCircle2 size={18} /><div><strong>Plan repaired, not rebuilt.</strong><span>2 flexible blocks moved · school lab and completed work preserved</span></div><button onClick={() => setReplanned(false)} aria-label="Dismiss"><X size={16} /></button></div>}

      <section className="dashboard-grid">
        <Card className="focus-card">
          <div className="focus-top">
            <Badge tone="lime"><Zap size={12} /> BEST NEXT ACTION</Badge>
            <span>25 min</span>
          </div>
          <div className="focus-body">
            <p>PHYSICS · TOMORROW</p>
            <h2>{learningComplete ? "Lock in transfer with one mixed problem" : "Untangle potential from potential energy"}</h2>
            <p className="focus-reason">{learningComplete ? "Your unseen checkpoint passed. One spaced item will protect retention before the assessment." : "Your last answer suggests you’re treating electric potential as if it depends on the test charge."}</p>
            <div className="focus-evidence"><Brain size={18} /><div><strong>{learningComplete ? "Verified checkpoint" : "Misconception signal"}</strong><span>{learningComplete ? "Transfer rose after independent evidence" : "High confidence · diagnostic item 1 of 3"}</span></div></div>
            <Button className="button-lime" onClick={() => onNavigate("learn")}>{learningComplete ? "Open review" : "Start diagnostic"}<ArrowRight size={17} /></Button>
          </div>
          <div className="focus-orbit orbit-one" /><div className="focus-orbit orbit-two" />
        </Card>

        <Card className="goal-pulse-card">
          <div className="card-heading"><div><p className="eyebrow">GOAL PULSE</p><h3>Assessment readiness</h3></div><Badge tone="green">On track</Badge></div>
          <div className="readiness-number"><strong>{learningComplete ? 71 : physicsGoal.progress}<sup>%</sup></strong><span>ready</span></div>
          <Progress value={learningComplete ? 71 : physicsGoal.progress} label="Assessment readiness" />
          <div className="pulse-stats"><div><span>1</span><small>concept at risk</small></div><div><span>4h 20m</span><small>planned before exam</small></div></div>
          <button className="text-link" onClick={() => onNavigate("goals")}>View goal <ArrowRight size={14} /></button>
        </Card>
      </section>

      <section className="today-lower-grid">
        <Card className="timeline-card">
          <div className="card-heading"><div><p className="eyebrow">YOUR DAY</p><h3>A feasible plan, not a wish list</h3></div><span className="capacity"><i /> 1h 40m flexible</span></div>
          <div className="timeline">
            {schedule.map((item) => (
              <div key={item.id} className={`timeline-item timeline-${item.kind} status-${item.status}`}>
                <div className="timeline-time"><strong>{item.time}</strong><span>{item.end}</span></div>
                <div className="timeline-line"><i /></div>
                <div className="timeline-content">
                  <div><Badge tone={item.kind === "fixed" ? "neutral" : item.kind === "research" ? "orange" : "green"}>{item.kind === "fixed" ? "FIXED" : item.kind.toUpperCase()}</Badge>{item.status === "done" && <Badge tone="green"><Check size={11} /> VERIFIED</Badge>}{item.status === "missed" && <Badge tone="red">MISSED</Badge>}</div>
                  <h4>{item.title}</h4>
                  <p>{item.reason}</p>
                  <span className="evidence-line"><FileCheck2 size={13} /> {item.evidence}</span>
                </div>
                <div className="timeline-duration">{item.duration}m</div>
              </div>
            ))}
          </div>
          {!replanned && <button className="missed-link" onClick={replan}><TimerReset size={15} /> I missed the research block — repair my plan</button>}
        </Card>

        <div className="right-stack">
          <Card className="risk-card">
            <div className="card-heading"><div><p className="eyebrow">DEADLINE RADAR</p><h3>What needs attention</h3></div><AlertCircle size={18} /></div>
            <div className="risk-item high"><span className="risk-dot" /><div><strong>Physics assessment</strong><p>Tomorrow · potential concept at risk</p></div><Badge tone="red">High</Badge></div>
            <div className="risk-item medium"><span className="risk-dot" /><div><strong>Methods validation</strong><p>3 days · one open decision</p></div><Badge tone="orange">Medium</Badge></div>
          </Card>
          <Card className="resource-card">
            <div className="resource-icon"><BookMarked size={19} /></div>
            <div><p className="eyebrow">RESOURCE MATCH</p><h3>6-minute micro-lesson</h3><p>Chosen over a full chapter because it targets your exact misconception.</p></div>
            <button onClick={() => onNavigate("learn")} aria-label="Open resource"><ArrowRight size={17} /></button>
          </Card>
          <Card className="ask-card">
            <Sparkles size={18} /><div><strong>Ask Continuum</strong><span>“Why is this my priority?”</span></div><button onClick={() => showToast("Priority explained: deadline risk × misconception evidence × available high-energy time.")}><ArrowRight size={16} /></button>
          </Card>
        </div>
      </section>
    </div>
  );
}

export function GoalsScreen({ onNavigate, showToast }: { onNavigate: Navigate; showToast: Toast }) {
  const [open, setOpen] = useState(false);
  const [extraGoals, setExtraGoals] = useState<Array<{ title: string; date: string; outcome: string }>>([]);
  const submitGoal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setExtraGoals((items) => [...items, { title: String(form.get("title")), date: String(form.get("date")), outcome: String(form.get("outcome")) }]);
    setOpen(false);
    showToast("Goal created with editable milestones and uncertain assumptions clearly marked.");
  };
  return (
    <div className="screen goals-screen">
      <PageIntro eyebrow="GOALS" title={<>Turn intent into <em>evidence.</em></>} description="Every goal carries a deadline, milestone graph, blockers, tasks, and proof of progress."
        action={<Button className="button-primary" onClick={() => setOpen(true)}><Plus size={16} /> New goal</Button>} />
      <section className="goal-layout">
        <Card className="goal-hero-card">
          <div className="goal-hero-head"><div><Badge tone="green">ACTIVE · ON TRACK</Badge><p>{physicsGoal.eyebrow}</p><h2>{physicsGoal.title}</h2></div><div className="goal-ring"><strong>64%</strong><span>ready</span></div></div>
          <div className="goal-meta"><div><Target size={16} /><span><small>Target outcome</small>{physicsGoal.target}</span></div><div><CalendarClock size={16} /><span><small>Deadline</small>{physicsGoal.deadline}</span></div></div>
          <div className="assumption-note"><Info size={15} /><span><strong>Assumption to confirm:</strong> {physicsGoal.uncertainty}</span><button onClick={() => showToast("Assumption marked as confirmed.")}>Confirm</button></div>
          <div className="milestone-section"><div className="section-label"><span>Milestone graph</span><small>4 stages · 1 active</small></div><div className="milestone-track">
            {physicsGoal.milestones.map((milestone, index) => <div key={milestone.id} className={`milestone milestone-${milestone.status}`}><div className="milestone-node">{milestone.status === "done" ? <Check size={15} /> : index + 1}</div><div><strong>{milestone.title}</strong><span>{milestone.note}</span></div></div>)}
          </div></div>
          <div className="goal-footer"><div><AlertCircle size={17} /><span><small>Current blocker</small>Potential vs potential-energy misconception</span></div><Button className="button-lime" onClick={() => onNavigate("learn")}>Resolve blocker <ArrowRight size={16} /></Button></div>
        </Card>
        <aside className="goal-side">
          <Card><p className="eyebrow">NEXT EVIDENCE</p><div className="next-evidence-icon"><FileCheck2 size={21} /></div><h3>Pass one unseen potential problem</h3><p>Reading the lesson is not enough. Transfer moves only after independent evidence.</p><Button className="button-secondary full" onClick={() => onNavigate("learn")}>Open checkpoint</Button></Card>
          <Card><p className="eyebrow">RECENT PROGRESS</p><div className="mini-activity"><i className="green" /><div><strong>Electric field prerequisite</strong><span>Mastered · 2 days ago</span></div></div><div className="mini-activity"><i className="orange" /><div><strong>Misconception detected</strong><span>Diagnostic · 8 min ago</span></div></div><div className="mini-activity"><i className="purple" /><div><strong>Review scheduled</strong><span>Today · 5:20 PM</span></div></div></Card>
        </aside>
      </section>
      {extraGoals.length > 0 && <section className="extra-goals"><h3>Other goals</h3>{extraGoals.map((goal) => <Card key={`${goal.title}-${goal.date}`}><Badge tone="neutral">NEW · NEEDS INTAKE</Badge><h4>{goal.title}</h4><p>{goal.outcome}</p><span>Target {goal.date}</span></Card>)}</section>}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><div className="dialog-head"><div><p className="eyebrow">NEW GOAL</p><Dialog.Title>What are you working toward?</Dialog.Title><Dialog.Description>You can edit every inferred field before anything is saved.</Dialog.Description></div><Dialog.Close className="icon-button"><X size={18} /></Dialog.Close></div><form onSubmit={submitGoal} className="goal-form"><label>Goal title<input name="title" required minLength={3} placeholder="e.g. Prepare for my Physics assessment" /></label><div className="form-row"><label>Target date<input name="date" type="date" required defaultValue="2026-07-25" /></label><label>Weekly time<input name="hours" type="number" min="1" max="80" defaultValue="6" /></label></div><label>Target outcome<textarea name="outcome" required minLength={3} placeholder="What would success look like?" /></label><label>Current level<select name="level" defaultValue="some"><option value="new">New to this</option><option value="some">Some familiarity</option><option value="confident">Mostly confident</option></select></label><div className="uncertain-fields"><Sparkles size={15} /><span>Continuum will propose editable milestones, tasks, and a first diagnostic. Uncertain assumptions are always flagged.</span></div><div className="dialog-actions"><Dialog.Close className="button button-secondary" type="button">Cancel</Dialog.Close><button className="button button-primary" type="submit">Create goal <ArrowRight size={16} /></button></div></form></Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

type LearnStage = "overview" | "diagnostic" | "result" | "lesson" | "checkpoint" | "complete";

export function LearnScreen({ completed, onComplete, showToast }: { completed: boolean; onComplete: () => void; showToast: Toast }) {
  const [stage, setStage] = useState<LearnStage>(completed ? "complete" : "overview");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [checkpoint, setCheckpoint] = useState("");
  const [checkpointError, setCheckpointError] = useState(false);
  const hasMisconception = answers[0] !== diagnosticQuestions[0]?.correct || answers[2] !== diagnosticQuestions[2]?.correct;
  const mastery = stage === "complete" || completed ? masteryAfter : masteryBefore;

  const nextQuestion = () => {
    if (selected === null) return;
    const nextAnswers = [...answers, selected];
    setAnswers(nextAnswers);
    setSelected(null);
    if (questionIndex === diagnosticQuestions.length - 1) setStage("result");
    else setQuestionIndex((index) => index + 1);
  };

  const verifyCheckpoint = () => {
    if (Math.abs(Number(checkpoint) - 24) > 0.01) {
      setCheckpointError(true);
      return;
    }
    setCheckpointError(false);
    setStage("complete");
    onComplete();
  };

  return (
    <div className="screen learn-screen">
      <PageIntro eyebrow="ADAPTIVE LEARNING · PHYSICS" title={<>Understand it. Then <em>prove it.</em></>} description="Continuum diagnoses before teaching and changes mastery only when your work provides evidence." action={<Badge tone="green"><ShieldCheck size={13} /> SOURCE LOCKED</Badge>} />
      <div className="learn-grid">
        <section className="learn-main">
          <Card className="concept-card"><div className="card-heading"><div><p className="eyebrow">KNOWLEDGE MAP</p><h3>Electrostatic potential & capacitance</h3></div><div className="map-legend"><span><i className="mastered" /> Mastered</span><span><i className="active" /> Practicing</span><span><i className="risk" /> Misconception</span></div></div><ConceptMap completed={stage === "complete" || completed} /></Card>
          <Card className="learning-workspace">
            {stage === "overview" && <div className="lesson-intro"><Badge tone="orange"><Brain size={12} /> DIAGNOSTIC FIRST</Badge><p className="eyebrow">CURRENT CONCEPT</p><h2>Electric potential is not potential energy.</h2><p>Three high-information questions will test the distinction, the role of charge, and equipotential work. This takes about 3 minutes.</p><div className="lesson-rule"><LockKeyhole size={17} /><span>Reading or watching alone cannot increase transfer mastery.</span></div><Button className="button-primary button-large" onClick={() => setStage("diagnostic")}>Begin diagnostic <ArrowRight size={17} /></Button></div>}
            {stage === "diagnostic" && (() => { const question = diagnosticQuestions[questionIndex]!; return <div className="diagnostic-panel"><div className="diagnostic-progress"><span>Question {questionIndex + 1} of {diagnosticQuestions.length}</span><div>{diagnosticQuestions.map((item, index) => <i key={item.id} className={index <= questionIndex ? "filled" : ""} />)}</div></div><p className="eyebrow">HIGH-INFORMATION CHECK</p><h2>{question.prompt}</h2><div className="answer-grid">{question.choices.map((choice, index) => <button key={choice} className={selected === index ? "selected" : ""} onClick={() => setSelected(index)}><span>{String.fromCharCode(65 + index)}</span>{choice}{selected === index && <Check size={16} />}</button>)}</div><div className="diagnostic-actions"><span>Your confidence will be compared with the result.</span><Button className="button-primary" disabled={selected === null} onClick={nextQuestion}>{questionIndex === diagnosticQuestions.length - 1 ? "See diagnosis" : "Next question"}<ArrowRight size={16} /></Button></div></div>; })()}
            {stage === "result" && <div className="diagnosis-result"><div className="result-icon"><Brain size={28} /></div><p className="eyebrow">DIAGNOSIS COMPLETE</p><h2>{hasMisconception ? "You’re mixing up a field property with a charge’s energy." : "You distinguish potential from energy — now let’s test transfer."}</h2><p>{hasMisconception ? "Your pattern suggests you know the formula U = qV, but are treating V as if it changes with the charge placed at the point." : "Your answers were accurate. We’ll skip remediation and move directly to an unseen numerical."}</p><div className="diagnosis-why"><div><span>Concept</span><strong>Potential vs potential energy</strong></div><div><span>Evidence</span><strong>{hasMisconception ? "Q1/Q3 response pattern" : "3/3 correct"}</strong></div><div><span>Confidence</span><strong>{hasMisconception ? "High · 0.91" : "Moderate · 0.78"}</strong></div></div><div className="intervention"><Sparkles size={18} /><div><strong>Why this intervention?</strong><span>{hasMisconception ? "A short contrastive explanation targets the exact boundary you missed; a full chapter review would waste time." : "No reteaching needed. An unseen task is the strongest next evidence."}</span></div></div><Button className="button-lime" onClick={() => setStage(hasMisconception ? "lesson" : "checkpoint")}>{hasMisconception ? "Start targeted lesson" : "Try unseen checkpoint"}<ArrowRight size={16} /></Button></div>}
            {stage === "lesson" && <div className="micro-lesson"><div className="lesson-source"><Badge tone="green">DIRECT SUPPORT</Badge><span>Continuum Physics Seed · passage 2</span></div><p className="eyebrow">6-MINUTE CONTRAST</p><h2>Same place. Same potential. Different energy.</h2><p>Electric potential <strong>V</strong> belongs to the location in the field. It tells you the potential energy available <em>per unit charge</em>. The charge you place there does not change that location’s potential.</p><div className="equation-card"><div><InlineMath math="V = \\frac{U}{q}" /></div><span>field/location property</span><i>therefore</i><div><InlineMath math="U = qV" /></div><span>depends on the test charge</span></div><div className="thought-experiment"><span>Imagine a height above Earth</span><p>The height is like <strong>potential</strong>: it is the same for every object at that point. Gravitational energy is like <strong>potential energy</strong>: a heavier object has more of it at the same height.</p></div><div className="quick-check"><strong>Teach it back</strong><span>“At a fixed point, doubling q leaves V unchanged but doubles U.”</span><button onClick={() => showToast("Teach-back saved as guided practice; transfer mastery is unchanged.")}>I can explain this</button></div><Button className="button-primary" onClick={() => setStage("checkpoint")}>Try an unseen problem <ArrowRight size={16} /></Button></div>}
            {stage === "checkpoint" && <div className="checkpoint-panel"><Badge tone="purple">UNSEEN TRANSFER · NO HINTS</Badge><p className="eyebrow">INDEPENDENT CHECKPOINT</p><h2>A +2 nC source charge creates a field. What is the electric potential 0.75 m away?</h2><p>Use <InlineMath math="k = 9 \\times 10^9\\; N\\,m^2/C^2" />. Give your answer in volts.</p><div className="number-answer"><input value={checkpoint} onChange={(event) => setCheckpoint(event.target.value)} inputMode="decimal" aria-label="Checkpoint answer in volts" placeholder="0" /><span>V</span></div>{checkpointError && <div className="answer-error"><AlertCircle size={16} />Not quite. Recheck the exponent in <InlineMath math="V = kQ/r" />. Your mastery has not changed yet.</div>}<div className="checkpoint-rule"><ShieldCheck size={17} /><span>This item was not shown in the lesson. A correct answer can update transfer mastery.</span></div><Button className="button-lime" disabled={!checkpoint} onClick={verifyCheckpoint}>Verify answer <ArrowRight size={16} /></Button></div>}
            {stage === "complete" && <div className="checkpoint-complete"><div className="complete-burst"><Check size={32} /></div><Badge tone="green">CHECKPOINT VERIFIED</Badge><h2>24 V. You transferred the concept.</h2><p>You applied the field-property definition in an unseen numerical. Continuum has updated mastery and inserted a short spaced review before tomorrow’s assessment.</p><div className="mastery-change"><div><span>Transfer</span><strong>28%</strong></div><ArrowRight size={18} /><div className="after"><span>Transfer</span><strong>66%</strong></div></div><div className="proof-note"><FileCheck2 size={18} /><div><strong>Why mastery changed</strong><span>Correct unseen assessment · attempt_42 · 18 Jul, 9:18 AM</span></div></div><Button className="button-secondary" onClick={() => showToast("Review already scheduled for 5:20 PM with a 30-minute buffer.")}>View scheduled review <CalendarClock size={16} /></Button></div>}
          </Card>
        </section>
        <aside className="learn-side">
          <Card className="mastery-card"><div className="card-heading"><div><p className="eyebrow">MASTERY EVIDENCE</p><h3>Electric potential</h3></div><Badge tone={stage === "complete" || completed ? "green" : "orange"}>{stage === "complete" || completed ? "Practicing" : "Misconception"}</Badge></div><div className="mastery-bars">{mastery.map((item) => <div key={item.label}><div><span>{item.label}</span><strong>{item.value}%</strong></div><Progress value={item.value} label={`${item.label} ${item.value}%`} /></div>)}</div><div className="mastery-note"><Info size={15} /><p>{stage === "complete" || completed ? "Transfer rose because an unseen item was solved correctly. Retention needs later evidence." : "High exposure does not equal transfer. This is deliberately not one opaque score."}</p></div></Card>
          <Card className="sources-card"><div className="card-heading"><div><p className="eyebrow">RESOURCE BROKER</p><h3>Best next resource</h3></div><Network size={18} /></div>{learningResources.map((resource) => <div key={resource.id} className={resource.selected ? "learning-resource selected" : "learning-resource"}><div><Badge tone={resource.selected ? "green" : "neutral"}>{resource.type}</Badge><span>{resource.time}</span></div><strong>{resource.title}</strong><small>{resource.authority}</small><p>{resource.why}</p>{resource.selected && <span className="selected-rationale"><Check size={12} /> Selected for this misconception</span>}</div>)}</Card>
        </aside>
      </div>
    </div>
  );
}

export function ResearchScreen({ showToast }: { showToast: Toast }) {
  const [selectedClaimId, setSelectedClaimId] = useState(researchClaims[0]!.id);
  const [query, setQuery] = useState("");
  const [uploaded, setUploaded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedClaim = researchClaims.find((claim) => claim.id === selectedClaimId)!;
  const filteredPapers = papers.filter((paper) => `${paper.title} ${paper.authors}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="screen research-screen">
      <PageIntro eyebrow="RESEARCH WORKSPACE" title={<>Claims you can <em>defend.</em></>} description="Every conclusion stays connected to exact evidence, unresolved questions, decisions, and the next executable step." action={<><input ref={inputRef} className="sr-only" type="file" accept=".txt,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setUploaded(file.name); showToast("Source queued: duplicate check → sanitize → chunk → index."); } }} /><Button className="button-secondary" onClick={() => inputRef.current?.click()}><Upload size={16} /> Add source</Button></>} />
      {uploaded && <div className="upload-banner"><FileCheck2 size={18} /><div><strong>{uploaded}</strong><span>Sanitized and indexed locally · source version 1 · no embedded instructions trusted</span></div><Badge tone="green">Ready</Badge></div>}
      <Card className="project-strip"><div className="project-icon"><FlaskConical size={22} /></div><div className="project-title"><Badge tone="purple">{researchProject.phase}</Badge><h2>{researchProject.title}</h2><p>{researchProject.subtitle}</p></div><div className="project-goal"><span>PROJECT GOAL</span><p>{researchProject.goal}</p></div><div className="project-progress"><strong>{researchProject.progress}%</strong><span>method complete</span><Progress value={researchProject.progress} label="Project progress" /></div></Card>
      <section className="research-grid">
        <aside className="paper-library card"><div className="library-head"><div><p className="eyebrow">LIBRARY</p><h3>3 papers</h3></div><button className="icon-button" onClick={() => inputRef.current?.click()}><Plus size={17} /></button></div><div className="library-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search papers…" /></div><div className="paper-list">{filteredPapers.map((paper, index) => <button key={paper.id} className={index === 1 ? "active" : ""}><div className="paper-icon"><FileText size={17} /></div><div><strong>{paper.title}</strong><span>{paper.authors} · {paper.year}</span><Badge tone="neutral">{paper.tag}</Badge></div></button>)}</div><button className="text-link" onClick={() => showToast("Two-passage comparison opened in source-locked mode.")}><Layers3 size={14} /> Compare two passages</button></aside>
        <main className="claim-ledger card"><div className="ledger-head"><div><p className="eyebrow">CLAIM LEDGER</p><h3>2 claims · 1 open question</h3></div><Button className="button-quiet" onClick={() => showToast("Claim draft created. It remains unverified until evidence is linked.")}><Plus size={15} /> New claim</Button></div><div className="claim-list">{researchClaims.map((claim) => <button key={claim.id} className={selectedClaimId === claim.id ? "claim-row active" : "claim-row"} onClick={() => setSelectedClaimId(claim.id)}><div className="claim-state"><ShieldCheck size={17} /><span>{claim.status}</span></div><p>{claim.text}</p><div><span>{claim.evidence.length} evidence passage{claim.evidence.length > 1 ? "s" : ""}</span><ChevronRight size={16} /></div></button>)}</div><div className="open-question"><div className="question-icon">?</div><div><Badge tone="orange">UNRESOLVED</Badge><p>{researchProject.unresolved}</p><button onClick={() => showToast("A structured sensitivity-analysis task was created for this question.")}>Turn into task <ArrowRight size={14} /></button></div></div><div className="accepted-decision"><GitBranch size={18} /><div><span>ACCEPTED DECISION</span><strong>{researchProject.decision}</strong><p>{researchProject.decisionReason}</p></div><Badge tone="green">Current</Badge></div><div className="next-task"><Target size={17} /><div><span>NEXT TASK</span><strong>{researchProject.nextTask}</strong></div><Badge tone="purple">45 min</Badge></div></main>
        <aside className="evidence-viewer card"><div className="evidence-head"><div><p className="eyebrow">EXACT EVIDENCE</p><h3>Support inspection</h3></div><ShieldCheck size={19} /></div><div className="claim-preview"><span>CLAIM</span><p>{selectedClaim.text}</p><Badge tone={selectedClaim.status === "Direct support" ? "green" : "orange"}>{selectedClaim.status}</Badge></div>{selectedClaim.evidence.map((evidence) => <article key={evidence.id} className="passage-card"><header><BookOpen size={16} /><div><strong>{evidence.source}</strong><span>{evidence.passage}</span></div><button aria-label="Open passage"><ExternalLink size={14} /></button></header><blockquote>“{evidence.text}”</blockquote><footer><Badge tone="green">DIRECT PASSAGE</Badge><span>ID · {evidence.id}</span></footer></article>)}<div className="verifier-card"><Route size={17} /><div><strong>Verification route</strong><span>{selectedClaim.verifier}</span></div></div><Button className="button-secondary full" onClick={() => showToast("MCP response preview: claim, exact passages, freshness, permissions, and next-tool hint.")}><Link2 size={15} /> Preview MCP result</Button><div className="integrity-note"><ShieldCheck size={14} /><span>Continuum helps verify support; it does not present ghostwritten claims as your scholarship.</span></div></aside>
      </section>
    </div>
  );
}

export function MemoryScreen({ showToast }: { showToast: Toast }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [records, setRecords] = useState(memories);
  const filtered = records.filter((record) => (filter === "All" || record.type === filter) && `${record.title} ${record.detail}`.toLowerCase().includes(query.toLowerCase()));
  const exportMemory = () => {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "continuum-memory-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Memory exported in a portable, human-readable format.");
  };
  return (
    <div className="screen memory-screen">
      <PageIntro eyebrow="USER-OWNED MEMORY" title={<>Remember the signal,<br /><em>not every sentence.</em></>} description="Inspect, correct, obsolete, delete, or export the structured context Continuum may use." action={<Button className="button-secondary" onClick={exportMemory}><Download size={16} /> Export</Button>} />
      <Card className="memory-control"><div className="memory-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search goals, decisions, misconceptions, questions…" /></div><button className="filter-button"><Filter size={15} /> Source</button><div className="memory-consent"><span className="toggle on"><i /></span><div><strong>Memory writes on</strong><small>High-impact inferences still need confirmation</small></div></div></Card>
      <div className="memory-layout"><aside className="memory-filters">{["All", "Learning", "Decision", "Goal", "Preference", "Question"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}<span>{item === "All" ? records.length : records.filter((record) => record.type === item).length}</span></button>)}<div className="memory-safety"><LockKeyhole size={17} /><strong>Private by default</strong><p>MCP hosts receive only scoped, relevant records—not your full history.</p></div></aside><main className="memory-records"><div className="records-head"><span>{filtered.length} current records</span><small>Materialized from an append-only event ledger</small></div>{filtered.map((record) => <Card key={record.id} className="memory-record"><div className={`memory-type type-${record.type.toLowerCase()}`}><Sparkles size={16} /></div><div className="memory-copy"><div><Badge tone="neutral">{record.type}</Badge><span>{record.time}</span></div><h3>{record.title}</h3><p>{record.detail}</p><footer><span><Link2 size={12} /> {record.source}</span><span><FileCheck2 size={12} /> {record.id}</span></footer></div><div className="memory-actions"><Badge tone="green">{record.status}</Badge><button onClick={() => { setRecords((items) => items.filter((item) => item.id !== record.id)); showToast("Record marked obsolete. History is retained in the audit ledger; retrieval excludes it."); }} aria-label={`Mark ${record.title} obsolete`}><MoreHorizontal size={17} /></button></div></Card>)}{filtered.length === 0 && <div className="empty-state"><Search size={24} /><h3>No matching memories</h3><p>Try another term or broaden the type filter.</p></div>}</main><aside className="memory-used card"><p className="eyebrow">USED IN LAST RESPONSE</p><h3>Which memory shaped the plan?</h3><div><span>1</span><p><strong>Physics deadline</strong>Tomorrow · high urgency</p></div><div><span>2</span><p><strong>Concept risk</strong>Potential vs energy</p></div><div><span>3</span><p><strong>Time preference</strong>High-energy work before noon</p></div><div className="context-pack"><Layers3 size={16} /><p><strong>Compact context pack</strong>3 of 5 relevant records · unrelated research notes excluded</p></div></aside></div>
    </div>
  );
}

export function IntegrationsScreen({ showToast }: { showToast: Toast }) {
  const [connected, setConnected] = useState<Record<string, boolean>>({ Claude: true });
  return (
    <div className="screen integrations-screen">
      <PageIntro eyebrow="INTEGRATIONS" title={<>One memory. <em>Every tool.</em></>} description="Connect the assistants and academic tools you already use. Every connection is scoped, visible, and revocable." />
      <div className="connection-summary"><div><span className="connection-pulse"><i /></span><div><strong>Continuum MCP is healthy</strong><p>HTTPS endpoint ready · OAuth scopes enforced · last tool call 2 min ago</p></div></div><Badge tone="green">Operational</Badge></div>
      <section className="integration-grid">{integrations.map((integration) => { const isConnected = connected[integration.name] ?? integration.status === "Connected"; return <Card key={integration.name} className={`integration-card integration-${integration.color}`}><div className="integration-top"><div className="integration-logo">{integration.name.slice(0, 1)}</div><Badge tone={isConnected ? "green" : integration.enabled ? "neutral" : "orange"}>{isConnected ? "Connected" : integration.status}</Badge></div><h3>{integration.name}</h3><p>{integration.description}</p><div className="integration-meta"><span><ShieldCheck size={14} />{integration.scopes}</span><span><RefreshCw size={14} />{isConnected ? "2 min ago" : integration.lastSync}</span></div><div className="integration-actions">{integration.enabled ? <Button className={isConnected ? "button-quiet" : "button-secondary"} onClick={() => { setConnected((state) => ({ ...state, [integration.name]: !isConnected })); showToast(isConnected ? `${integration.name} access revoked immediately.` : `${integration.name} connection preview opened with explicit scopes.`); }}>{isConnected ? "Manage access" : "Connect"}</Button> : <Button className="button-quiet" disabled>Off for P0 demo</Button>}<button className="icon-button" onClick={() => showToast(`${integration.name}: only the listed data and scopes are shared.`)} aria-label={`View ${integration.name} details`}><ChevronRight size={17} /></button></div></Card>; })}</section>
      <Card className="scope-explainer"><LockKeyhole size={20} /><div><strong>Read and write trust are separate.</strong><p>Reading today’s plan never grants permission to change it. Schedule commits require a `schedule:commit` scope and explicit confirmation metadata.</p></div><button onClick={() => showToast("Security details: PKCE, short-lived tokens, refresh rotation, and immediate revocation.")}>How access works <ArrowRight size={14} /></button></Card>
    </div>
  );
}

export function ActivityScreen() {
  const [tab, setTab] = useState<"activity" | "routes">("activity");
  const totals = useMemo(() => ({ calls: activity.length, noToken: routes.filter((route) => route.cost.includes("No")).length, verified: routes.filter((route) => route.verification.toLowerCase().includes("pass")).length }), []);
  return (
    <div className="screen activity-screen">
      <PageIntro eyebrow="ACTIVITY & ROUTING" title={<>Trust needs a <em>paper trail.</em></>} description="Inspect every memory read, tool call, schedule change, model route, evidence check, and cost class." />
      <section className="activity-stats"><Card><Route size={19} /><div><strong>{routes.length}</strong><span>routes today</span></div></Card><Card><Zap size={19} /><div><strong>{totals.noToken}</strong><span>no-token routes</span></div></Card><Card><ShieldCheck size={19} /><div><strong>{totals.verified}</strong><span>independently verified</span></div></Card><Card><Link2 size={19} /><div><strong>{totals.calls}</strong><span>audited events</span></div></Card></section>
      <div className="activity-tabs"><button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>Activity log</button><button className={tab === "routes" ? "active" : ""} onClick={() => setTab("routes")}>Why this route?</button></div>
      {tab === "activity" ? <Card className="audit-table"><div className="audit-head"><span>Event</span><span>Route / permission</span><span>Time</span></div>{activity.map((item) => <div className="audit-row" key={item.id}><div className={`audit-icon audit-${item.icon}`}>{item.icon === "route" ? <Route size={16} /> : item.icon === "calendar" ? <CalendarClock size={16} /> : item.icon === "shield" ? <ShieldCheck size={16} /> : item.icon === "link" ? <Link2 size={16} /> : <Sparkles size={16} />}</div><div><strong>{item.title}</strong><span>{item.detail}</span></div><Badge tone="green">Success</Badge><time>{item.time}</time><button aria-label="Inspect event"><ChevronRight size={16} /></button></div>)}</Card> : <div className="route-grid">{routes.map((route) => <Card key={route.task} className={`route-card route-${route.color}`}><header><div className="route-symbol">{route.route === "Deterministic" ? <GitBranch size={19} /> : route.route === "Retrieval" ? <BookOpen size={19} /> : <Sparkles size={19} />}</div><div><span>{route.task}</span><h3>{route.route}</h3></div><Badge tone={route.cost.includes("No") ? "green" : "neutral"}>{route.cost}</Badge></header><div className="route-model"><span>SELECTED TOOL / MODEL</span><strong>{route.model}</strong></div><p>{route.reason}</p><footer><ShieldCheck size={14} /><span>{route.verification}</span></footer></Card>)}</div>}
      <Card className="budget-bar"><div><p className="eyebrow">DAILY AI BUDGET</p><strong>8,420 <span>/ 50,000 tokens</span></strong></div><Progress value={17} label="Daily token usage" /><span>83% remaining · deterministic and retrieval routes do not consume generation tokens</span></Card>
    </div>
  );
}
