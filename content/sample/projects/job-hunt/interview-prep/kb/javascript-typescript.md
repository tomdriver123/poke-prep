---
topic: javascript-typescript
prefix: js
created: 2026-10-01
count: 15
level: medium
streak: 0
---

# JavaScript and TypeScript Bank

Invented sample questions on JavaScript and TypeScript fundamentals: scope, closures, the event loop, promises, type narrowing and generics. Same format as the other bank in this folder.

## Index

| ID | Key | Kind | Level | Status | Due | Seen | Label |
|----|-----|------|-------|--------|-----|------|-------|
| js-001 | js.equality.coercion | code | fundamentals | queued | none | 0 | loose equality and NaN |
| js-002 | js.scope.let.const.block | concept | fundamentals | queued | none | 0 | which declarations are block scoped |
| js-003 | js.closure.loop.var | code | fundamentals | queued | none | 0 | closures capturing a var loop counter |
| js-004 | js.event.loop.microtask.order | code | medium | queued | none | 0 | microtasks versus timers in the event loop |
| js-005 | js.this.arrow.method | concept | medium | queued | none | 0 | why an arrow method cannot update its object |
| js-006 | js.promise.allsettled | scenario | medium | queued | none | 0 | showing partial results when some requests fail |
| js-007 | js.async.bounded.concurrency | scenario | senior | queued | none | 0 | slow sequential awaits in a loop |
| js-008 | ts.type.alias.vs.interface | concept | fundamentals | queued | none | 0 | what only a type alias can express |
| js-009 | ts.unknown.vs.any | concept | fundamentals | queued | none | 0 | safer type for unvalidated JSON |
| js-010 | ts.exhaustive.switch.never | code | medium | queued | none | 0 | guarding a switch against new union members |
| js-011 | ts.generics.extends.constraint | concept | medium | queued | none | 0 | what a generic constraint does |
| js-012 | ts.as.const.literal.union | code | medium | queued | none | 0 | deriving a union from a const array |
| js-013 | ts.structural.private.member | compare | senior | queued | none | 0 | what makes two identical classes incompatible |
| js-014 | js.memory.listener.leak | scenario | senior | queued | none | 0 | slow memory growth in a single page app |
| js-015 | js.array.tosorted.immutability | code | medium | queued | none | 0 | sorting without mutating the original |

## Questions

### js-001
key: js.equality.coercion
kind: code
level: fundamentals
deck: seed
first asked: none
answer: A

**Stem**
What does this log?

```js
console.log(0 == '', null == undefined, NaN === NaN);
```

**Options**
A. true true false
B. false true false
C. true false true

**Why**
Loose equality coerces both sides, so 0 == '' is true (the empty string becomes 0) and null == undefined is true by a special rule. NaN is the one value that is never equal to itself, even with strict equality.

**Rubric**
1. Explains that loose equality coerces its operands.
2. States that NaN is not equal to itself.

**Model answer**
true true false. The empty string coerces to 0, null and undefined are loosely equal by rule, and NaN never equals itself (use Number.isNaN to test for it).

**Attempts**

### js-002
key: js.scope.let.const.block
kind: concept
level: fundamentals
deck: seed
first asked: none
answer: B

**Stem**
Which declarations are scoped to the nearest block and cannot be used before the line that declares them?

**Options**
A. var and function
B. let and const
C. var only

**Why**
let and const are block scoped and sit in a temporal dead zone until their declaration runs, so early access throws a ReferenceError. var is function scoped and hoisted with the value undefined.

**Rubric**
1. Names let and const as block scoped.
2. Mentions the temporal dead zone or the error on early access.

**Model answer**
let and const. They are block scoped and unusable before their declaration (the temporal dead zone), while var is function scoped and hoisted as undefined.

**Attempts**

### js-003
key: js.closure.loop.var
kind: code
level: fundamentals
deck: seed
first asked: none
answer: C

**Stem**
What does this log?

```js
const fns = [];
for (var i = 0; i < 3; i++) {
  fns.push(() => i);
}
console.log(fns.map((f) => f()));
```

**Options**
A. [0, 1, 2]
B. [undefined, undefined, undefined]
C. [3, 3, 3]

**Why**
var gives the whole loop one shared i, and every arrow function closes over that same variable. By the time they run, the loop has finished and i is 3. Declaring the counter with let creates a fresh binding per iteration and gives [0, 1, 2].

**Rubric**
1. States that var creates a single shared binding.
2. Says the closures read the final value, or that let would fix it.

**Model answer**
[3, 3, 3]. All three closures share one var binding that ends at 3. With let each iteration gets its own binding.

**Attempts**

### js-004
key: js.event.loop.microtask.order
kind: code
level: medium
deck: seed
first asked: none
answer: A

