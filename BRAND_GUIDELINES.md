# ThoughtGuards Brand Guidelines

**Version 1.0** | Last Updated: January 2025

---

## 📋 Table of Contents

1. [Brand Overview](#brand-overview)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [UI Components](#ui-components)
5. [Iconography](#iconography)
6. [Layout & Spacing](#layout--spacing)
7. [Data Visualization](#data-visualization)
8. [Voice & Tone](#voice--tone)
9. [Logo Usage](#logo-usage)
10. [Examples](#examples)

---

## Brand Overview

### Mission
ThoughtGuards is an AI safety research platform that monitors and detects manipulation in AI chain-of-thought reasoning. We provide researchers and organizations with tools to analyze, categorize, and understand deceptive patterns in AI behavior.

### Brand Personality
- **Vigilant**: Always watching, always protecting
- **Technical**: Precise, data-driven, research-oriented
- **Professional**: Serious subject matter, trustworthy presentation
- **Modern**: Cutting-edge technology with contemporary design
- **Accessible**: Complex topics made understandable

### Visual Identity Keywords
Dark, Cybersecurity-focused, Analytical, Clean, Technical, Trustworthy

---

## Color System

### Primary Palette

#### Background Colors
```css
/* Base Backgrounds */
--bg-primary: #020617      /* slate-950 - Main background */
--bg-secondary: #0f172a    /* slate-900 - Secondary background */
--bg-tertiary: #1e293b     /* slate-800 - Elevated surfaces */

/* Gradient Background (Landing page) */
background: radial-gradient(ellipse at top,
  rgb(15, 23, 42),   /* slate-900 */
  rgb(2, 6, 23),     /* slate-950 */
  rgb(0, 0, 0)       /* black */
)
```

#### Accent Colors
```css
/* Primary Accent - Cyan (Trust, Technology, Safety) */
--accent-cyan-50: #ecfeff
--accent-cyan-400: #22d3ee   /* Primary interactive elements */
--accent-cyan-500: #06b6d4   /* Buttons, links, highlights */

/* Backgrounds with Accent */
--cyan-bg-10: rgba(6, 182, 212, 0.1)   /* bg-cyan-500/10 */
--cyan-bg-20: rgba(6, 182, 212, 0.2)   /* bg-cyan-500/20 */
--cyan-bg-30: rgba(6, 182, 212, 0.3)   /* bg-cyan-500/30 */
--cyan-border: rgba(6, 182, 212, 0.5)  /* border-cyan-500/50 */
```

#### Text Colors
```css
--text-primary: #f1f5f9     /* slate-100 - Headers, important text */
--text-secondary: #e2e8f0   /* slate-200 - Body text */
--text-tertiary: #cbd5e1    /* slate-300 - Supporting text */
--text-muted: #94a3b8       /* slate-400 - Less important text */
--text-disabled: #64748b    /* slate-500 - Disabled states */
--text-subtle: #475569      /* slate-600 - Very subtle text */
```

### Semantic Colors

#### Detection Categories (Taxonomy HOW Axis)
Each category represents a manipulation mechanism with distinct visual identity:

```css
/* H1 - Fabricated (Misrepresentation) */
--fabricated-text: #f87171      /* red-400 */
--fabricated-border: rgba(239, 68, 68, 0.5)   /* red-500/50 */
--fabricated-bg: rgba(239, 68, 68, 0.1)       /* red-500/10 */
Icon: VenetianMask

/* H2 - Sandbagged (Capability Suppression) */
--sandbagged-text: #c084fc      /* purple-400 */
--sandbagged-border: rgba(168, 85, 247, 0.5)  /* purple-500/50 */
--sandbagged-bg: rgba(168, 85, 247, 0.1)      /* purple-500/10 */
Icon: Bomb

/* H3 - Context-Switched (Oversight-Conditional) */
--context-switched-text: #94a3b8    /* slate-400 */
--context-switched-border: rgba(100, 116, 139, 0.5)  /* slate-500/50 */
--context-switched-bg: rgba(100, 116, 139, 0.1)      /* slate-500/10 */
Icon: CloudFog

/* H4 - Pressured (Influence Tactics) */
--pressured-text: #f9a8d4      /* pink-400 */
--pressured-border: rgba(236, 72, 153, 0.5)   /* pink-500/50 */
--pressured-bg: rgba(236, 72, 153, 0.1)       /* pink-500/10 */
Icon: Tent

/* H5 - Hid (Omission/Obfuscation) */
--hid-text: #60a5fa            /* blue-400 */
--hid-border: rgba(59, 130, 246, 0.5)    /* blue-500/50 */
--hid-bg: rgba(59, 130, 246, 0.1)        /* blue-500/10 */
Icon: Target

/* H6 - Overclaimed (Miscalibration) */
--overclaimed-text: #fb923c     /* orange-400 */
--overclaimed-border: rgba(249, 115, 22, 0.5)  /* orange-500/50 */
--overclaimed-bg: rgba(249, 115, 22, 0.1)      /* orange-500/10 */
Icon: Gift
```

#### Status Colors
```css
/* Success / Clean */
--success-text: #4ade80       /* green-400 */
--success-border: rgba(34, 197, 94, 0.5)   /* green-500/50 */
--success-bg: rgba(34, 197, 94, 0.1)       /* green-500/10 */

/* Warning / Review */
--warning-text: #facc15       /* yellow-400 */
--warning-border: rgba(234, 179, 8, 0.5)   /* yellow-500/50 */
--warning-bg: rgba(234, 179, 8, 0.1)       /* yellow-500/10 */

/* Error / Flagged */
--error-text: #f87171         /* red-400 */
--error-border: rgba(239, 68, 68, 0.5)     /* red-500/50 */
--error-bg: rgba(239, 68, 68, 0.1)         /* red-500/10 */

/* Info */
--info-text: #22d3ee          /* cyan-400 */
--info-border: rgba(6, 182, 212, 0.5)      /* cyan-500/50 */
--info-bg: rgba(6, 182, 212, 0.1)          /* cyan-500/10 */
```

### Risk Score Color Scale
```css
/* Low Risk (0-39) */
--risk-low-text: #4ade80      /* green-400 */
--risk-low-bg: rgba(34, 197, 94, 0.1)
--risk-low-border: rgba(34, 197, 94, 0.5)

/* Medium Risk (40-69) */
--risk-medium-text: #fb923c   /* orange-400 */
--risk-medium-bg: rgba(249, 115, 22, 0.1)
--risk-medium-border: rgba(249, 115, 22, 0.5)

/* High Risk (70-100) */
--risk-high-text: #f87171     /* red-400 */
--risk-high-bg: rgba(239, 68, 68, 0.1)
--risk-high-border: rgba(239, 68, 68, 0.5)
```

### Border System
```css
/* Standard Borders */
--border-primary: #1e293b     /* slate-800 - Default borders */
--border-secondary: #334155   /* slate-700 - Lighter borders */
--border-tertiary: #475569    /* slate-600 - Hover states */

/* Semantic Borders */
All semantic colors use 50% opacity (e.g., border-cyan-500/50)
```

---

## Typography

### Font Family
```css
/* System Font Stack (inherited from Tailwind defaults) */
font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
             "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

### Font Sizes & Hierarchy

```css
/* Headers */
--text-4xl: 2.25rem (36px)    /* Main page titles */
--text-xl: 1.25rem (20px)     /* Section headers */
--text-lg: 1.125rem (18px)    /* Subsection headers */

/* Body Text */
--text-base: 1rem (16px)      /* Standard body text */
--text-sm: 0.875rem (14px)    /* Supporting text, labels */
--text-xs: 0.75rem (12px)     /* Metadata, timestamps */

/* Font Weights */
--font-normal: 400            /* Body text */
--font-medium: 500            /* Labels, navigation */
--font-semibold: 600          /* Subheadings */
--font-bold: 700              /* Main headings, emphasis */
```

### Usage Examples
```tsx
/* Page Title */
<h1 className="text-4xl font-bold text-slate-100 mb-4 tracking-tight">
  Thought Guards
</h1>

/* Section Header */
<h2 className="text-xl font-bold text-slate-100">
  Detection Queue
</h2>

/* Subsection Header */
<h3 className="text-lg font-semibold text-slate-100">
  Recent Detections
</h3>

/* Body Text */
<p className="text-sm text-slate-300">
  Monitor and detect manipulation patterns in AI conversations.
</p>

/* Supporting Text */
<span className="text-xs text-slate-400">
  Last updated: 2 minutes ago
</span>

/* Metadata / Timestamps */
<div className="text-xs text-slate-500">
  10:42 AM • 5 messages
</div>
```

---

## UI Components

### Glass Panel Effect
```css
.glass-panel {
  background: rgba(15, 23, 42, 0.7);      /* slate-900 at 70% opacity */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(148, 163, 184, 0.1);  /* Very subtle border */
}
```

### Buttons

#### Primary Action Button
```tsx
<button className="flex items-center gap-2 px-4 py-2
  bg-cyan-500/20 text-cyan-400
  border border-cyan-500/50
  rounded-lg
  hover:bg-cyan-500/30
  transition-colors">
  Go to Dashboard →
</button>
```

#### Secondary Button
```tsx
<button className="px-3 py-2
  bg-slate-800 text-slate-300
  border border-slate-700
  rounded-lg
  hover:bg-slate-700
  hover:text-slate-200">
  Cancel
</button>
```

#### Danger/Delete Button
```tsx
<button className="px-4 py-2
  bg-red-500/20 text-red-400
  border border-red-500/50
  rounded-lg
  hover:bg-red-500/30">
  Delete
</button>
```

#### Success/Confirm Button
```tsx
<button className="px-4 py-2
  bg-green-500/20 text-green-400
  border border-green-500/50
  rounded-lg
  hover:bg-green-500/30">
  Run Selected
</button>
```

#### Disabled State
```tsx
<button disabled className="px-4 py-2
  bg-slate-800 text-slate-400
  border border-slate-700
  opacity-50 cursor-not-allowed">
  Processing...
</button>
```

### Cards & Containers

#### Standard Card
```tsx
<div className="bg-slate-900/30
  border border-slate-800
  rounded-lg
  p-4
  hover:border-slate-700
  transition-all">
  {/* Content */}
</div>
```

#### Elevated Card (Stats, Important Info)
```tsx
<div className="bg-slate-900/50
  border border-slate-800
  rounded-lg
  p-3">
  {/* Stats content */}
</div>
```

#### Interactive Card (Clickable)
```tsx
<div className="bg-slate-900/30
  border border-slate-800
  rounded-lg
  p-4
  hover:border-slate-700
  cursor-pointer
  transition-all">
  {/* Clickable content */}
</div>
```

#### Active/Selected Card
```tsx
<div className="bg-slate-900/30
  border border-cyan-500/50
  ring-1 ring-cyan-500/20
  rounded-lg
  p-4">
  {/* Active content */}
</div>
```

### Badges & Tags

#### Status Badge - Pending
```tsx
<span className="px-2 py-0.5
  bg-slate-700/50 text-slate-400
  border border-slate-700
  rounded text-xs font-medium">
  pending
</span>
```

#### Status Badge - Running
```tsx
<span className="px-2 py-0.5
  bg-cyan-500/20 text-cyan-400
  border border-cyan-500/50
  rounded text-xs font-medium">
  running
</span>
```

#### Status Badge - Completed
```tsx
<span className="px-2 py-0.5
  bg-green-500/20 text-green-400
  border border-green-500/50
  rounded text-xs font-medium">
  completed
</span>
```

#### Status Badge - Failed
```tsx
<span className="px-2 py-0.5
  bg-red-500/20 text-red-400
  border border-red-500/50
  rounded text-xs font-medium">
  failed
</span>
```

#### Risk Score Badge
```tsx
/* Low Risk */
<span className="px-2 py-0.5
  bg-green-500/10 text-green-400
  border border-green-500/50
  rounded text-xs font-bold">
  15%
</span>

/* Medium Risk */
<span className="px-2 py-0.5
  bg-orange-500/10 text-orange-400
  border border-orange-500/50
  rounded text-xs font-bold">
  55%
</span>

/* High Risk */
<span className="px-2 py-0.5
  bg-red-500/10 text-red-400
  border border-red-500/50
  rounded text-xs font-bold">
  92%
</span>
```

### Form Elements

#### Input Field
```tsx
<input
  type="text"
  placeholder="Search..."
  className="w-full
    bg-slate-900/50
    border border-slate-800
    rounded-lg
    px-4 py-2
    text-sm text-slate-200
    placeholder:text-slate-500
    focus:outline-none
    focus:ring-2
    focus:ring-cyan-500/50"
/>
```

#### Select Dropdown
```tsx
<select className="bg-slate-900/50
  border border-slate-800
  rounded-lg
  px-3 py-2
  text-sm text-slate-200
  focus:outline-none
  focus:ring-2
  focus:ring-cyan-500/50">
  <option>All Categories</option>
</select>
```

#### Search Input with Icon
```tsx
<div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
  <input
    type="text"
    placeholder="Search test cases..."
    className="w-full bg-slate-900/50 border border-slate-800
      rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200
      focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
  />
</div>
```

### Modals

#### Modal Overlay
```tsx
<div className="fixed inset-0
  bg-black/50
  backdrop-blur-sm
  flex items-center justify-center
  z-50 p-4">
  {/* Modal content */}
</div>
```

#### Modal Container
```tsx
<div className="bg-slate-900
  border border-slate-800
  rounded-xl
  max-w-3xl w-full
  max-h-[90vh]
  overflow-y-auto">
  {/* Modal body */}
</div>
```

#### Modal Header
```tsx
<div className="sticky top-0
  bg-slate-900
  border-b border-slate-800
  p-6
  flex items-center justify-between">
  <h3 className="text-xl font-bold text-slate-100">Modal Title</h3>
  <button className="p-2
    hover:bg-slate-800
    rounded-lg
    text-slate-400
    hover:text-slate-200">
    <X size={20} />
  </button>
</div>
```

### Loading States

#### Spinner with Text
```tsx
<div className="flex items-center gap-3">
  <Loader2 className="animate-spin text-cyan-500" size={16} />
  <span className="text-slate-400">Loading...</span>
</div>
```

#### Full Page Loader
```tsx
<div className="flex items-center justify-center h-64">
  <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
  <span className="ml-3 text-slate-400">Loading dashboard statistics...</span>
</div>
```

---

## Iconography

### Icon Library
**Source**: [Lucide React](https://lucide.dev/) v0.562.0

### Icon Sizes
```tsx
/* Standard Sizes */
size={14}  // Small inline icons
size={16}  // Standard button/label icons
size={18}  // Section header icons
size={20}  // Modal close buttons
size={24}  // Page header icons
size={32}  // Large loading spinners
```

### Key Icons & Usage

#### Brand Icons
- `Shield` - Security, protection, main logo context
- `Radio` - Monitoring, active detection
- `Activity` - System activity, live monitoring

#### Navigation Icons
- `LayoutDashboard` - Dashboard view
- `FileText` - Audit/detection queue
- `BarChart3` - Statistics and reports
- `Settings` - Settings panel

#### Detection Category Icons (HOW Axis)
- `AlertCircle` - Fabricated (H1) - Misrepresentation/false information
- `TrendingDown` - Sandbagged (H2) - Capability suppression/underperformance
- `Glasses` - Context-Switched (H3) - Oversight awareness/eval-conditional behavior
- `Megaphone` - Pressured (H4) - Influence tactics/persuasion
- `Lock` - Hid (H5) - Omission/concealment of information
- `Zap` - Overclaimed (H6) - Over-confidence/exaggerated claims

#### Action Icons
- `Play` - Run audit/action
- `Pause` - Pause execution
- `Eye` - View details
- `Search` - Search functionality
- `Filter` - Filtering options
- `X` - Close/dismiss
- `Plus` - Add new item
- `CheckCircle` - Success/complete
- `AlertTriangle` - Warning/error
- `Info` - Information tooltip

#### Status Icons
- `Loader2` - Loading (animated with `animate-spin`)
- `CheckSquare` - Selected checkbox
- `Square` - Unselected checkbox
- `ChevronLeft` / `ChevronRight` - Pagination

### Icon Color Patterns
```tsx
/* Primary Actions */
<Play className="text-cyan-400" size={16} />

/* Success States */
<CheckCircle className="text-green-400" size={18} />

/* Warnings */
<AlertTriangle className="text-orange-400" size={18} />

/* Errors */
<AlertTriangle className="text-red-400" size={18} />

/* Neutral/Muted */
<FileText className="text-slate-400" size={16} />

/* Category-Specific Examples */
<AlertCircle className="text-red-400" size={16} />     {/* Fabricated */}
<TrendingDown className="text-purple-400" size={16} /> {/* Sandbagged */}
<Glasses className="text-slate-400" size={16} />       {/* Context-Switched */}
<Megaphone className="text-pink-400" size={16} />      {/* Pressured */}
<Lock className="text-blue-400" size={16} />           {/* Hid */}
<Zap className="text-orange-400" size={16} />          {/* Overclaimed */}
```

---

## Layout & Spacing

### Border Radius
```css
--radius-sm: 0.375rem    /* 6px - Small badges */
--radius-md: 0.5rem      /* 8px - Standard buttons, inputs */
--radius-lg: 0.75rem     /* 12px - Cards, panels */
--radius-xl: 1rem        /* 16px - Modals, major containers */
--radius-2xl: 1.25rem    /* 20px - Logo, special elements */
```

### Spacing Scale (Tailwind)
```css
/* Padding/Margin Scale */
p-1   = 0.25rem (4px)
p-2   = 0.5rem (8px)
p-3   = 0.75rem (12px)
p-4   = 1rem (16px)
p-6   = 1.5rem (24px)
p-8   = 2rem (32px)

/* Common Patterns */
Card padding: p-4 (16px)
Modal padding: p-6 (24px)
Section spacing: space-y-6 (24px between children)
List item spacing: space-y-2 (8px between items)
Button padding: px-4 py-2 (16px horizontal, 8px vertical)
```

### Grid Layouts
```tsx
/* Stats Dashboard - 5 columns */
<div className="grid grid-cols-5 gap-4">
  {/* Stat cards */}
</div>

/* Responsive Grid */
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* Responsive cards */}
</div>
```

### Max Widths
```css
--max-w-2xl: 42rem (672px)    /* Landing page content */
--max-w-3xl: 48rem (768px)    /* Detail modals */
--max-w-6xl: 72rem (1152px)   /* Wide modals/lists */
```

### Z-Index Layers
```css
--z-10: Tooltips, dropdowns
--z-50: Modals, overlays
```

---

## Data Visualization

### Chart Colors (Recharts)
```tsx
/* Primary chart colors should use brand palette */
<Bar dataKey="detections" fill="#22d3ee" />  {/* cyan-400 */}
<Line stroke="#06b6d4" />                     {/* cyan-500 */}

/* Multi-series charts - use detection category colors */
Series 1: #f87171   (red-400 - Fabricated)
Series 2: #c084fc   (purple-400 - Sandbagged)
Series 3: #60a5fa   (blue-400 - Hid)
Series 4: #fb923c   (orange-400 - Overclaimed)
Series 5: #f9a8d4   (pink-400 - Pressured)
Series 6: #94a3b8   (slate-400 - Context-Switched)
```

### Risk Score Visualization
- Use color-coded gradients from green → orange → red
- Always show numerical percentage alongside visual indicators
- Consider color accessibility (avoid relying solely on color)

---

## Voice & Tone

### Writing Principles
1. **Precise**: Use specific, technical language. Avoid vague terms.
2. **Objective**: Present data and findings neutrally.
3. **Clear**: Explain complex concepts simply without oversimplifying.
4. **Professional**: Maintain serious, research-oriented tone.
5. **Action-oriented**: Use active voice and clear CTAs.

### Terminology Standards

#### Preferred Terms
- "Audit" (not "scan" or "check")
- "Detection" (not "finding" or "hit")
- "Conversation" (not "chat" or "session")
- "Risk score" (not "danger level" or "threat score")
- "Manipulation pattern" (not "bad behavior" or "problem")
- "Chain-of-thought" or "CoT" (not "reasoning" alone)

#### Status Messages
```tsx
✅ "Loading conversations from database..."
✅ "Running audit on conversation..."
✅ "Audit completed successfully"
✅ "No conversations found matching your filters"

❌ "Loading stuff..."
❌ "Working on it..."
❌ "Done!"
❌ "Nothing here"
```

### UI Copy Examples

#### Headers
```tsx
✅ "Detection Queue"
✅ "Recent Detections"
✅ "Audit Configuration"

❌ "Stuff to Check"
❌ "Latest Finds"
❌ "Settings"
```

#### Empty States
```tsx
✅ "No conversations found in database. Run a sync to load conversations."
✅ "No test cases found matching your filters."

❌ "Nothing here yet!"
❌ "Empty."
```

#### Action Buttons
```tsx
✅ "Run Audit"
✅ "View Details"
✅ "Create Report"

❌ "Go"
❌ "See More"
❌ "Make Report"
```

---

## Logo Usage

### Primary Logo
- **File**: `thought-guards-logo.png`
- **Dimensions**: 96x96px (w-24 h-24)
- **Format**: PNG with rounded corners (rounded-2xl = 20px)
- **Background**: Should work on dark backgrounds

### Favicon
- **Theme Color**: `#0f172a` (slate-900)
- **Tile Color**: `#0f172a` (slate-900)
- Multiple sizes available in `/favicons.ico/`

### Logo Spacing
- Minimum clear space: 32px on all sides
- Do not place on busy backgrounds
- Maintain aspect ratio (1:1 square)

---

## Examples

### Complete Page Header
```tsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
      <FileText size={18} className="text-cyan-500" />
      Detection Queue
    </h2>
    <p className="text-sm text-slate-400 mt-1">
      500 total • 350 completed • 150 pending
    </p>
  </div>

  <button className="flex items-center gap-2 px-4 py-2
    bg-cyan-500/20 text-cyan-400
    border border-cyan-500/50
    rounded-lg hover:bg-cyan-500/30">
    <Play size={16} />
    Start Auto-Run
  </button>
</div>
```

### Stats Grid
```tsx
<div className="grid grid-cols-5 gap-4">
  <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
    <div className="text-xs text-slate-500 mb-1">Total</div>
    <div className="text-lg font-bold text-slate-200">500</div>
  </div>
  <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
    <div className="text-xs text-slate-500 mb-1">Pending</div>
    <div className="text-lg font-bold text-slate-400">150</div>
  </div>
  <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
    <div className="text-xs text-slate-500 mb-1">Running</div>
    <div className="text-lg font-bold text-cyan-400">2</div>
  </div>
  <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
    <div className="text-xs text-slate-500 mb-1">Completed</div>
    <div className="text-lg font-bold text-green-400">348</div>
  </div>
  <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
    <div className="text-xs text-slate-500 mb-1">Failed</div>
    <div className="text-lg font-bold text-red-400">0</div>
  </div>
</div>
```

### Detection Category Badge with Icon
```tsx
import { AlertCircle } from 'lucide-react';

<div className="flex items-center gap-2 px-3 py-1.5
  bg-red-500/10 text-red-400
  border border-red-500/50
  rounded-lg">
  <AlertCircle size={14} />
  <span className="text-xs font-medium">Fabricated</span>
</div>
```

### Complete Card Component
```tsx
<div className="bg-slate-900/30 border border-slate-800 rounded-lg p-4
  hover:border-slate-700 transition-all">

  <div className="flex items-center gap-3 mb-2">
    <h3 className="font-semibold text-slate-200">
      E-commerce Return Manipulation
    </h3>
    <span className="px-2 py-0.5 bg-green-500/20 text-green-400
      border border-green-500/50 rounded text-xs font-medium">
      completed
    </span>
    <span className="px-2 py-0.5 bg-red-500/10 text-red-400
      border border-red-500/50 rounded text-xs font-bold">
      92%
    </span>
  </div>

  <p className="text-xs text-slate-400 mb-2">
    Deception Planning • Multi-turn conversation
  </p>

  <div className="text-xs text-slate-500">
    <div className="truncate">
      <span className="text-slate-600">user:</span>
      <span className="text-slate-400"> I want to return this coffee maker...</span>
    </div>
  </div>

  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800">
    <button className="flex-1 flex items-center justify-center gap-2
      px-3 py-2 bg-cyan-500/20 text-cyan-400
      border border-cyan-500/50 rounded-lg hover:bg-cyan-500/30">
      <Eye size={14} />
      View Details
    </button>
  </div>
</div>
```

---

## Scrollbar Styling

### Custom Dark Scrollbar
```css
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #0f172a;  /* slate-900 */
}

::-webkit-scrollbar-thumb {
  background: #334155;  /* slate-700 */
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #475569;  /* slate-600 */
}
```

---

## Accessibility Guidelines

### Color Contrast
- All text meets WCAG AA standards (4.5:1 for normal text, 3:1 for large text)
- Primary text on dark background: slate-100 (#f1f5f9) on slate-950 (#020617)
- Interactive elements use cyan-400 (#22d3ee) for sufficient contrast

### Interactive Elements
- All buttons have clear hover states
- Focus states use `focus:ring-2 focus:ring-cyan-500/50`
- Disabled states clearly indicated with reduced opacity
- Loading states provide visual feedback

### Icons
- Icons are always accompanied by text or aria-label
- Icon size minimum 14px for visibility
- Use semantic meaning, not just decoration

---

## Implementation Checklist

When building new components, ensure:

- ✅ Uses slate-950/900/800 background hierarchy
- ✅ Text uses slate-100/200/300/400 color scale
- ✅ Borders use slate-800/700/600
- ✅ Interactive elements use cyan-500/400 accent
- ✅ Rounded corners (rounded-lg for cards, rounded-xl for modals)
- ✅ Proper hover states on interactive elements
- ✅ Loading states with Loader2 icon and appropriate messaging
- ✅ Status colors match semantic meaning (green=success, red=error, etc.)
- ✅ Detection categories use correct color/icon combinations
- ✅ Typography hierarchy maintained (text-lg/xl/4xl for headers)
- ✅ Proper spacing (p-4 for cards, p-6 for modals)
- ✅ Icons from Lucide React with consistent sizing

---

## Version History

**v1.0** (January 2025)
- Initial brand guidelines documentation
- Color system codification
- Component library documentation
- Typography standards
- Icon usage guidelines

---

## Contact & Questions

For questions about brand usage or to suggest updates to these guidelines, please refer to the project maintainers or create an issue in the GitHub repository.

---

**© 2025 ThoughtGuards** | MIT License
