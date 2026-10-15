---
topic: web-fundamentals
prefix: web
created: 2026-10-01
count: 15
level: medium
streak: 0
---

# Web Fundamentals Bank

Invented sample questions on HTTP, caching, accessibility basics and CSS layout. Every question has exactly three options, one correct answer, a rubric for saying the answer cold, and an Attempts log. The Index table is the single source of truth for status and recall dates.

## Index

| ID | Key | Kind | Level | Status | Due | Seen | Label |
|----|-----|------|-------|--------|-----|------|-------|
| web-001 | http.status.redirect.permanent | concept | fundamentals | asked | none | 1 | status code for a permanent redirect |
| web-002 | http.method.idempotent.put | concept | fundamentals | queued | none | 0 | which method replaces a resource idempotently |
| web-003 | http.cache.etag.revalidate | scenario | medium | queued | none | 0 | what no-cache with an ETag does on reuse |
| web-004 | http.cache.vary.encoding | scenario | senior | queued | none | 0 | shared cache serving the wrong encoding |
| web-005 | http.cors.preflight | concept | fundamentals | queued | none | 0 | when a browser sends a CORS preflight |
| web-006 | http.cookie.samesite | scenario | medium | queued | none | 0 | stopping cross-site form posts from using a login cookie |
| web-007 | http.https.hsts | scenario | senior | queued | none | 0 | downgrade risk on the very first http request |
| web-008 | a11y.alt.decorative.image | concept | fundamentals | queued | none | 0 | alt text for a purely decorative image |
| web-009 | a11y.button.vs.div | scenario | fundamentals | queued | none | 0 | what a clickable div is missing for keyboard users |
| web-010 | a11y.label.accessible.name | concept | medium | queued | none | 0 | best way to name a text input |
| web-011 | a11y.focus.visible.style | scenario | medium | queued | none | 0 | what to do when design hates the focus outline |
| web-012 | css.boxmodel.border.box | concept | fundamentals | queued | none | 0 | total width under border-box |
| web-013 | css.grid.auto.fill.gallery | scenario | medium | queued | none | 0 | a card gallery whose columns line up across rows |
| web-014 | css.flex.min.width.overflow | scenario | medium | queued | none | 0 | flex child overflowing with a long string |
| web-015 | css.stacking.context.zindex | scenario | senior | queued | none | 0 | modal behind a header despite a huge z-index |

## Questions

### web-001
key: http.status.redirect.permanent
kind: concept
level: fundamentals
deck: seed
first asked: 2026-10-10
answer: B

**Stem**
A page moved to a new URL for good and you want browsers and search engines to treat the new URL as the real one from now on. Which status code do you send with the Location header?

**Options**
A. 302 Found
B. 301 Moved Permanently
C. 304 Not Modified

**Why**
301 says the move is permanent, so clients may cache the redirect and search engines transfer the old URL's standing. A 302 is a temporary redirect, and a 304 is not a redirect at all, it answers a conditional request with no body.

**Rubric**
1. Names 301 (or 308) as the permanent redirect.
2. Contrasts it with the temporary 302 or 307.

**Model answer**
301 for a permanent move, 302 or 307 when the move is temporary. A 304 only means the cached copy is still good.

**Attempts**
2026-10-10 mcq B pass tier0

### web-002
key: http.method.idempotent.put
kind: concept
level: fundamentals
deck: seed
first asked: none
answer: C

**Stem**
A client replaces the full contents of a resource at a known URL and may safely retry the request if the connection drops. Which method fits?

**Options**
A. POST
B. PATCH
C. PUT

**Why**
PUT is defined as idempotent, so sending the same request twice leaves the server in the same state as sending it once. POST creates or triggers work and is not safe to blindly retry, and PATCH may or may not be idempotent depending on the patch format.

**Rubric**
1. Names PUT.
2. Explains that idempotent means repeating the request has the same effect as sending it once.