**Stem**
In what order does this log?

```js
console.log('a');
setTimeout(() => console.log('b'), 0);
Promise.resolve().then(() => console.log('c'));
console.log('d');
```

**Options**
A. a, d, c, b
B. a, b, c, d
C. a, d, b, c

**Why**
Synchronous code runs first (a, d). Then the microtask queue drains, which runs the promise callback (c), and only after that does the event loop take the next timer task (b).

**Rubric**
1. Runs synchronous code first.
2. Places promise callbacks (microtasks) before timers (tasks).

**Model answer**
a, d, c, b. Sync code first, then microtasks like promise callbacks, then the timer task.

**Attempts**

### js-005
key: js.this.arrow.method
kind: concept
level: medium
deck: seed
first asked: none
answer: B

**Stem**
Why does `counter.inc()` fail to change `counter.n`?

```js
const counter = {
  n: 0,
  inc: () => {
    this.n++;
  },
};
```

**Options**
A. Arrow functions are typed as read only
B. The arrow captures this from the surrounding scope instead of using the object it is called on
C. n is implicitly a constant

**Why**
Arrow functions have no this of their own, they use the this of the scope where they were written. In a module or script that is not the object literal, so this.n++ touches something else. A regular method, or the shorthand inc() {}, gets this from the call site.

**Rubric**
1. States that arrow functions take this lexically.
2. Offers a method shorthand or a regular function as the fix.

**Model answer**
Arrows bind this lexically, so it is the enclosing scope's this, not counter. Use a regular method (inc() { this.n++; }).

**Attempts**

### js-006
key: js.promise.allsettled
kind: scenario
level: medium
deck: seed
first asked: none
answer: C

**Stem**
You fire five independent requests and want to render the ones that succeed even if a few fail. Which combinator fits?

**Options**
A. Promise.all
B. Promise.race
C. Promise.allSettled

**Why**
allSettled waits for every promise and reports each outcome as fulfilled or rejected, so you can render the successes. Promise.all rejects as soon as one fails and drops the rest, and race settles with whichever finishes first.

**Rubric**
1. Names Promise.allSettled.
2. Explains that Promise.all rejects on the first failure.

**Model answer**
Promise.allSettled. It waits for all of them and gives a status per promise. Promise.all would reject on the first failure.

**Attempts**

### js-007
key: js.async.bounded.concurrency
kind: scenario
level: senior
deck: seed
first asked: none
answer: A

**Stem**
A loop awaits one request per id and is far too slow for 500 ids, but the API rate limits you. What is the best change?

**Options**
A. Run the requests in bounded batches or with a small concurrency pool
B. Fire all 500 at once with Promise.all
C. Remove the awaits and ignore the results

**Why**
Independent requests can overlap, but an unbounded fan out of 500 will trip the rate limit and may exhaust sockets. A pool of a handful of in flight requests keeps most of the speedup and stays polite. Ignoring the results loses errors entirely.

**Rubric**
1. Recognizes that independent awaits can overlap.
2. Keeps concurrency bounded because of the rate limit.

**Model answer**
Overlap the requests but cap concurrency with batches or a small pool. Unbounded Promise.all risks rate limits, and dropping the awaits loses errors.

**Attempts**

### js-008
key: ts.type.alias.vs.interface
kind: concept
level: fundamentals
deck: seed
first asked: none
answer: B

**Stem**
Which of these can describe a union such as `'idle' | 'loading' | 'done'`?

**Options**
A. interface
B. A type alias
C. Both can

**Why**
A type alias can name any type, including unions, tuples and mapped types. An interface only describes object shapes (though it can be extended and merged).

**Rubric**
1. Names the type alias for unions.
2. Notes that interfaces describe object shapes.

**Model answer**
A type alias. Interfaces only describe object shapes, aliases can name unions, tuples and more.

**Attempts**

### js-009
key: ts.unknown.vs.any
kind: concept
level: fundamentals
deck: seed
first asked: none
answer: C

**Stem**
You call `JSON.parse` on data from the network and have not validated it yet. Which type is the safer annotation for the result?

**Options**
A. any
B. never
C. unknown

**Why**
unknown accepts any value but forces you to narrow it before use, so mistakes surface at compile time. any switches the checker off for everything it touches, and never means no value can exist.

**Rubric**
1. Chooses unknown.
2. Explains that unknown forces narrowing while any disables checks.

**Model answer**
unknown. It forces a check or a validation before use, whereas any quietly disables type checking.

**Attempts**

### js-010
key: ts.exhaustive.switch.never
kind: code
level: medium
deck: seed
first asked: none
answer: A

