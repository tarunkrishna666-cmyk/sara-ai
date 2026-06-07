# sarA Responsive Testing Checklist

## Shared checks

- No horizontal page overflow.
- Keyboard focus is visible on every interactive control.
- Chat messages, markdown tables, and code blocks stay inside the viewport.
- Code and tables scroll horizontally without moving the page.
- Streaming content auto-scrolls without blocking manual scrolling.
- Light, dark, and system themes remain readable.
- Reduced-motion preference disables continuous decorative animation.

## 320px mobile

- Sidebar starts closed and opens as a full-height drawer.
- Header, message bubbles, and composer fit without clipping.
- Composer remains above the mobile keyboard and safe area.
- Floating new-chat button does not cover the send button.

## 375px and 425px mobile

- Chat uses the full screen with no bottom navigation competing with the composer.
- Touch controls meet a minimum 44px target.
- History, dashboard, memory, and settings use the safe-area-aware bottom navigation.

## 768px tablet

- Sidebar is visible and can collapse to the compact rail.
- Dashboard cards use two columns.
- Settings and memory content avoid horizontal overflow.

## 1024px laptop

- Sidebar remains visible at full width.
- Chat content stays centered with readable line lengths.
- Conversation management controls are accessible by keyboard and pointer.

## 1440px desktop

- Dashboard expands to four cards.
- Workspace content receives larger spacing without oversized text lines.
- Sidebar remains fixed and chat remains centered.

## 1920px desktop

- Main content width remains capped for readability.
- Dashboard widgets and page spacing scale without leaving controls isolated.
- No stretched message bubbles or excessively long markdown lines.
