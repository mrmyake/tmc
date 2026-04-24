# Navigation refactor — The Movement Club

This document specifies a refactor of the in-app navigation for `themovementclub.nl/app/*`. The current implementation uses a single top-nav for all authenticated users, which mixes member, trainer and admin items in one bar. The refactor introduces **role-scoped layouts**: each role-context gets its own navigation, and users with multiple roles switch contexts via an avatar dropdown.

Use this document as the spec for the refactor. Do not change Sanity schemas, Supabase tables, or auth logic — this is purely a UI/layout reorganization.

---

## 1. Roles

The system has four roles. A user is a `bezoeker` if not authenticated; otherwise they carry an array of one or more of `member`, `trainer`, `admin`.

**Valid role combinations (from `profiles.role` or equivalent):**

| Combination | Who |
|---|---|
| `[member]` | Regular paying member |
| `[trainer]` | External trainer who doesn't train here as a member |
| `[trainer, member]` | Trainer who also trains as a paying member |
| `[admin, trainer]` | Marlon (studio owner + trainer) |
| `[admin]` | Theoretically possible (e.g. office admin), handle same as `[admin, trainer]` minus the trainer switcher option |

Admins never carry the `member` role — admin permissions subsume everything a member can do. If an admin wants to participate in a class, that's a separate "staff booking" permission (out of scope for this refactor).

---

## 2. Default landing per role

After login, redirect to the role's primary context:

| Role array | Redirect to |
|---|---|
| `[member]` | `/app/rooster` |
| `[trainer]` | `/app/trainer/sessies` |
| `[trainer, member]` | `/app/rooster` (member context = primary) |
| `[admin, trainer]` | `/app/admin` (admin context = primary for Marlon) |
| `[admin]` | `/app/admin` |

Implementation: update the post-login redirect in `/auth/callback` to check `profile.role` and route accordingly.

---

## 3. Navigation structures

### 3.1 Public top-nav (`bezoeker` — unauthenticated)

Unchanged from current implementation. Out of scope for this refactor.

### 3.2 Member nav (`/app/*` for anyone with `member` or `trainer+member`)

**Desktop: top nav. Mobile: bottom tab bar.**

```
The Movement Club    Rooster    Mijn lessen    Lidmaatschap    Profiel    [avatar ▼]
```

Four items only. Removed from previous nav: `Dashboard`, `PT`, `Trainer`, `Admin`, `Uitloggen` (all relocated — see §4).

**Route mapping:**
- `Rooster` → `/app/rooster` (landing page; see §4.1 for merge with old Dashboard)
- `Mijn lessen` → `/app/boekingen`
- `Lidmaatschap` → `/app/abonnement` (with facturen as sub-page, not separate tab)
- `Profiel` → `/app/profiel`

**Active state:** rooster label in brand gold, others in neutral. Match current styling.

### 3.3 Trainer nav (`/app/trainer/*` for anyone with `trainer`)

**Desktop: top nav. Mobile: bottom tab bar (3 items).**

Desktop:
```
The Movement Club    Mijn sessies    Profiel    [avatar ▼]
```

Mobile (bottom tab bar):
```
[ Sessies ]    [ Profiel ]    [ Meer ]
```

**Route mapping:**
- `Mijn sessies` / `Sessies` → `/app/trainer/sessies`
- `Profiel` → `/app/profiel` (shared with member profile page; no separate trainer profile)
- `Meer` (mobile only) → opens sheet with: role-switcher options (if user has multiple roles), Uitloggen. Same content as avatar dropdown on desktop.

**Mobile pattern:** the avatar dropdown is absent in the top area on mobile; its contents are surfaced via the `Meer` tab. This matches the member mobile pattern where dropdown-like actions live inside the Profiel or Meer tab rather than in a header.

### 3.4 Admin cockpit (`/app/admin/*` for anyone with `admin`)

**Desktop-only layout with left sidebar.** No mobile support for admin cockpit — Marlon uses desktop for admin tasks. On mobile, show a "Admin cockpit is alleen beschikbaar op desktop" empty state and a link back to member view.

**Layout:**

