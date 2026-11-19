/* ============================================================
   design-sync entry — NOT part of the app.

   Compass is an app (default exports, no library build), but the
   design-sync converter needs one module with NAMED exports to build
   the window.Compass bundle for claude.ai/design. This file is that
   module: it re-exports the components we chose to sync. Adding a
   component to the design system = add a line here + a line in
   .design-sync/config.json's componentSrcMap.
   ============================================================ */

export { default as CSlider } from "../src/dashboard/CSlider";
export { default as AutoTextarea } from "../src/dashboard/AutoTextarea";
export { default as TimeCard } from "../src/dashboard/TimeCard";
export { default as TimelineCard } from "../src/dashboard/TimelineCard";
export { default as LearningCard } from "../src/dashboard/LearningCard";
export { default as Sidebar } from "../src/dashboard/Sidebar";
export { default as TaskPanel } from "../src/dashboard/TaskPanel";
export { default as ThoughtLog } from "../src/dashboard/ThoughtLog";
export { default as Interview } from "../src/interview/Interview";
export { default as LoginScreen } from "../src/auth/LoginScreen";
export { default as SetNewPassword } from "../src/auth/SetNewPassword";
export { default as PasswordChecklist } from "../src/auth/PasswordChecklist";
