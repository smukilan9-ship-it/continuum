/**
 * The component kit (redesign.md §15.9). One file per concern, one barrel so
 * `@/components/ui` keeps resolving for every existing caller — this replaced
 * the single 283-line `components/ui.tsx` without touching an import site.
 *
 * Rules that belong to the kit, not to its callers:
 *   1. Extend an existing component with a variant before adding a new one.
 *   2. Any pattern used twice becomes a component here.
 *   3. No literal colours — compose tokens only.
 */

export { cn } from "./utils";

export {
  Badge,
  Button,
  Card,
  IconButton,
  LoadingButton,
  Progress,
  ProgressBar,
  StatusChip,
  Tooltip,
  type ButtonVariant,
  type ControlSize,
  type StatusTone,
} from "./primitives";

export { Checkbox, Field, Input, Radio, Select, Switch, Textarea } from "./form";

export {
  ConfirmationDialog,
  Drawer,
  Menu,
  Modal,
  Popover,
  SidePanel,
  type DialogSize,
  type MenuItem,
} from "./overlay";

export {
  Banner,
  DataRegion,
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
  SuccessState,
  ToastProvider,
  useToast,
  type BannerTone,
  type RegionStatus,
  type Toast,
} from "./feedback";

export { Breadcrumb, SegmentedNavigation, Tabs, type Crumb } from "./navigation";

export { List, Row, Table, type Column } from "./data";

export { CitationChip, ContextChip, type ContextKind } from "./chips";