```
┌────────────────────────────────────────────────────────────────┐
│  TMC · Admin                         🔔 3   + Nieuw   [Hoi Ilja ▼]│
├──────────────┬─────────────────────────────────────────────────┤
│  Dashboard   │                                                 │
│  Rooster     │         [page content]                          │
│  Leden       │                                                 │
│  Trainers    │                                                 │
│  ─────       │                                                 │
│  Rapportage  │                                                 │
│  Content ↗   │                                                 │
│              │                                                 │
└──────────────┴─────────────────────────────────────────────────┘
```

**Sidebar — section 1 (daily use):**
- `Dashboard` → `/app/admin` — today's sessions, open pauze-requests, KPI snapshot
- `Rooster` → `/app/admin/rooster` — session editor, capacity, trainer swap
- `Leden` → `/app/admin/leden` — member management
- `Trainers` → `/app/admin/trainers` — trainer management + hours

**Sidebar — section 2 (occasional use, visually separated with horizontal rule):**
- `Rapportage` → `/app/admin/rapportage` (rename from `/app/admin/dashboard` to match label; keep old route as 301 redirect)
- `Content ↗` → external link to `/studio`, opens in new tab, with `↗` icon

**Admin header (top of content area, sticky):**
- Left: `TMC · Admin` wordmark
- Right, in order: 🔔 bell with red badge showing count of open pauze-requests (links to `/app/admin/leden?filter=pauze-requests`), `+ Nieuw` dropdown with quick-actions (Nieuwe les, Nieuw lid, Ad-hoc sessie), avatar dropdown

**No "Instellingen" item yet.** If/when settings pages get built (staff permissions, lestypes, tarieven), add as bottom sidebar item. Don't add an empty shell now.

---

## 4. What gets removed and where it goes

### 4.1 Old `Dashboard` tab

**Current:** `/app` shows a dashboard summary.
**New:** `/app/rooster` becomes the member landing page. Move the "eerstvolgende les" card that currently lives on `/app` to the top of `/app/rooster`. Redirect `/app` → `/app/rooster`.

### 4.2 Old `PT` tab

**Current:** `/app/pt` (or similar) as separate member nav item.
**New:** PT is a lestype like any other. Remove from nav entirely. In `/app/rooster`, add a filter chip for PT alongside Groepsles, Yoga, Mobility, etc. PT sessions with capacity=1 appear in the regular rooster grid.

If `/app/pt` has custom content that isn't replicated elsewhere (e.g. PT intake form, trainer bio), keep the route but remove it from nav — make it reachable via "PT" chip → info card → "Meer over PT" link. Alternatively move this content to the public `/aanbod` or `/pt` page on the website.

### 4.3 Old `Trainer` tab

**Current:** top-nav item showing to everyone.
**New:** removed from nav. Only users with `trainer` role see a "Schakel naar Trainer view" option in their avatar dropdown.

### 4.4 Old `Admin` tab

**Current:** top-nav item showing to Marlon inside the member nav.
**New:** removed from member nav. Admins land directly in the admin cockpit (their default). In member/trainer views, they switch back to admin via avatar dropdown.

### 4.5 Old `Uitloggen` item

**Current:** separate top-nav item.
**New:** lives inside avatar dropdown, bottom-most item, separator above.

---

## 5. Avatar dropdown (role-switcher)

The avatar dropdown appears in the top-right of every authenticated layout (member nav, trainer nav, admin header).

**Content depends on role array:**

```
[member only]
  👤 Mijn profiel      → /app/profiel
  ─────────────
  Uitloggen

[trainer only]
  👤 Mijn profiel      → /app/profiel
  ─────────────
  Uitloggen

[trainer + member, in member view]
  👤 Mijn profiel      → /app/profiel
  ─────────────
  Schakel naar:
  → Trainer view       → /app/trainer/sessies
  ─────────────
  Uitloggen

[trainer + member, in trainer view]
  👤 Mijn profiel      → /app/profiel
  ─────────────
  Schakel naar:
  → Member view        → /app/rooster
  ─────────────
  Uitloggen

[admin + trainer, in admin cockpit]
  👤 Mijn profiel      → /app/profiel
  ─────────────
  Schakel naar:
  → Trainer view       → /app/trainer/sessies
  → Member view        → /app/rooster
  ─────────────
  Uitloggen

[admin + trainer, in trainer view]
  👤 Mijn profiel      → /app/profiel
  ─────────────
  Schakel naar:
  → Admin cockpit      → /app/admin
  → Member view        → /app/rooster   (optional, only if admin is also a paying member — edge case, skip for now)
  ─────────────
  Uitloggen
```