**Model answer**
PUT, because it is idempotent: replaying the same replacement leaves the same state, which makes retries safe.

**Attempts**

### web-003
key: http.cache.etag.revalidate
kind: scenario
level: medium
deck: seed
first asked: none
answer: A

**Stem**
A response arrives with `ETag: "v42"` and `Cache-Control: no-cache`. The user opens the same URL again a minute later. What does the browser do?

**Options**
A. Sends a conditional request with If-None-Match and reuses its stored body if the server answers 304
B. Serves the stored copy without contacting the server
C. Refuses to store the response at all

**Why**
Despite the name, no-cache means the stored copy must be revalidated before reuse. The ETag makes that cheap: a 304 reply has no body and the browser reuses what it has. Skipping the server is what max-age does, and refusing to store is no-store.

**Rubric**
1. States that no-cache forces revalidation, not skipping the cache.
2. Names the conditional request (If-None-Match) and the 304 reply.

**Model answer**
It revalidates every time. It asks the server with If-None-Match, and a 304 lets it reuse the stored body without downloading it again.

**Attempts**

### web-004
key: http.cache.vary.encoding
kind: scenario
level: senior
deck: seed
first asked: none
answer: C

**Stem**
Your origin sends gzip to clients that ask for it and plain text to the rest. After you put a CDN in front, some clients receive gzip bytes they cannot decode. What is the correct fix at the origin?

**Options**
A. Set Cache-Control: private on every response
B. Strip the Accept-Encoding header at the CDN so every client gets plain text
C. Add Vary: Accept-Encoding so the cache stores one variant per encoding

**Why**
A shared cache keys on the URL unless told otherwise. Vary names the request headers that change the response, so the CDN keeps a gzip copy and a plain copy and picks by the request. Private would disable the CDN for these responses, and stripping the header throws away compression for everyone.

**Rubric**
1. Explains that caches key on the URL unless Vary says otherwise.
2. Names Vary: Accept-Encoding as the fix that keeps compression.

**Model answer**
The cache is serving one stored variant to everyone. Vary: Accept-Encoding tells it to store and select a copy per encoding, which keeps compression and fixes the bad responses.

**Attempts**

### web-005
key: http.cors.preflight
kind: concept
level: fundamentals
deck: seed
first asked: none
answer: B

**Stem**
A page on one origin calls an API on another origin with `fetch`. In which case does the browser first send an OPTIONS preflight request?

**Options**
A. Every cross-origin GET, without exception
B. The request uses a method or headers outside the simple set, such as PUT or a custom header
C. Only when the response is JSON

**Why**
Simple requests (GET, HEAD or POST with a basic content type and no custom headers) go straight out. Anything else, like PUT, DELETE or a custom header, makes the browser ask permission first with an OPTIONS request that the server must answer with the allowed methods and headers.

**Rubric**
1. Distinguishes simple requests from ones that need a preflight.
2. Names the trigger: a non-simple method, custom headers or a non-simple content type.

**Model answer**
A preflight happens only for non-simple requests: methods like PUT or DELETE, custom headers, or unusual content types. The server answers the OPTIONS call with what it allows.

**Attempts**

### web-006
key: http.cookie.samesite
kind: scenario
level: medium
deck: seed
first asked: none
answer: A

**Stem**
Another site can submit a hidden form to your /transfer endpoint and the browser attaches the user's login cookie. Which cookie attribute most directly reduces this CSRF exposure?

**Options**
A. SameSite=Lax (or Strict)
B. HttpOnly
C. Secure

**Why**
SameSite controls whether the cookie travels on cross-site requests, which is exactly the CSRF vector. HttpOnly only hides the cookie from scripts and Secure only requires HTTPS, so neither stops a cross-site form post from carrying it.

**Rubric**
1. Names SameSite as the attribute that limits cross-site sending.
2. Explains why HttpOnly and Secure address different problems.

