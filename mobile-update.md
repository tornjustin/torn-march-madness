# MEMM Mobile-First Update

## Priority 1: Replace Bracket with List View on Mobile

### The Problem

`BracketPage.jsx` renders the bracket with absolute positioning, fixed pixel dimensions (`GAME_H = 82px`, `COL_W = 168px`), and SVG connector lines inside a container with `min-width: 760px`. On a 375px phone screen, users must horizontally scroll a complex bracket — it's unusable.

### Recommendation

On screens under 640px, replace the bracket grid with a vertical card list grouped by round. Each card shows the two teams and links to the vote page.

Example structure:

```jsx
@media (max-width: 640px) {
  /* Hide the SVG bracket on mobile */
  .region-bracket { display: none; }
  .region-bracket-labels { display: none; }

  /* Show the mobile list instead */
  .mobile-matchup-list { display: flex; flex-direction: column; gap: 12px; }
}

@media (min-width: 641px) {
  .mobile-matchup-list { display: none; }
}
```

Each mobile matchup card should:

- Show both team photos, names, and seeds
- Display vote percentages if closed
- Link to `/vote/:id` if active
- Show status badge (Active / Closed / Pending)
- Be at least 56px tall for comfortable tapping

### Implementation Sketch

Add a `MobileMatchupList` component to `BracketPage.jsx`:

```jsx
function MobileMatchupList({ matchups, roundNames }) {
  const rounds = [...new Set(matchups.map(m => m.round))].sort();
  return (
    <div className="mobile-matchup-list">
      {rounds.map(round => (
        <div key={round}>
          <h4 className="mobile-round-heading">{roundNames[round]}</h4>
          {matchups.filter(m => m.round === round).sort((a, b) => a.position - b.position).map(m => (
            <MobileMatchupCard key={m.id} matchup={m} />
          ))}
        </div>
      ))}
    </div>
  );
}
```

Render it alongside the existing bracket, using CSS to toggle visibility.

---

## Priority 2: Scrollable Tabs

### The Problem

The `.tabs` container has 5 tabs (4 regions + Finals) using Cinzel font with `padding: 10px 18px`. On a 375px screen, these overflow and either wrap awkwardly or clip.

### Fix

Add horizontal scrolling to tabs on mobile:

```css
@media (max-width: 640px) {
  .tabs {
    overflow-x: auto;
    flex-wrap: nowrap;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none; /* Firefox */
  }
  .tabs::-webkit-scrollbar {
    display: none; /* Chrome/Safari */
  }
  .tab-btn {
    white-space: nowrap;
    flex-shrink: 0;
    padding: 10px 14px;
    font-size: 0.72rem;
  }
}
```

---

## Priority 3: Larger Vote Buttons and Better Touch Targets

### The Problem

The vote button (`.vote-btn`) has `padding: 12px 28px` which is usable but not optimal on mobile. The whole team side is a tap target, but the button itself should be prominently sized and centered for clarity.

### Fix

```css
@media (max-width: 640px) {
  .vote-btn {
    width: 100%;
    justify-content: center;
    padding: 16px;
    font-size: 1rem;
    border-radius: 8px;
  }

  .vote-content {
    padding: 20px 16px;
  }

  .vote-side {
    min-height: 45vh;
  }

  .vote-team-name {
    font-size: 1.3rem;
  }

  /* Increase result bar text size */
  .result-bar-team1 span,
  .result-bar-team2 span {
    font-size: 0.8rem;
  }
}
```

Also increase the minimum touch target size on bracket cells if keeping any bracket view on mobile — Material Design recommends 48x48px minimum.

---

## Priority 4: Navigation Hamburger Menu

### The Problem

The nav bar has a logo + 3 links (Bracket, Stream View, Admin). On a narrow phone, these crowd together. The Stream View link is an OBS tool and not useful on mobile.

### Recommendation

- Hide the Stream View link on mobile entirely (it's a desktop/OBS feature)
- If space is still tight, collapse to a hamburger menu

Quick fix without a hamburger:

```css
@media (max-width: 640px) {
  .nav-inner {
    height: 56px;
  }

  .nav-logo-main {
    font-size: 0.9rem;
  }

  .nav-logo-sub {
    font-size: 0.6rem;
  }

  .nav-links {
    gap: 16px;
  }

  .nav-links a {
    font-size: 0.75rem;
    letter-spacing: 0.06em;
  }

  /* Hide stream link on mobile */
  .nav-stream-link {
    display: none;
  }
}
```

---

## Priority 5: Active Matchups Bar

### The Problem

`.active-matchups-bar` uses `flex-wrap: wrap`, which stacks chips vertically when there are many active matchups. On a narrow screen the chips become cramped.

### Recommendation

Make it a horizontal scroll strip on mobile:

```css
@media (max-width: 640px) {
  .active-matchups-bar {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    padding: 8px 12px;
  }
  .active-matchups-bar::-webkit-scrollbar {
    display: none;
  }
  .active-matchup-chip {
    flex-shrink: 0;
    font-size: 0.68rem;
    padding: 4px 10px;
  }
  .active-bar-label {
    flex-shrink: 0;
  }
}
```

---

## Additional Mobile Considerations

### Final Four Section

The `.final-four-grid` uses `flex-wrap: wrap` which handles mobile reasonably well, but the `.ff-col` has `min-width: 200px`. On very narrow screens, consider:

```css
@media (max-width: 640px) {
  .final-four-grid {
    flex-direction: column;
    gap: 16px;
  }
  .ff-center-arrow {
    transform: rotate(90deg);
  }
  .ff-col .bracket-cell {
    width: 100%;
  }
}
```

### VotingPage VS Divider

The existing mobile styles (line 521-528 of `VotingPage.jsx`) correctly flatten the VS divider to horizontal. This works well — no changes needed.

### Polling Considerations

On mobile, users may have the vote page open on a slow connection. The 8-second polling interval is reasonable, but consider pausing polling when the browser tab is not visible (using `document.visibilitychange` event) to save battery and bandwidth.

```js
useEffect(() => {
  const handleVisibility = () => {
    // pause/resume polling based on tab visibility
  };
  document.addEventListener('visibilitychange', handleVisibility);
  return () => document.removeEventListener('visibilitychange', handleVisibility);
}, []);
```

---

## Implementation Order

1. **Mobile bracket list view** — Biggest impact; the bracket is currently broken on phones
2. **Scrollable tabs** — Quick CSS fix, high impact
3. **Larger vote buttons + touch targets** — Quick CSS fix, improves usability
4. **Nav adjustments** — Hide stream link, tighten spacing
5. **Active matchups horizontal scroll** — Minor polish
6. **Final Four column stacking** — Minor polish
7. **Visibility-based poll pausing** — Performance optimization