**Rule:** show switcher options only for contexts the user has access to AND that aren't the current context. Hide the "Schakel naar" section entirely if the user has only one role.

**Trigger label:** `Hoi, {firstName}` with chevron, same styling as current nav.

---

## 6. File structure (Next.js App Router)

Use nested route groups and layouts. Admin and trainer layouts override the member layout automatically via App Router's layout nesting.

```
src/app/
  (marketing)/                    — existing public site layout, unchanged
    layout.tsx
    page.tsx
    ...

  (app)/                          — authenticated app
    app/
      layout.tsx                  — MODIFIED: now renders MemberNav, slimmed to 4 items
      page.tsx                    — MODIFIED: redirect to /app/rooster
      rooster/
        page.tsx                  — MODIFIED: show "eerstvolgende les" card on top
      boekingen/page.tsx          — unchanged
      abonnement/
        page.tsx                  — unchanged
        facturen/page.tsx         — unchanged (sub-page under Lidmaatschap)
      profiel/page.tsx            — unchanged, shared across roles

      admin/
        layout.tsx                — NEW: AdminLayout with sidebar, overrides member nav
        page.tsx                  — existing dashboard
        leden/
          page.tsx
          [id]/page.tsx
        rooster/page.tsx
        trainers/page.tsx
        rapportage/page.tsx       — RENAMED from /app/admin/dashboard

      trainer/
        layout.tsx                — NEW: TrainerLayout with minimal top nav
        sessies/page.tsx

  api/
    ...                           — unchanged

middleware.ts                     — MODIFIED: role-based redirects post-login (see §2)
```

**Component files to create:**

```
src/components/nav/
  MemberNav.tsx                   — NEW or REFACTORED from current nav
  TrainerNav.tsx                  — NEW
  AdminSidebar.tsx                — NEW
  AdminHeader.tsx                 — NEW (holds bell + quick-actions + avatar)
  AvatarDropdown.tsx              — NEW (role-aware, used in all 3 nav components)
  QuickActionsMenu.tsx            — NEW (for admin header +Nieuw button)
  PauzeRequestBell.tsx            — NEW (bell with count badge)
```

**Hooks:**

```
src/lib/hooks/
  useRoles.ts                     — returns user's role array from Supabase profile
  useActiveContext.ts             — derives 'member' | 'trainer' | 'admin' from current pathname
```

---

## 7. Component specs

### 7.1 `<AvatarDropdown>`

```tsx
type Props = {
  user: { firstName: string; avatarUrl?: string };
  roles: Role[];                  // ['member'] | ['trainer'] | ['trainer', 'member'] | ['admin', 'trainer']
  activeContext: 'member' | 'trainer' | 'admin';
};
```

Renders `Hoi, {firstName} ▼` trigger. On open, shows Mijn profiel, conditional switcher section, Uitloggen. Uses `next/link` for navigation. Signs out via Supabase `auth.signOut()` then redirects to `/`.

### 7.2 `<MemberNav>`

Top nav on desktop, bottom tab bar on mobile (breakpoint: `md`). Items:
- The Movement Club wordmark (left, links to `/app/rooster`)
- Rooster · Mijn lessen · Lidmaatschap · Profiel (center on desktop, tabs on mobile)
- AvatarDropdown (right on desktop, hidden on mobile — moved to Profiel tab)

Mobile profiel tab includes avatar-dropdown options inline at the top of the Profiel page, not as a dropdown.

### 7.3 `<TrainerNav>`

Desktop: top nav. Mobile: bottom tab bar (breakpoint: `md`). Items:
- Desktop top nav: wordmark, `Mijn sessies`, `Profiel`, AvatarDropdown
- Mobile bottom bar: `Sessies`, `Profiel`, `Meer` — `Meer` opens a sheet/drawer with role-switcher and Uitloggen

### 7.4 `<AdminSidebar>` + `<AdminHeader>`

Sidebar: 240px fixed width, dark background matching brand. Header: sticky top, 64px tall, same dark palette. Content area fills remaining space with generous padding.