**Model answer**
SameSite=Lax or Strict. It stops the browser attaching the cookie to most cross-site requests, which is what CSRF relies on. HttpOnly protects against script reads and Secure against plain HTTP.

**Attempts**

### web-007
key: http.https.hsts
kind: scenario
level: senior
deck: seed
first asked: none
answer: C

**Stem**
Your site redirects http to https, yet a user on hostile coffee shop wifi can still be intercepted on the redirect hop. Which header shrinks that window for repeat visits?

**Options**
A. Cache-Control: no-store on the redirect
B. Content-Security-Policy: upgrade-insecure-requests only
C. Strict-Transport-Security with a long max-age

**Why**
HSTS tells the browser to use https for this host without even trying http, for as long as max-age says, which removes the interceptable redirect on later visits. Adding preload covers the first visit too. The other two headers do not stop the browser from making the initial http request.

**Rubric**
1. Names Strict-Transport-Security.
2. Explains that the browser skips http entirely for the max-age period.

**Model answer**
Send HSTS with a long max-age (and consider preload). The browser then goes straight to https and never makes the interceptable http request again.

**Attempts**

### web-008
key: a11y.alt.decorative.image
kind: concept
level: fundamentals
deck: seed
first asked: none
answer: B

**Stem**
A hero image is pure decoration and adds no information. What should its alt attribute be?

**Options**
A. alt="image"
B. An empty string, alt=""
C. Leave the attribute off

**Why**
An empty alt tells screen readers to skip the image, which is right for decoration. Leaving the attribute off makes many readers announce the file name instead, and alt="image" adds noise without information.

**Rubric**
1. Says an empty alt attribute marks the image as decorative.
2. Notes that omitting the attribute is different and worse.

**Model answer**
Use alt="" so assistive technology skips it. A missing alt attribute is not the same, readers may read out the file name.

**Attempts**

### web-009
key: a11y.button.vs.div
kind: scenario
level: fundamentals
deck: seed
first asked: none
answer: A

**Stem**
A teammate builds a button as `<div class="btn" (click)="save()">`. A keyboard user cannot use it. What is missing?

**Options**
A. Focusability and Enter or Space activation, which a native button provides for free
B. A bigger touch target
C. A title attribute with the label

**Why**
A div is not focusable and does not react to Enter or Space, so keyboard and many assistive technology users are locked out. A real button element gives focus, key handling and the right role with no extra code. The other options do not solve the interaction gap.

**Rubric**
1. Identifies missing focus and keyboard activation.
2. Recommends the native button element.

**Model answer**
A div has no focus, no role and no key handling. Use a real button element and it gets all three for free.

**Attempts**

### web-010
key: a11y.label.accessible.name
kind: concept
level: medium
deck: seed
first asked: none
answer: C

**Stem**
A search field only shows the word Search as grey placeholder text. Which change gives the input a reliable accessible name?

**Options**
A. Move the text into the title attribute of the wrapping div
B. Style the placeholder with higher contrast
C. Add a label element associated with the input

**Why**
A programmatically associated label names the control for assistive technology and also enlarges the click target. Placeholder text disappears on input and is not a dependable name, and a title on a wrapper is not tied to the input.

**Rubric**
1. Names a label associated through for and id, or by wrapping.
2. Explains why a placeholder is not a substitute.

**Model answer**
Add a label tied to the input with for and id (or wrap the input in it). Placeholders vanish once you type and are not a reliable accessible name.

**Attempts**

### web-011
key: a11y.focus.visible.style
kind: scenario
level: medium
deck: seed
first asked: none
answer: B

**Stem**
A designer asks you to remove the browser focus outline because it looks ugly. What is the best response?

**Options**
A. Apply outline: none to everything and rely on hover styles
B. Replace it with a clear custom style on :focus-visible
C. Keep the outline for mouse users and hide it for keyboard users

