# Team Hub — User Operation Guideline

## Table of Contents

1. [Dashboard](#1-dashboard)
2. [Creating Flows](#2-creating-flows)
3. [Board View (Kanban)](#3-board-view-kanban)
4. [List View](#4-list-view)
5. [Calendar View](#5-calendar-view)
6. [Item Cards (3-Section Layout)](#6-item-cards)
7. [Item Inspector](#7-item-inspector)
8. [Lead Integration](#8-lead-integration)
9. [Board Templates](#9-board-templates)
10. [Team Members & Roles](#10-team-members--roles)
11. [Context Menus](#11-context-menus)
12. [Activity Feed](#12-activity-feed)
13. [Permissions Matrix](#13-permissions-matrix)
14. [Keyboard Shortcuts](#14-keyboard-shortcuts)

---

## 1. Dashboard

The Team Hub dashboard is the entry point for all flows.

### Stats Bar
Six stat cards display across the top:
- **Flows** — total flow count
- **Lanes** — total lanes across all flows
- **Items** — total active items
- **High Priority** — items marked high priority
- **Overdue** — items past their due date
- **Done Today** — items archived today

### Flow Cards
Flows are displayed as cards in a responsive grid (1-2 columns).

Each card shows:
- Color gradient banner
- Flow name (click to open)
- "Shared" badge if you are not the creator
- Mini stats: lane count, item count, high priority, overdue
- Lane preview bars (up to 5)
- "Updated X ago" timestamp

**Flow card menu** (hover, owner only):
- Rename — inline text edit
- Delete — confirmation modal

### Search & Sort
- **Search bar** — filter flows by name in real-time
- **Sort modes** — Recent (default), A-Z, Items (by count)

### Activity Sidebar
Right column (1/3 width on desktop) shows recent activity across all flows:
- Action descriptions with actor name and timestamp
- Formats: "Xm ago", "Xh ago", "Xd ago"

---

## 2. Creating Flows

Click **"New Flow"** to open the Template Selector.

### Template Selector Options

| Option | Description |
|--------|-------------|
| **Blank Flow** | Empty flow — add your own lanes manually |
| **Basic Workflow** | Lanes: To Do, Progress, Done. Has **Lead Sync** enabled |
| **Sales Sprint** | Lanes: Prospecting, Contacted, Negotiation, Closed |
| **Project Delivery** | Lanes: Planning, Active, Review, Complete |
| **Your Templates** | Flows you previously saved as templates |

### Flow Name
Enter a custom name before selecting a template. Defaults to the template name if left empty, or "Untitled Flow" for blank flows.

### Lead Sync Badge
Templates with the **Lead Sync** badge automatically sync linked lead statuses when items move between lanes (see [Lead Integration](#8-lead-integration)).

---

## 3. Board View (Kanban)

The default view. Lanes are displayed as vertical columns that scroll horizontally.

### Lanes
- Each lane has a colored accent border, name (uppercase), and item count badge
- **Add Lane** button appears at the end of the lane row
- Lanes are drag-reorderable by their header

### Lane Operations
- **Add Item** — click the "+" button in the lane header
- **Rename Lane** — via the lane header menu or right-click context menu
- **Delete Lane** — via the lane header menu or right-click context menu
- Right-click on empty lane area to open lane context menu

### Drag & Drop
- **Drag items** within a lane to reorder, or between lanes to move
- **Drag lanes** horizontally to reorder
- A ghost overlay shows a rotated card preview while dragging
- Moving an item between lanes triggers lead pipeline sync if applicable

### Header Controls
| Control | Description |
|---------|-------------|
| **Back** | Return to dashboard |
| **Flow name** | Click to edit (owner/admin) |
| **Member avatars** | Click to open team panel |
| **Share** | Open team management panel |
| **Board / List / Calendar** | Switch view mode |
| **Filter** | Filter by priority (High/Medium/Low) or due date (Overdue/This Week) |
| **Sort** | Sort by Default, Priority, Due Date, or Recent |
| **Activity** | Toggle activity sidebar |
| **Save Template** | Save current flow as a reusable template (owner/admin) |
| **Delete** | Delete flow (owner only) |

---

## 4. List View

A table-based view of all items across all lanes.

### Columns
| Column | Content |
|--------|---------|
| Title | Item title (click row to open inspector) |
| Lane | Lane name as a pill badge |
| Priority | Colored badge (HIGH / MED / LOW) or "—" |
| Due Date | Formatted date with clock icon, red if overdue |
| Labels | Tag pills (#tagname format) |
| Members | Avatar stack (max 3 + overflow count) |
| Comments | Comment count with icon |

### Interactions
- **Click row** — opens Item Inspector
- **Right-click row** — opens context menu (same options as board view)
- Sticky header on scroll
- Respects the same filters and sort applied in the header

---

## 5. Calendar View

A month grid view showing items placed on their due dates.

### Navigation
- **< >** arrows to navigate months
- **Today** button to jump to the current month
- Month and year displayed in the center

### Calendar Grid
- 7-column layout (Sun–Sat)
- Items appear as small pills in their due date cell
- Each pill shows a priority color dot + truncated title
- Maximum 3 items per cell, with "+N more" overflow
- Today's cell is highlighted with a blue ring
- Days outside the current month are dimmed

### Unscheduled Items
Items without a due date are counted in the **"N unscheduled"** indicator in the top bar.

### Interactions
- **Click pill** — opens Item Inspector
- **Right-click pill** — opens context menu

---

## 6. Item Cards

Cards use a 3-section layout:

### Section A — Header
- **Priority accent bar** — colored left edge (red = high, blue = medium, gray = low)
- **Priority badge** — uppercase label (HIGH, MED, LOW)
- **Title** — 13px semibold text
- **Tags** — up to 2 shown right-aligned, with "+N" overflow
- **Grip handle** — visible on hover for drag

### Section B — Content
Shown when the item has a description, linked lead, or due date:
- **Description preview** — 2-line clamp, gray text
- **Lead badge** — indigo pill with user icon + lead name (if linked)
- **Due date chip** — "MMM D" format, red if overdue

### Section C — Footer
- **Left**: Comment count (with icon), attachment indicator
- **Right**: Assignee avatars (max 3 + overflow), or creator avatar if unassigned

---

## 7. Item Inspector

A right-side drawer panel (520px) that opens when clicking an item.

### Fields (top to bottom)

| Field | Description | Editable By |
|-------|-------------|-------------|
| **Title** | Large text input, auto-saves on change | Members+ |
| **Tags** | Colored pills with add/remove. 9 color options | Members+ |
| **Due Date** | Date picker | Members+ |
| **Priority** | Dropdown: None, Low, Medium, High | Members+ |
| **Members** | Assign/unassign flow members via dropdown | Members+ |
| **Linked Lead** | Link/unlink a CRM lead (see Lead Integration) | Admin/Owner |
| **Description** | Multi-line textarea, auto-saves | Members+ |
| **Comments** | Add comments (Ctrl+Enter to submit), view comment history | Members+ |
| **Activity** | Read-only timeline of all actions on this item | All |

### Auto-Save
All field changes auto-save after a 600ms debounce. A "Saving..." indicator appears in the header.

### Close Item
The **"Close Item"** button in the footer archives the item and removes it from the board.

---

## 8. Lead Integration

### Linking an Item to a Lead

**Who can do this**: Admin and Owner roles only.

**How to link**:
1. Open Item Inspector and click **"Link to Lead"** in the Linked Lead section
   — OR right-click an item and select **"Link to Lead"** from the context menu
2. Search for a lead by name, email, or company
3. Click a lead to link it

**Constraints**:
- An item can link to only **one** lead at a time
- A lead can only be linked to **one active item** across all flows
- Leads already linked elsewhere show an "Already linked" badge

### Unlinking
- Click the unlink button in the Inspector's lead section
- Or right-click the item and select **"Unlink Lead"**

### Auto Lane-to-Lead Pipeline Sync

**Only applies to flows created from the Basic Workflow template.**

When an item with a linked lead is moved between lanes:

| Lane | Lead Status Updated To |
|------|----------------------|
| To Do | New |
| Progress | Contacted |
| Done | Converted |

A note is also appended to the lead: `[Team Hub] Lead moved to {Lane Name} in Team Hub`

### Comment-to-Lead Notes Sync

When a comment is added to an item with a linked lead, the comment is automatically appended to the lead's notes:

```
[Team Hub] User Name: Comment body text here
```

This appears in the CRM lead detail view.

---

## 9. Board Templates

### System Templates

| Template | Lanes | Lead Sync |
|----------|-------|-----------|
| Basic Workflow | To Do, Progress, Done | Yes |
| Sales Sprint | Prospecting, Contacted, Negotiation, Closed | No |
| Project Delivery | Planning, Active, Review, Complete | No |

### User Templates

**Save a flow as a template**:
1. Open a flow
2. Click **"Save Template"** in the header (owner/admin only)
3. Enter a template name and confirm

The template captures the current lane structure (names and positions).

**Delete a user template**:
- In the Template Selector, hover a user template and click the trash icon

**Use a template**:
- When creating a new flow, select the template from the selector
- Lanes are auto-created based on the template structure

---

## 10. Team Members & Roles

### Roles

| Role | Description |
|------|-------------|
| **Owner** | Full control. Can delete flow, manage all members, edit everything |
| **Admin** | Can manage members/lanes, edit items, comment. Cannot delete the flow |
| **Member** | Can edit items, move items, add comments |
| **Viewer** | Read-only access |

### Inviting Members
1. Click **Share** or the member avatars in the flow header
2. Enter an email address
3. Select a role (Admin, Member, or Viewer)
4. Click **Invite**

Pending invites appear in the panel and can be revoked.

### Managing Members
- Change a member's role via the dropdown (owner/admin only)
- Remove a member via the trash icon (owner/admin only)
- The owner role cannot be changed or removed

---

## 11. Context Menus

### Item Context Menu (right-click on a card)

| Option | Available To | Description |
|--------|-------------|-------------|
| Open | All | Opens Item Inspector |
| High / Medium / Low / No Priority | Members+ | Set item priority (current marked with dot) |
| Assign members | Members+ | Toggle member assignment (assigned marked with dot) |
| Move to [Lane] | Members+ | Move item to another lane |
| Link to Lead | Admin/Owner | Open lead search dialog |
| Unlink Lead | Admin/Owner | Remove linked lead |
| Close Item | Members+ | Archive the item (red) |

### Lane Context Menu (right-click on empty lane area)

| Option | Available To | Description |
|--------|-------------|-------------|
| Add Item | Members+ | Create a new item in this lane |
| Rename Lane | Admin/Owner | Edit the lane name inline |
| Delete Lane | Admin/Owner | Delete the lane (red) |

---

## 12. Activity Feed

### Board Activity Sidebar
Toggle via the **Activity** button in the flow header. Shows recent actions across the entire flow:

- Item created / moved / archived
- Comment added
- Lane created
- Member added / removed / role changed
- Invite sent
- Lead linked / unlinked

Each entry shows: actor name, action, detail, and timestamp.

### Item Activity (in Inspector)
The Activity section at the bottom of the Item Inspector shows actions specific to that item.

---

## 13. Permissions Matrix

| Capability | Owner | Admin | Member | Viewer |
|-----------|-------|-------|--------|--------|
| View flow and items | Yes | Yes | Yes | Yes |
| Edit item fields | Yes | Yes | Yes | No |
| Move items between lanes | Yes | Yes | Yes | No |
| Add comments | Yes | Yes | Yes | No |
| Add/rename/delete lanes | Yes | Yes | No | No |
| Manage team members | Yes | Yes | No | No |
| Link/unlink leads | Yes | Yes | No | No |
| Edit flow name | Yes | Yes | No | No |
| Save as template | Yes | Yes | No | No |
| Delete flow | Yes | No | No | No |

---

## 14. Keyboard Shortcuts

| Context | Shortcut | Action |
|---------|----------|--------|
| Flow name edit | `Enter` | Save |
| Flow name edit | `Escape` | Cancel |
| Add lane input | `Enter` | Create lane |
| Add lane input | `Escape` | Cancel |
| Add item input | `Enter` | Create item |
| Add item input | `Shift+Enter` | New line |
| Add item input | `Escape` | Cancel |
| Item Inspector | `Escape` | Close drawer |
| Comment textarea | `Ctrl/Cmd+Enter` | Submit comment |
| Context menu | `Escape` | Close menu |
| Any modal/dialog | `Escape` | Close |
| Any modal backdrop | Click | Close |
| Template selector name | `Enter` | Submit (with selected template) |
| Invite email input | `Enter` | Send invite |
