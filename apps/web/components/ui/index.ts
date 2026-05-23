// Barrel — single import surface for the Phase 5 design system.
// Existing Button / Input / Toast are re-exported so callers can adopt
// the system without touching their current imports (backward compatible).

export { Button } from './Button';
export { Input } from './Input';
export { Skeleton, SkeletonCard, SkeletonText } from './Skeleton';
export { Spinner, Card, Badge, EmptyState } from './Primitives';
export { Tabs, TabPanel, type TabItem } from './Tabs';
export { Modal, Drawer } from './Overlay';
export { ErrorBoundary } from './ErrorBoundary';
export { UploadInput, type UploadedFile } from './UploadInput';
export { AssetPicker, type PickableAsset } from './AssetPicker';
export { StatCard, CreditBadge, DataTable, type Column } from './Dashboard';
export {
  Reveal,
  StaggerList,
  StaggerItem,
  fadeIn,
  slideUp,
  scaleIn,
  staggerContainer,
} from './motion';