**Why**
Keyboard users need a visible focus indicator. Restyling it on :focus-visible keeps it for keyboard navigation while letting the design decide how it looks. Removing it breaks navigation, and the third option has the audiences backwards.

**Rubric**
1. Insists on a visible focus indicator for keyboard users.
2. Names :focus-visible as the way to restyle it.

**Model answer**
Never remove it without a replacement. Style :focus-visible with a clear high contrast ring so keyboard users keep their place.

**Attempts**

### web-012
key: css.boxmodel.border.box
kind: concept
level: fundamentals
deck: seed
first asked: none
answer: A

**Stem**
An element has `box-sizing: border-box; width: 200px; padding: 20px; border: 5px solid`. How wide is the element on screen?

**Options**
A. 200px
B. 250px
C. 240px

**Why**
With border-box the declared width already includes padding and border, so the content box shrinks to 150px and the element stays 200px wide. Under the default content-box it would be 250px.

**Rubric**
1. States that border-box includes padding and border in the width.
2. Gives 200px.

**Model answer**
200px. Under border-box the width includes padding and border, so the content area is 150px.

**Attempts**

### web-013
key: css.grid.auto.fill.gallery
kind: scenario
level: medium
deck: seed
first asked: none
answer: C

**Stem**
You are building a card gallery where cards wrap to new rows as the viewport narrows, and every column must line up from row to row. Which approach fits best?

**Options**
A. inline-block cards with percentage widths
B. Flexbox with flex-wrap and a fixed card width
C. Grid with repeat(auto-fill, minmax(200px, 1fr))

**Why**
Grid lays out in two dimensions, so rows and columns stay aligned, and auto-fill with minmax makes the column count follow the available width. A wrapping flex row sizes each line on its own, so a short last row stretches or misaligns.

**Rubric**
1. Chooses grid for aligned rows and columns.
2. Mentions auto-fill with minmax for a responsive column count.

**Model answer**
Use grid with repeat(auto-fill, minmax(200px, 1fr)). It keeps columns aligned across rows and adapts the count to the width, which a wrapping flex row does not guarantee.

**Attempts**

### web-014
key: css.flex.min.width.overflow
kind: scenario
level: medium
deck: seed
first asked: none
answer: B

**Stem**
A flex item holds a long unbroken URL and pushes past the edge of its container instead of shrinking. Which fix targets the cause?

**Options**
A. overflow: scroll on the container
B. min-width: 0 on the flex item
C. flex-grow: 0 on the flex item

**Why**
Flex items have min-width: auto, which stops them from shrinking below their content size. Setting min-width: 0 lets the item shrink so overflow handling and wrapping can apply. Scrolling the container hides the symptom and flex-grow does not control shrinking.

**Rubric**
1. Identifies the automatic minimum size of flex items.
2. Names min-width: 0 (or overflow other than visible) on the item.

**Model answer**
Flex items refuse to shrink below their content by default. Set min-width: 0 on the item so it can shrink and the text can wrap or truncate.

**Attempts**

### web-015
key: css.stacking.context.zindex
kind: scenario
level: senior
deck: seed
first asked: none
answer: A

**Stem**
A modal with `z-index: 9999` still renders behind a sticky header with `z-index: 10`. What is the most likely cause?

**Options**
A. The modal lives inside an ancestor that forms its own stacking context ranked below the header
B. z-index values above 999 are ignored
C. The header is position: static

**Why**
A z-index only competes inside its stacking context. If the modal's ancestor creates a context (through transform, opacity, position with z-index and so on) that ranks below the header, nothing inside it can climb above the header. The fix is to move the modal to the root, for example with a portal.

**Rubric**
1. Explains stacking contexts and that z-index is scoped to one.
2. Proposes moving the modal out of the ancestor, or fixing the ancestor.

**Model answer**
z-index only works within a stacking context. The modal's ancestor likely creates one that ranks below the header, so mount the modal at the document root.

**Attempts**