**Stem**
Given the union below, how do you make the compiler flag any switch over `s.kind` that forgets a new variant?

```ts
type Shape =
  | { kind: 'circle'; r: number }
  | { kind: 'rect'; w: number; h: number };
```

**Options**
A. Add a default branch that assigns s to a variable of type never
B. Add a default branch that returns 0
C. Cast s to any in the default branch

**Why**
After every known case is handled, s narrows to never. Assigning it to a never typed variable in default compiles only while the switch is exhaustive, so adding a variant breaks the build at that line. Returning 0 or casting to any hides the gap.

**Rubric**
1. Explains that the leftover type narrows to never.
2. Uses a never assignment (or helper) to force a compile error.

**Model answer**
In default, assign the value to a never typed variable. It only compiles when all cases are covered, so a new variant becomes a compile error.

**Attempts**

### js-011
key: ts.generics.extends.constraint
kind: concept
level: medium
deck: seed
first asked: none
answer: B

**Stem**
What does the constraint do in `function byId<T extends { id: string }>(items: T[], id: string): T | undefined`?

**Options**
A. It converts every item to the type { id: string }
B. It requires items to have an id string while keeping their full specific type
C. It makes the id property optional

**Why**
The constraint restricts T to types that have at least an id of type string, so the body can read item.id, and the return type is still the caller's specific T instead of a stripped down shape.

**Rubric**
1. Says T must be assignable to the constraint.
2. Notes the specific type is preserved in the result.

**Model answer**
It limits T to types with an id string so the body can use it, and the caller still gets back their own item type, not a narrower one.

**Attempts**

### js-012
key: ts.as.const.literal.union
kind: code
level: medium
deck: seed
first asked: none
answer: C

**Stem**
What is the type of `Role` here?

```ts
const roles = ['admin', 'user'] as const;
type Role = (typeof roles)[number];
```

**Options**
A. string
B. string[]
C. 'admin' | 'user'

**Why**
as const makes the array a readonly tuple of literal types, and indexing that tuple type with number yields the union of its element types, 'admin' | 'user'. Without as const it would widen to string.

**Rubric**
1. Explains that as const keeps literal types.
2. Reads indexing with number as the union of the elements.

**Model answer**
'admin' | 'user'. as const keeps the literals in a readonly tuple, and [number] indexes it into a union.

**Attempts**

### js-013
key: ts.structural.private.member
kind: compare
level: senior
deck: seed
first asked: none
answer: A

**Stem**
Classes A and B have the same public members, and assigning an A instance to a variable typed B compiles. Which change makes that assignment a compile error?

**Options**
A. Add a private member to B
B. Mark one of A's methods readonly
C. Move B to its own file

**Why**
TypeScript compares types structurally, so identical public shapes are interchangeable. A private or protected member is only compatible with the declaration it came from, which makes the class behave nominally. Moving files or marking things readonly does not change the shape comparison.

**Rubric**
1. States that TypeScript typing is structural.
2. Names private or protected members as what breaks compatibility.

**Model answer**
Structural typing lets them mix. Adding a private member to B makes only B (and subclasses) assignable to it.

**Attempts**

### js-014
key: js.memory.listener.leak
kind: scenario
level: senior
deck: seed
first asked: none
answer: B

**Stem**
A single page app grows in memory after many route changes. Each view adds `window.addEventListener('resize', () => this.layout())` and never removes it. What is the right fix?

**Options**
A. Call gc() after each route change
B. Keep a handler reference (or an AbortSignal) and remove the listener when the view is destroyed
C. Wrap the handler in a setTimeout so it runs later

**Why**
A listener on window keeps its callback, and everything the callback closes over, alive after the view is gone. An anonymous arrow cannot be removed, so each visit adds another. Removing the same function reference, or passing an AbortSignal to addEventListener and aborting on teardown, releases it.

**Rubric**
1. Identifies the long lived window listener retaining the view.
2. Fixes it with removal on teardown through a reference or AbortSignal.

**Model answer**
The window holds each view alive through its listener. Keep the handler (or use an AbortSignal) and remove it when the view is destroyed.

**Attempts**

### js-015
key: js.array.tosorted.immutability
kind: code
level: medium
deck: seed
first asked: none
answer: C

**Stem**
Which expression returns a sorted copy and leaves the original array untouched?

**Options**
A. arr.sort()
B. arr.reverse()
C. arr.toSorted()

**Why**
toSorted (ES2023) returns a new array, while sort and reverse reorder the array in place. Before toSorted you would write [...arr].sort().

**Rubric**
1. Names toSorted or a copy followed by sort.
2. States that sort mutates in place.

**Model answer**
arr.toSorted(), or [...arr].sort() on older runtimes. Plain sort mutates the original.

**Attempts**