Admin header contents left-to-right:
- `TMC · Admin` wordmark
- Spacer
- `<PauzeRequestBell>` — queries open pauze-requests count, shows badge if >0
- `<QuickActionsMenu>` — `+ Nieuw` button opening dropdown with: Nieuwe les, Nieuw lid, Ad-hoc sessie
- `<AvatarDropdown>` — role-aware

On viewport <1024px, render mobile empty state: "Admin cockpit is alleen beschikbaar op desktop. Open op een laptop of desktop om verder te gaan." with link to `/app/rooster`.

---

## 8. Middleware / redirect logic

Update `middleware.ts` to enforce:

1. Unauthenticated access to `/app/*` → redirect to `/login?redirect={pathname}`
2. Authenticated access to `/app/admin/*` without `admin` role → redirect to `/app/rooster`
3. Authenticated access to `/app/trainer/*` without `trainer` role → redirect to `/app/rooster`
4. Post-login redirect (in `/auth/callback`) → based on primary role per §2

---

## 9. Copy / labels

All UI copy in Dutch. Exact strings:

| Element | Dutch |
|---|---|
| Wordmark | `The Movement Club` (member/trainer), `TMC · Admin` (admin) |
| Member nav items | `Rooster`, `Mijn lessen`, `Lidmaatschap`, `Profiel` |
| Trainer nav items | `Mijn sessies`, `Profiel` (desktop); `Sessies`, `Profiel`, `Meer` (mobile) |
| Admin sidebar items | `Dashboard`, `Rooster`, `Leden`, `Trainers`, `Rapportage`, `Content ↗` |
| Avatar trigger | `Hoi, {firstName}` |
| Dropdown items | `Mijn profiel`, `Schakel naar:`, `Admin cockpit`, `Trainer view`, `Member view`, `Uitloggen` |
| Admin header quick-action | `+ Nieuw` |
| Quick-action options | `Nieuwe les`, `Nieuw lid`, `Ad-hoc sessie` |
| Mobile admin empty state | `Admin cockpit is alleen beschikbaar op desktop. Open op een laptop of desktop om verder te gaan.` |

---

## 10. Testing checklist

Verify after implementation:

- [ ] A user with `[member]` logs in → lands on `/app/rooster`, sees 4 nav items, no Admin/Trainer anywhere
- [ ] A user with `[member]` opens avatar dropdown → sees only Mijn profiel + Uitloggen
- [ ] A user with `[trainer]` logs in → lands on `/app/trainer/sessies`, sees 2 nav items
- [ ] A user with `[trainer, member]` logs in → lands on `/app/rooster`, can switch to Trainer view via avatar dropdown
- [ ] A user with `[admin, trainer]` (Marlon) logs in → lands on `/app/admin`, sees sidebar with 6 items, can switch to Trainer or Member view via avatar dropdown
- [ ] `/app/admin/*` on mobile viewport shows empty state with link back
- [ ] A member tries to visit `/app/admin` directly → redirected to `/app/rooster`
- [ ] A member tries to visit `/app/trainer/sessies` → redirected to `/app/rooster`
- [ ] `/app/admin/dashboard` (old route) → 301 redirects to `/app/admin/rapportage`
- [ ] `/app` → redirects to `/app/rooster`
- [ ] PT filter chip appears on `/app/rooster` and filters session list correctly
- [ ] "Eerstvolgende les" card appears at top of `/app/rooster` when user has upcoming booking
- [ ] Bell badge in admin header shows correct count of open pauze-requests
- [ ] `+ Nieuw` dropdown in admin header opens and routes correctly
- [ ] Uitloggen signs out and redirects to `/`

---

## 11. Out of scope for this refactor

- Staff-booking permission (admin/trainer booking themselves without credits)
- New settings pages under admin
- Changes to Sanity schemas
- Changes to Supabase tables or RLS policies
- Changes to the public website nav
- Readonly admin role
- i18n (app stays Dutch-only)

---

## 12. CLAUDE.md update

After implementation, add a section to `CLAUDE.md` titled "Navigation architecture" that documents:

- The four roles and their valid combinations
- Default landings per role
- The three layouts (member, trainer, admin) and which routes use which
- Avatar dropdown role-switcher logic

This keeps future Claude Code sessions aligned with the refactor.
