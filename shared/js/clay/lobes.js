// Implicit clay lobes — a small set of soft round cones (capsule-like volumes
// with unequal end radii) that touch, blend and permanently fuse. A lobe's end
// radii are re-derived from (restRadius, length) on every read rather than
// integrated forward, so it can be reshaped ten thousand times with nothing to
// accumulate drift into. This module owns only the geometry/topology model; the
// renderer (lobes-three.js) turns `shading()` into an SDF blob. Zero imports:
// it must run unchanged as a plain browser ES module and inside plain node.
//
// THE MODEL — MASS RESHAPING
// A drag on the clay does not add anything. It takes hold of the mass under
// the finger and ELONGATES it: the ball becomes an egg, the egg an oval, the
// oval a capsule, pointing where the finger went. Because the mass's volume is
// its own and is finite, the whole thing NARROWS as it lengthens — the overall
// size visibly adjusts, which is the entire read this model exists to produce.
// Both ends stay rounded (the far end is TIP_KEEP as wide as the near one at
// full draw), so the result is never a spike growing out of a ball.
//
// Drag the far end and the stretch continues from the other side. Drag a long
// shaft sideways — the one thing reshaping a single capsule cannot express —
// and a second capsule is spawned out of the first one's clay, obeying exactly
// the same rounded semantics from its first frame.
//
// THERE IS NO LIMIT ON DEFORMING
// A child can work the same creature forever. Reshaping allocates nothing, so
// almost every gesture is free; the settle merges masses that already read as
// one, so the primitive count plateaus instead of growing; and a spawn that
// finds the field full merges a pair to make room, or quietly reshapes
// instead. Nothing in this file returns a refusal for a gesture on clay. A
// mass at its minimum thickness stops taking more clay and goes on reshaping —
// clay that resists, never a toy that says no. The only null answer left is
// "there is no clay under that point", which is a fact about the table.
//
// VOLUME IS A CLOSED SYSTEM, WITH NO LEDGER
// Elongation is SELF-donation: a mass spends its own volume on its own new
// shape, exactly conserved by construction. The lump around it gives a minor
// top-up (ELONGATION_DRAW) so the body visibly participates, and a spawned
// capsule is paid for by its parent — both as immediate, permanent transfers
// between two `radius` values. The additive model's donor ledger, its budget
// solve and its two kinds of refusal are all gone with it.
//
// THE LUMP TAKES ITS SET, VISIBLY
// Every release runs a brief, FINITE, deterministic relaxation: welds press
// visibly together, resting mass spreads into the table, fresh elongations
// slump a few percent, a limb droops once under its own weight, and one pair
// of same-colour masses that already read as one thing rounds into one thing.
// Every effect is a FIXED POINT rather than a delta, so settling twice does
// what settling once does and a creature worked for ten minutes never sags
// shut. Length is floored (SETTLE_LENGTH_FLOOR): the settle softens FORM, not
// WORK.
//
// TWO SHAPE LAWS
// SHAPE_BLUNT is the model above. SHAPE_TAPER is the old additive-spike law,
// alive only so that creatures saved before this one still render with the
// geometry they were saved with. See the shape-law block below.
//
// HAND-WORKED SURFACE
// Every lobe carries a low-frequency displacement keyed to its OWN material
// frame and seeded per creature, so the masses stop being geometrically
// perfect without ever swimming as the clay is worked. See the noise block
// below; the renderer mirrors it in GLSL.

export const MAX_LOBES = 16;

// --- Two shape laws, and why both exist -------------------------------------
// A lobe's (ra, rb) are never stored — they are re-derived from (restRadius,
// length) on every read, which is what makes reshaping drift-free. WHICH law
// does the deriving is a per-lobe property, because this file has had two.
//
// SHAPE_BLUNT is the live one and the whole point of the reshaping model: the
// tip RATIO is pinned and the shoulder is solved from volume, so a ball drawn
// out in a direction becomes an egg, then a capsule — longer AND narrower all
// over, tip comparably rounded to the shoulder. The read is "the ball is being
// elongated", never "a spike is growing out of a ball".
//
// SHAPE_TAPER is the old additive-spike law, kept ONLY so creatures saved
// before the reshaping model still render with the geometry they were saved
// with. Nothing new is ever created with it; fromJSON stamps it onto stretched
// lobes out of a pre-v4 payload and toJSON writes it back. It pins the SHOULDER
// near restRadius and solves the tip from volume, which drives rb toward a
// needle point — the exact read the owner rejected.
export const SHAPE_BLUNT = 'blunt';
export const SHAPE_TAPER = 'taper';

// How far a lobe may be drawn out along its own axis, in its OWN rest radii.
// This is a per-primitive limit, not a limit on deformation: a mass already at
// full elongation still re-aims freely under the finger, and a pull that wants
// to go further spawns the next capsule (see reshapeToward). 2.4 was chosen
// against the alternatives at TIP_KEEP 0.66: at 1.8 a full draw only reaches
// 1.6x the ball's original extent, which reads as "the ball got a bit oval"
// rather than as stretching; at 2.6 the mass narrows to 0.73 of the ball's
// width, far enough that a welded neighbour's join visibly thins. 2.4 lands a
// full elongation at 1.83x the original extent and 0.77x the width — an
// unmistakable stretch that still keeps its welds.
export const MAX_ELONGATION = 2.4;
// rb/ra at full elongation — THE silhouette decision of this model, and the
// number the "rounded, not spiky" read is asserted against. The old taper law
// drove this to 0.16 at full stretch, which is what made a pull read as a
// spike. 0.66 keeps the far end two-thirds as wide as the shoulder: the eye
// reads a capsule with a soft directional taper, i.e. a thing that has been
// stretched, and never a point. Below ~0.55 the spike read starts to return;
// at 1.0 the mass is a perfect capsule and loses the sense of direction that
// tells a child which end they pulled.
export const TIP_KEEP = 0.66;
// The floor the rendered silhouette is held to (node test and repo QA both
// assert against it, from opposite ends — the geometry and the pixels). Kept
// clear of TIP_KEEP so a future retune has somewhere to move without silently
// crossing back into spike territory.
export const TIP_KEEP_FLOOR = 0.60;

// --- The legacy taper law's own constants (old saves only) ------------------
export const MAX_STRETCH = 2.6;    // max |stretch vector|, in rest radii
// ra/restRadius at full stretch under SHAPE_TAPER.
export const SHOULDER_KEEP = 0.88;
// Exported because a caller that decides where a falling lobe comes to REST
// has to land it at or past the point where it welds. Left as a private
// default, a caller guessing "about half" stops the ball a hair short of
// fusing and the child watches two pieces of clay touch without joining.
export const FUSE_THRESHOLD = 0.52;

// --- Mass-reshaping tuning --------------------------------------------------
// A lobe SPAWNED by a gesture (rather than dropped from the tray) carries this
// kind, and that is the ONLY thing that distinguishes it: it is a perfectly
// ordinary round-cone lobe in every other respect, so it renders, blends,
// fuses, saves and re-loads with no special case anywhere downstream. It is
// also what the four-ball Decorate gate counts AROUND — ballCount() is every
// lobe that is not one of these.
export const PULL_KIND = 'pull';
// When a drag on an already-elongated mass spawns a new capsule instead of
// reshaping the old one, the new capsule's rest radius is this fraction of the
// local surface radius where the fingers closed. Not 1.0: a branch should read
// as a limb coming off a body, and the parent has to survive paying for it.
// Not 0.35 either — under 0.5 the spawned mass is small enough that its own
// full elongation is shorter than the finger's travel and the gesture feels
// like it stopped responding.
export const BRANCH_GRIP_FRACTION = 0.62;
// A spawned capsule's base is planted this deep under the surface it came out
// of, in its own radii, so it welds on the frame it appears and the smooth
// union closes over the joint rather than leaving a ball balanced on the skin.
const BRANCH_BASE_SINK = 0.55;
// A drag has to be at least this far off the grabbed mass's own axis before it
// spawns a branch rather than continuing to reshape. cos(58 degrees): inside
// that cone the child is elongating or re-aiming what is already there, which
// is what most gestures are and what costs no budget at all.
const BRANCH_ANGLE_COS = 0.53;
// ...and it has to be on the SHAFT, not an end cap: a sideways drag on the tip
// of a capsule is re-aiming it, not branching off it. Measured as the grab's
// parameter along the axis.
const BRANCH_SHAFT_BAND = [0.22, 0.78];
// A mass has to be at least this elongated (as a fraction of its own maximum)
// before a sideways drag counts as "off a long shaft" at all. A round ball has
// no shaft to branch from — every direction is the same direction — so a drag
// on one always elongates it.
const BRANCH_MIN_ELONGATION = 0.45;
// No lobe may ever be thinned below this fraction of the radius it was created
// with — about 61% of its volume. It is the floor that keeps a body from
// evaporating into branches. Reaching it never refuses anything: the gesture
// simply stops drawing more clay and goes on reshaping.
const DONOR_FLOOR = 0.85;
// How much extra volume a fully-elongated mass draws from the clay welded
// around it, as a fraction of its own. SECONDARY BY DESIGN: reshaping is
// self-donation — the mass redistributes its OWN volume, which is what makes
// it narrow as it lengthens — and this is the minor top-up that lets the rest
// of the lump visibly give a little as the child draws. At 0.10 a full
// elongation costs each welded neighbour a couple of percent of its radius:
// enough that the lump reads as participating, far too little to hollow a body
// out however many times it is worked.
const ELONGATION_DRAW = 0.10;

const DEFAULTS = {
  maxLobes: MAX_LOBES,
  contactReach: 1.035,   // (rA+rB)*contactReach is where contact starts
  contactSpan: 0.38,     // contact ramps to 1 over (rA+rB)*contactSpan
  fuseThreshold: FUSE_THRESHOLD, // contact above this fuses the pair, permanently
  neckSlack: 1.02,       // a fused pair may never separate beyond (rA+rB)*neckSlack
  constrainIterations: 4,
};

const SINK = 0.10;            // fraction of ra a resting lobe sinks below the ground
const CONTACT_SQUASH = 0.10;  // deform contributed by neighbor contact (unchanged from before)
const IMPACT_SQUASH = 0.30;   // deform contributed by a transient landing impact
const DEFORM_LIMIT = 0.35;    // clamp so a hard impact can't invert the mesh
// Smooth-union blend radius, in world units, handed to the renderer per lobe.
// Two things about it are deliberate. It keys off restRadius, not the derived
// ra, so the fillet at a weld is a property of the ball the child dropped and
// stays put while the limb is drawn out — an ra-keyed blend would breathe
// under the gesture. And it grows with the stretch, because however fat the
// shoulder is kept, a tapered limb still meets the body at a shallower angle
// than a ball does, and at the un-scaled radius the two surfaces cross in a
// hard V that reads as a crack rather than a shoulder. Real clay pulled into
// an arm keeps a broad fillet where it leaves the lump; this is that fillet.
//
// The gain was re-judged again under the reshaping model, and it came DOWN.
// The whole reason it was ever this large is in the paragraph above: a tapered
// limb meets the body at a shallower angle than a ball does, and at the
// un-scaled radius the two surfaces cross in a hard V. A blunt capsule does
// not — its shoulder is within a fifth of the mass it grew out of, so it meets
// the body at very nearly the angle a plain ball would, and the extra fillet
// stopped paying for itself.
//
// It was not free. The blend radius is the k of a smooth union, and a wide k
// is what makes the raymarch creep: at MAX_LOBES with every mass drawn out,
// full-quality frames measured 16.5ms at DPR 1.5 against a ~13ms budget. At
// 1.0 the same worst case measures inside budget with no notch anywhere on a
// side-by-side of full-elongation welds — the fillet the old number bought is
// simply not needed by the shape that replaced the spike.
const BLEND_BASE = 0.015;
const BLEND_JOIN = 0.085;
const BLEND_STRETCH_GAIN = 1.0;

// --- Taking its set: the settle ---------------------------------------------
// THE SETTLE HAS TO BE SEEN. The previous tuning was correct, deterministic,
// bounded and completely invisible: its largest surface travel on a real stage
// was one to four CSS pixels over 420ms, which is nothing at all, and the
// owner watching the clay be released reasonably reported that nothing
// happened. Every number below was re-derived against a PIXEL budget on the
// live stage rather than against a percentage that only looked modest.
//
// The thing that keeps this safe is not smallness — it is that every effect
// here is a FIXED POINT rather than a fixed delta. A weld draws toward a
// target separation, not "1% closer than wherever it is"; a lobe sinks to a
// settled height, not "a bit deeper"; droop is drawn from a lifetime budget.
// Settling twice therefore does exactly what settling once does, which is what
// keeps a child who works the same creature for ten minutes from watching it
// slowly sag and close up. The cumulative-sag bug that shipped once already
// cannot come back through a delta, because there are no deltas left.
export const SETTLE_MS = 600;             // total duration; then the stage is still again
// THE FIXED POINT for a welded pair, as a fraction of their combined base
// radii. A pair welds the instant contact passes FUSE_THRESHOLD, which happens
// at a separation of 0.837 of their combined radii, so a freshly landed ball
// has 0.082 of travel waiting for it here — on the real stage that measured
// ~12px of visible press-together as a ball lands, against the ~1.6px the old
// 1%-per-settle delta produced. A pair already closer than this does
// not move at all, which is what makes the effect a one-time set rather than a
// slow collapse.
const SETTLE_WELD_SET = 0.755;
// Ceiling on how far any one lobe may be moved by the weld pass in a single
// settle, in its own base radii. A lobe welded to four others gets four
// separate demands (this is Jacobi — they are summed, not resolved), and
// without a cap a ball in the middle of a cluster could be walked further than
// any single pair ever asked for.
const SETTLE_WELD_MAX = 0.120;
// Radians of droop a lobe may EVER be given, over its whole life, summed
// across every settle it ever sees. Not per-settle: per-lobe, forever. That is
// what makes the droop safe to leave in at a size worth seeing (~3.2 degrees
// on a fully horizontal limb, ~13px at the tip of a long one) — it is a
// one-time slump under the clay's own weight (~4.9 degrees, ~13px at the tip
// of a long limb on the real stage), and a lobe that has already given it has
// nothing left to give however many more times it is worked.
const SETTLE_DROOP_BUDGET = 0.085;
// Fraction of the budget a single settle may spend, so a limb that is worked
// once does not spend the whole allowance in one frame-burst and read as the
// arm falling.
const SETTLE_DROOP_STEP = 0.62;
// Extra fraction of its own base radius a ground-resting lobe settles into the
// table. Carried as a per-lobe property (see sinkOf) rather than applied as a
// one-off nudge, so the next ground clamp does not quietly pop the body back
// up again. Raised from 0.020, which was under two pixels and therefore not
// there at all.
const SETTLE_SINK = 0.070;
// How much wider a settled lobe's smooth-union blend runs. This is the
// "welds deepen" half of the settle: the geometric draw-together above is
// real, and the fillet growing with it is what turns it from two balls moving
// into one join closing.
const SETTLE_SOFTEN = 0.30;
// FRESH WORK RELAXES. A mass elongated in this gesture gives back this
// fraction of its length as the clay takes its set — the slump that makes the
// settle read as clay rather than as an animation, and the largest single
// contributor to what the eye actually sees. It is taken off the length the
// child JUST dragged to, once, and then that lobe's slack is spent, so it
// cannot compound: work the same limb forty times and it is 4.5% short of the
// last drag, never 4.5% short forty times over. The node test asserts the
// surviving length against a floor from the other side.
const SETTLE_RELAX = 0.050;
// The floor that relax is held to. Exported because both the node test and the
// repo QA driver assert against it, from the geometry and the pixels
// respectively, and two copies of the number is how they drift apart.
//
// The MARGIN between it and SETTLE_RELAX is deliberate and was widened once:
// at a 6.5% relax the surviving length measured 0.935 against a 0.93 floor,
// which is a promise held by half a percent — close enough that the next
// person to nudge the relax up would cross it without the test telling them
// anything useful about why. At 5% the survival is 0.95 and the settle's
// visible travel drops by about a twelfth of a mean radius, which is nothing
// the eye can find. Buy the margin.
export const SETTLE_LENGTH_FLOOR = 0.93;
// The timing curve is an under-damped slump: 1 - e^(-k t) cos(w t). It reaches
// the set state at about a third of the duration, breathes ~8% past it around
// t = 0.73, and eases back down.
//
// It is shaped this way and not as the easeOutCubic it replaced because of what
// a frame-by-frame pixel diff of a real release showed: an easeOutCubic dumps
// ALL of its travel into the first ~90ms (12500 pixels changed, then 3200, then
// 99, then zero) and creeps sub-pixel for the remaining half-second. That is a
// flash, not a settle, and it is half of why the relaxation read as "nothing
// happened" — the eye gets one frame of motion and then 500ms of stillness.
// The overshoot puts real motion in the second half without adding one unit of
// permanent travel: the end state is untouched (writeSettle ASSIGNS it at
// t >= 1), so determinism, saves and thumbnails cannot depend on any of it.
const SETTLE_DECAY = 3.4;
const SETTLE_RING = 4.3;

// --- Gravity rest: the creature lies down ------------------------------------
// THE GROUND CLAMP IS NOT GRAVITY. Everything above only ever pushed clay UP
// out of the table, which flattens whatever overlaps the plane and does
// nothing at all about ORIENTATION. The owner's playtest is the exact
// counter-example: an elongated loaf drawn out and up ends up balanced on one
// end with its long belly hanging in the air, and it stays there, because
// nothing in this file ever asked whether the pose it was left in is one a
// lump of clay could hold.
//
// So the settle now begins by letting the composite FALL OVER. Its contact
// patch with the table and its centre of mass are computed in the view plane;
// if the COM is not over the patch, the whole composite is RIGIDLY rotated
// about the contact edge it is toppling over — every primitive together,
// welds, colours and noise phases riding along — until a new contact catches
// it. Then, and only then, the ordinary relaxation runs, so the flat patch is
// formed on the support the creature actually came to rest on.
//
// It is a rigid-body tipping model, not a physics engine: no momentum, no
// bounce, no friction. One or two topples and it is done, which is what a lump
// of clay does — it slumps onto its side and stays there.

// The angular step the topple is walked in, in radians (~2 degrees). Small
// enough that the contact event is never jumped clean over, large enough that
// the whole search is a few dozen cheap iterations.
const REST_STEP = 0.035;
// A foot counts as BEARING LOAD when its resting plane is within this fraction
// of the composite's mean base radius of the composite's lowest resting plane.
// It is a squash allowance, and it is sized like one: clay sinks 10-17% of a
// radius into the table, so a foot a tenth of a radius high is one the weld
// holding it will simply press down. Below about 0.06 the band starts calling
// perfectly ordinary bodies unstable — two balls of different sizes side by
// side have their resting planes a couple of percent apart, and a band tighter
// than that decides the smaller one is in the air and topples the pair.
//
// It is NOT what stops the toppled loaf hovering. The stop test is the same
// stability predicate as the trigger (COM inside support by REST_MARGIN), and
// the ground flatten runs afterwards on the new support, so the residual step
// between a rested loaf's two feet measures under half a CSS pixel at every
// band from 0.045 to 0.16. Sweeping it changes where the loaf lands by two
// degrees and nothing else.
const REST_CONTACT_BAND = 0.10;
// How deep a resting foot's flat patch is cut, as a fraction of its own
// radius, when the support polygon is measured. This is what gives a single
// ball a footprint (and therefore stability) at all rather than a
// mathematical point: at 0.10 the patch half-width is r*sqrt(0.10*1.90) =
// 0.436r, which is about what a ball of clay actually spreads to. It is
// deliberately the un-settled SINK and not the settled one, so the support a
// stability decision is made against is the conservative figure.
const REST_FOOTPRINT = 0.10;
// THE STABILITY MARGIN, in mean base radii — how far INSIDE its support the
// centre of mass has to sit for the pose to be one the clay will hold.
//
// A rigid body is stable the instant its COM is over its support by any margin
// at all, and clay is not a rigid body: a loaf balanced a hundredth of a radius
// inside its own contact patch slumps onto its side, which is the whole of what
// the owner reported. So the criterion carries a margin, and the margin is what
// makes an almost-balanced pose fall over.
//
// The SAME predicate decides both when to start toppling and when to stop, and
// that identity is what makes the settle idempotent: a topple by construction
// lands in a pose this test calls stable, so the next settle finds nothing to
// do. Two different thresholds here would be a slow creep.
const REST_MARGIN = 0.15;
// How far a composite's lowest point may sit ABOVE the table and still count as
// resting on it, in mean base radii. A pull that thins a mass leaves it hanging
// a few hundredths clear (the ground clamp only ever pushes UP), and that clay
// is on the table by any honest reading. Clay genuinely in the air — a ball
// still falling out of the tray — is far above this, and in any case no settle
// runs while a landing animation is live.
const REST_DROP_BAND = 0.35;
// Bisection passes used to land on the exact angle at which the new contact
// catches. Ten passes resolve REST_STEP to 3e-5 rad, far below anything the
// eye or the next settle's dead band can see.
const REST_BISECT = 10;
// How many separate topples one settle may chain. A lump of clay falling onto
// its side is one; a chain that catches and rolls again is two. Three is the
// ceiling and it exists to bound the work, not to shape the result.
const REST_MAX_TIPS = 3;
// Total rotation one settle may ever apply, in radians (~100 degrees). A
// creature that wants more than this is being asked to do something no amount
// of rotation fixes.
const REST_MAX_ANGLE = 1.75;
// The fraction of the settle the topple takes. The rotation lands at 0.78 and
// the remaining fifth is the ordinary relaxation's overshoot ringing on top —
// the clay hits its side and then jiggles to a stop, which is the read.
const REST_PHASE = 0.78;

// --- Welds are inviolable ----------------------------------------------------
// THE SECOND PLAYTEST DEFECT. Fusion was permanent as a FACT and completely
// unenforced as a GEOMETRY: `fused` recorded that two masses had joined and
// nothing ever checked that they still touched. A reshape re-aims a mass about
// whichever of its ends is further from the finger, so grabbing a welded mass
// near its root made the ROOT the thing that swung — and the owner levered a
// welded green mass almost entirely out of the body by dragging round and round
// the clock. The green primitive still existed as a primitive, so it could
// still be moved as one. That is the atomic identity the owner rejected.
//
// Two rules replace it, and they are geometric, not bookkeeping.
//
// THE WELDED END IS THE ANCHOR. If a mass's welds hold it at one of its ends,
// that end is what every subsequent reshape pivots about, whichever end the
// finger is nearer. Material then flows OUT of the weld — which is what clay
// does — instead of the weld hinging around the free end.
//
// AND THE CONTACT HAS A FLOOR. After every morph the mass is slid back along
// the line to each welded neighbour until their contact is at least what it
// was when they joined. Sliding, not clamping: the mass keeps the shape the
// child pulled and roots itself deeper, so there is no wall to hit — the child
// feels the material run out rather than the gesture stop.
//
// The floor a weld is held to. `min(contact-when-it-welded, this)`: a pair
// that only just welded is held exactly where it welded, and a branch born
// fully buried inside its parent is held HERE rather than at the 1.0 it was
// born with, because a limb that could never be drawn out of the body at all
// is not clay either. 0.72 puts the two axes 24% inside tangency, which is
// unambiguously one mass. It is also below the ~0.737 every weld is pressed to
// by SETTLE_WELD_SET, so a settled creature's welds sit clear of their own
// floor and the constraint costs a well-made creature nothing.
const WELD_FLOOR_CAP = 0.72;
// Slack on the floor, in contact units, so floating-point noise in the closest
// -point solve cannot make a resting weld look violated.
const WELD_TOL = 0.004;
// Gauss-Seidel passes over a mass's welds. Four is what restrainToPartners
// uses for the same shape of problem and for the same reason.
const WELD_ITERS = 4;
// Bisection passes used to find the longest length a mass's welds survive, once
// sliding alone can no longer hold them. Eight resolves the length to 0.4% of
// the full draw, which is a quarter of a CSS pixel on the real stage.
const WELD_BISECT = 8;
// How far from the middle of its own axis a weld has to sit before it counts
// as holding that END of the mass (and therefore as the anchor). Inside this
// band the mass is bedded along its middle rather than rooted at one end, and
// the ordinary further-end rule stands — the contact floor alone holds it.
const WELD_ANCHOR_MARGIN = 0.12;

// --- Organic simplification: the merge --------------------------------------
// The more a creature is worked, the less it should look like a union of
// platonic solids. At settle time, two heavily-overlapping SAME-COLOUR masses
// that already read as one thing are replaced by the single rounded mass they
// already look like — volume-summed, spanning both, so nothing the child made
// disappears and the silhouette barely moves. What changes is that the seam
// between them stops existing, and one primitive is freed.
//
// It is also this file's perf budget: fewer primitives is a cheaper march, and
// it is what makes "deform it forever" affordable.
//
// NEVER ACROSS A COLOUR BOUNDARY. The seams between colours are the creature's
// identity — they are how a child can see the blue ball they put on the yellow
// one — so a merge that crossed one would be deleting a decision, not
// simplifying a form.
const MERGE_CONTACT = 0.90;   // how deeply interpenetrated a pair must already be
// ...and then ONE of two further tests, because there are two different ways a
// pair can already be reading as one mass.
//
// ALIGNED. Their axes are near-parallel: two masses lying along the same line
// merge into a longer one. Crossing at an angle they are a SHAPE, and one
// capsule spanning them would cut the corner off a limb the child put there.
// Lobes with no axis at all (a plain ball) count as aligned with anything,
// because a ball has no direction to disagree about.
const MERGE_ALIGN = 0.80;
// ENGULFED. Most of the smaller one's surface is already buried inside the
// bigger one, whatever direction it points. This is the gate that actually
// fires in a real session — a branch pushed back into the body, a limb drawn
// across another — and it is the safe one by construction: three-quarters of
// that mass is not on screen to begin with, and the merged capsule still spans
// both, so there is nothing visible left to lose. Without it MERGE_ALIGN alone
// almost never triggers on a creature a child actually made, and the organic
// simplification the whole feature promises never happens.
const MERGE_ENGULF = 0.75;
// A merge NEVER reduces the number of balls. Only a lobe spawned by a gesture
// can be the one that disappears; the ball it merges into keeps its id, its
// kind and its colour. Two dropped balls therefore never merge into one, and
// the four-ball Decorate gate cannot be un-met by the clay tidying itself up —
// which is the single worst trap this feature could have introduced.


// --- Hand-worked surface noise ----------------------------------------------
// A low-frequency displacement of each lobe's own SDF, evaluated in that
// lobe's MATERIAL FRAME (its base point and deform axes, scaled by its rest
// radius) and phased off a per-creature seed. Three properties, all
// load-bearing:
//   OBJECT-LOCKED. Because the sample point is the same local point
//   lobeDistance() already computes, the lumps ride the clay. They cannot swim
//   as an arm is drawn out, as the lump settles, or as the stage is resized.
//   SEEDED. The phase triple is a pure hash of (creature seed, lobe id), and
//   lobe ids persist, so a creature looks identical every frame, every
//   session, and on its shelf thumbnail.
//   PROPORTIONAL. Amplitude keys off the LOCAL radius at the sample point, not
//   the rest radius, so a needle tip gets needle-sized lumps and the taper's
//   fat-shoulder-to-fine-point read survives intact.
// This is a different thing from the renderer's fine grain (surfaceNoise in
// lobes-three.js), which is a shading bump and stays exactly as it was.
export const DEFAULT_NOISE_SEED = 1;
// Displacement amplitude as a fraction of the LOCAL radius, and frequency in
// units of 1/restRadius. They were judged together, on rendered four-ball
// creatures with a chained and a branched limb, at DPR 1.5:
//   0.055 @ 1.55 — measurably present (the node test reads a 5.3% peak
//     displacement) and completely invisible: at one broad swelling per ball
//     the silhouette is still a circle to the eye, and the whole thing shows
//     up only as a faint shading wobble. This is the trap of tuning a
//     displacement by its numbers instead of by looking at it.
//   0.20 @ 1.55 — visible, but as ONE lump: each ball reads as a slightly
//     squashed egg rather than as worked clay, because at that frequency there
//     is only one feature per lobe to see.
//   0.11 @ 2.40 — three or four soft facets across a ball, an obviously
//     irregular outline, and forms that still read as smooth clay rather than
//     as anything diseased or melted. Raising the frequency is what buys the
//     hand-worked read; the amplitude only has to be big enough to see.
// Higher frequencies than this stop being silhouette-scale and start competing
// with the renderer's own fine grain, which is a different effect doing a
// different job.
export const NOISE_AMP = 0.11;
export const NOISE_FREQ = 2.40;
// How far from the lobe's own surface the displacement fades out, in local
// radii. A falloff is not optional: without it the perturbation extends
// through the whole march and both the step safety and the far-field
// behaviour of the union degrade for no visual gain.
export const NOISE_FALLOFF = 1.10;
// RAYMARCH STEP SAFETY. Displacing an SDF costs it its Lipschitz-1 property:
// the reported distance can now shrink faster than the ray travels, and a
// march that trusts it steps straight through the shell and stipples the
// silhouette. Scaling every reported distance down by this factor restores a
// conservative bound, and both the CPU trace (unionDistance) and the GLSL
// march (mapDistance) apply it in the same place so a pull roots on the
// surface the child can see.
//
// It is MEASURED, not assumed. The analytic worst case —
// NOISE_AMP * (NOISE_FREQ * max|k| + 1/NOISE_FALLOFF) ~ 0.11 * (2.4 * 1.55 +
// 0.91) ~ 0.51 — is far too pessimistic to pay for, because the three waves
// never peak together in the same direction; the node test sweeps the surface
// band and reads the real figure, which is a gradient of 1.204 against the
// analytic 1.51. 0.80 sits under 1/1.204 = 0.831 with margin. Every unit of
// safety here is march steps, so it is worth measuring rather than guessing:
// each 0.05 costs roughly 6% of the fragment budget.
export const NOISE_SAFETY = 0.80;
// Three oblique plane waves. Oblique on purpose: axis-aligned ones corduroy
// the surface into visible ridges, and three incommensurate directions over
// the ~3-radius extent of a lobe never close into a repeat.
const NOISE_K = [
  [1.00, 0.62, -0.35],
  [-0.48, 1.13, 0.77],
  [0.71, -0.55, 1.29],
];
const NOISE_W = [0.42, 0.34, 0.24];

// --- Consolidation ----------------------------------------------------------
// A lobe whose entire surface has ended up INSIDE the rest of the union
// contributes nothing to what the child can see, and holding a slot for it is
// pure waste under additive sculpting. It is absorbed: its own borrowings turn
// into permanent losses (so no donor grows back and nothing pops), everything
// owed to it is simply dropped (nobody shrinks either), and its slot is freed.
// Only PULL lobes are eligible — a dropped ball is what the four-ball gate
// counts and must never quietly evaporate.
const CONSOLIDATE_MARGIN = 0.02; // in rest radii: how far inside "invisible" starts
const CONSOLIDATE_STATIONS = [0, 0.34, 0.67, 1]; // along the lobe's own axis

// Quasi-uniform directions on the sphere (Fibonacci lattice), built once. A
// fixed, ordered table rather than anything sampled at call time: the absorb
// decision has to be reproducible frame to frame or a lobe could wink out on
// one machine and not another.
const SPHERE_DIRECTIONS = (() => {
  const count = 18;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    out.push([Math.cos(theta) * r, y, Math.sin(theta) * r]);
  }
  return out;
})();

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round4 = (n) => Math.round(n * 1e4) / 1e4;
const smoothstep01 = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

/**
 * Three wave phases in [0, 2pi) from (creature seed, lobe id). A pure function
 * of two persisted values, which is the entire reason a creature's lumps are
 * reproducible across sessions and on the shelf.
 */
export function noisePhase(id, seed) {
  let h = (Math.imul((Number(seed) | 0) + 0x9e3779b1, 0x85ebca6b) ^ 0x27d4eb2f) >>> 0;
  const text = String(id);
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  const next = () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
  return { x: next() * Math.PI * 2, y: next() * Math.PI * 2, z: next() * Math.PI * 2 };
}

/**
 * The displacement field itself, in a lobe's own local units. Exported so the
 * node test can bound its gradient (the raymarch step-safety argument above is
 * only as good as the number it is computed from) and so the GLSL port has one
 * reference to match.
 */
export function noiseWave(qx, qy, qz, phase) {
  // A per-lobe shear of the wave lattice. Without it every lobe's lumps run
  // the same way and the body reads as extruded rather than modelled; a pure
  // phase offset cannot fix that because it slides the pattern without turning
  // it. Three multiply-adds.
  const shear = (phase.x / (Math.PI * 2) - 0.5) * 0.6;
  const x = qx + qy * shear;
  const y = qy + qz * shear;
  const z = qz + qx * shear;
  const p = [phase.x, phase.y, phase.z];
  let sum = 0;
  for (let i = 0; i < 3; i++) {
    sum += NOISE_W[i] * Math.sin(NOISE_K[i][0] * x + NOISE_K[i][1] * y + NOISE_K[i][2] * z + p[i]);
  }
  return sum;
}

// --- Volume math ------------------------------------------------------------
// Kept as free functions (no closure state) so the node test can assert on the
// math directly, independent of any field instance.

export function sphereVolume(r) {
  return (4 / 3) * Math.PI * r * r * r;
}

// Exact volume of the convex hull of two spheres (ra at one end, rb at the
// other, centres `d` apart) — a "round cone". Valid for d >= |ra - rb|; the
// taper in coneShape() is designed to never ask for anything outside that,
// so this stays a plain closed-form expression with no branchy domain guard.
export function roundConeVolume(ra, rb, d) {
  const s = d > 0 ? (ra - rb) / d : 0; // s = 0 when d == 0 (concentric-radius case)
  const c2 = 1 - s * s;
  return (Math.PI / 3) * (
    d * c2 * c2 * (ra * ra + ra * rb + rb * rb)
    + ra * ra * ra * (1 + s) * (1 + s) * (2 - s)
    + rb * rb * rb * (1 - s) * (1 - s) * (2 + s)
  );
}

/**
 * The longest a lobe of this rest radius may be drawn along its own axis,
 * under whichever law it obeys. Every length clamp in the file goes through
 * this rather than multiplying by a bare constant, because the two laws do not
 * share a cap.
 */
export function maxLengthFor(restRadius, law = SHAPE_BLUNT) {
  return (law === SHAPE_TAPER ? MAX_STRETCH : MAX_ELONGATION) * restRadius;
}

/**
 * THE RESHAPING LAW. Pin the TIP RATIO, solve the SHOULDER from volume.
 *
 * That direction is the whole shape language of this model. A child drags a
 * ball of clay sideways: the ball does not sprout anything, it BECOMES an egg,
 * then an oval, then a capsule, and it gets thinner everywhere as it gets
 * longer because the mass it is made of is finite and is being spread over a
 * longer axis. Both ends stay rounded — the far end is TIP_KEEP as wide as the
 * near end at full draw, never a point — so there is no reading of the result
 * as a spike stuck into a lump.
 *
 * Solving it the other way round (pin the shoulder near restRadius, let the
 * tip fall out of the volume solve — see the SHAPE_TAPER branch below) is what
 * the additive-spike model did, and it drives rb to a needle: the ball keeps
 * its size and grows a thorn. That is the read this law exists to delete.
 *
 * Volume is EXACT, not approximate, and ra/rb are re-derived from scratch on
 * every call rather than integrated forward, so a mass can be drawn out and
 * pushed back a thousand times with nothing to accumulate drift into.
 *
 * The round-cone hull is only defined for d >= |ra - rb|, and this
 * parameterization can never leave that domain: |ra - rb| = ra*(1-TIP_KEEP)*u
 * and length = u*MAX_ELONGATION*restRadius, so the constraint reduces to
 * ra*(1-TIP_KEEP) <= MAX_ELONGATION*restRadius, which holds with a factor of
 * ~7 to spare for every ra the solve can return. No domain guard needed.
 */
function bluntShape(restRadius, length) {
  const u = clamp(length / maxLengthFor(restRadius), 0, 1);
  const ratio = 1 - (1 - TIP_KEEP) * u;
  const target = sphereVolume(restRadius);
  // Volume is strictly increasing in ra at fixed ratio and length, and the
  // bracket [0, 2*restRadius] straddles the answer for every u in [0,1] (at
  // u = 0 the answer is exactly restRadius; it only ever shrinks from there),
  // so bisection cannot fail to converge.
  let lo = 0;
  let hi = restRadius * 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (roundConeVolume(mid, mid * ratio, length) < target) lo = mid; else hi = mid;
  }
  const ra = (lo + hi) / 2;
  return { ra, rb: ra * ratio };
}

// Given a rest (unstretched) ball radius and a stretch length, derive the
// base/tip radii of the round cone that has EXACTLY the same volume as the
// original ball. `law` picks which of the two parameterizations above does it;
// SHAPE_TAPER is legacy-save-only (see the shape-law block at the top).
export function coneShape(restRadius, length, law = SHAPE_BLUNT) {
  if (!(length > 0)) return { ra: restRadius, rb: restRadius }; // exact ball, no root-find needed
  if (law !== SHAPE_TAPER) return bluntShape(restRadius, length);
  const u = clamp(length / (MAX_STRETCH * restRadius), 0, 1);
  const target = sphereVolume(restRadius);
  // The shoulder gives up a little girth as the limb is drawn out — it has to,
  // or nothing about the lobe could change shape at all: with ra pinned at
  // restRadius the ONLY volume-conserving cone is the degenerate one whose tip
  // sphere sits entirely inside the base sphere, i.e. the original ball with an
  // invisible tip, and the limb would refuse to emerge until the pull passed a
  // full rest radius. Linear in u, so the shoulder is still at 95% of rest by
  // the time the limb is nearly half drawn out.
  const ra = restRadius * (1 - (1 - SHOULDER_KEEP) * u);
  // The tip can never be fatter than the shoulder, and can never be so thin
  // that the tip sphere retreats inside the base sphere (that lower bound,
  // max(0, ra - length), is exactly the `length >= |ra - rb|` domain the
  // round-cone hull — and roundConeVolume with it — is only valid on). Volume
  // is strictly increasing in rb across that whole interval and the interval
  // brackets the target at both ends, so bisection cannot fail to converge.
  const tipFloor = Math.max(0, ra - length);
  if (roundConeVolume(ra, tipFloor, length) <= target) {
    let lo = tipFloor;
    let hi = ra;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (roundConeVolume(ra, mid, length) < target) lo = mid; else hi = mid;
    }
    return { ra, rb: (lo + hi) / 2 };
  }
  // Past the tip-travel cap the shoulder can no longer hold the volume even
  // with a zero-radius tip, so the shoulder has to give as well. Only reachable
  // when something hands coneShape() a length beyond MAX_STRETCH * restRadius —
  // stretch() clamps, but a re-aspected save can carry a lobe whose stretch
  // vector out-grew its shrunken radius. Solving for ra at rb = 0 is EXACTLY
  // continuous with the branch above (they meet where that branch's answer is
  // rb = 0), so a limb crossing the handoff never pops.
  let lo = 1e-9 * restRadius;
  let hi = ra;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (roundConeVolume(mid, 0, length) < target) lo = mid; else hi = mid;
  }
  return { ra: (lo + hi) / 2, rb: 0 };
}

// --- Reshaping geometry (pure) ----------------------------------------------
// A reshaped mass needs NO extra state anywhere — not in shading(), not in the
// renderer, not in a save file. Its rest radius is the volume of clay it is
// made of and its stretch vector is where it currently points; everything else
// falls out of the law above. That is why the donor ledger the additive model
// carried (a per-pull weights map, a lost-volume table, a budget solve and two
// kinds of refusal) is simply gone: elongation is self-donation, and
// self-donation costs nothing to track.

/**
 * How elongated a lobe is, 0 (ball) to 1 (fully drawn out). The single number
 * the shape law, the branch decision and the settle's relax all key off.
 */
export function elongation(restRadius, length, law = SHAPE_BLUNT) {
  return clamp((Number(length) || 0) / maxLengthFor(restRadius, law), 0, 1);
}

/**
 * The rest radius a ball of volume V has. Used everywhere clay is transferred
 * between masses, so the conversion lives in exactly one place.
 */
export function radiusForVolume(volume) {
  return Math.cbrt((Math.max(volume, 0) * 3) / (4 * Math.PI));
}

// --- The union field, CPU side ----------------------------------------------
// A faithful port of lobes-three.js's lobeDistance/mapDistance, evaluated off
// the same shading() feed the shader is handed. Written against shading()
// rather than against the raw records on purpose: it means the surface a
// pointer lands on is the surface that was DRAWN — ground cut, contact squash,
// landing impact and all — instead of a cheaper stand-in that would put a
// child's arm somewhere other than where they touched.

function smoothMin(a, b, k) {
  const h = clamp(0.5 + 0.5 * (a - b) / k, 0, 1);
  return (a + (b - a) * h) - k * h * (1 - h);
}
function smoothMax(a, b, k) { return -smoothMin(-a, -b, k); }

// iq's round cone, with the base at the origin and the tip at (bx,by,bz).
// Same two degeneracy guards, in the same order, as the GLSL version.
function sdRoundConeLocal(px, py, pz, bx, by, bz, r1, r2) {
  const l2 = bx * bx + by * by + bz * bz;
  if (l2 < 1e-8) return Math.sqrt(px * px + py * py + pz * pz) - r1;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  if (a2 <= 0) return Math.sqrt(px * px + py * py + pz * pz) - Math.max(r1, r2);
  const il2 = 1 / l2;
  const y = px * bx + py * by + pz * bz;
  const z = y - l2;
  const xvx = px * l2 - bx * y;
  const xvy = py * l2 - by * y;
  const xvz = pz * l2 - bz * y;
  const x2 = xvx * xvx + xvy * xvy + xvz * xvz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

/**
 * One shading() entry evaluated at a point, in its OWN material frame: the raw
 * (un-blended, un-ground-cut, un-displaced) distance, the local point the
 * surface noise is sampled at, and the taper's local radius there. Split out
 * of shadeDistance() because the noise needs all three and re-deriving the
 * frame a second time per lobe per march step is exactly the cost this file
 * cannot afford.
 */
export function shadeSample(s, px, py, pz) {
  let axisX = s.deformX;
  let axisY = s.deformY;
  let deform = s.deform;
  if (axisX * axisX + axisY * axisY < 1e-4) { axisX = 1; axisY = 0; deform = 0; }
  const axialScale = clamp(1 - deform, 0.6, 1.4);
  const bulgeScale = 1 / Math.sqrt(axialScale);
  const scaleMin = Math.min(axialScale, bulgeScale);
  const perpX = -axisY, perpY = axisX;
  const ox = px - s.x, oy = py - s.y, oz = pz - s.z;
  const lx = (ox * axisX + oy * axisY) / axialScale;
  const ly = (ox * perpX + oy * perpY) / bulgeScale;
  const lz = oz / bulgeScale;
  const tx = s.tipX - s.x, ty = s.tipY - s.y, tz = s.tipZ - s.z;
  const blx = (tx * axisX + ty * axisY) / axialScale;
  const bly = (tx * perpX + ty * perpY) / bulgeScale;
  const blz = tz / bulgeScale;
  const d = sdRoundConeLocal(lx, ly, lz, blx, bly, blz, s.radius, s.tipRadius) * scaleMin;
  const l2 = blx * blx + bly * bly + blz * blz;
  const t = l2 > 1e-8 ? clamp((lx * blx + ly * bly + lz * blz) / l2, 0, 1) : 0;
  return { d, lx, ly, lz, rLocal: s.radius + (s.tipRadius - s.radius) * t };
}

/** One shading() entry's own (un-blended, un-ground-cut) distance at a point. */
export function shadeDistance(s, px, py, pz) {
  return shadeSample(s, px, py, pz).d;
}

/**
 * The same distance with the hand-worked displacement applied — the surface
 * the renderer actually DRAWS, and therefore the one a pointer must be traced
 * against. Falls back to the exact analytic distance when the entry carries no
 * noise (a rasterizer-only field, or noise deliberately off), so nothing that
 * does not opt in pays for it.
 */
export function shadeDistanceOrganic(s, px, py, pz) {
  const k = shadeSample(s, px, py, pz);
  const amp = s.noiseAmp;
  if (!(amp > 0)) return k.d;
  const reach = Math.max(k.rLocal * NOISE_FALLOFF, 1e-6);
  if (Math.abs(k.d) >= reach) return k.d; // outside the band the falloff is exactly 0
  const scale = NOISE_FREQ / Math.max(s.restRadius, 1e-6);
  const wave = noiseWave(k.lx * scale, k.ly * scale, k.lz * scale, s.noisePhase);
  return k.d - amp * k.rLocal * wave * (1 - smoothstep01(Math.abs(k.d) / reach));
}

// A lobe record's cone in world space: base point a, tip point b = a + s,
// and the (ra, rb) that keep it volume-exact. Shared by contactAmount (which
// must work on bare records with no stretch fields) and the field internals.
function deriveCone(record) {
  const ax = record.x, ay = record.y, az = record.z || 0;
  const sx = record.sx || 0, sy = record.sy || 0, sz = record.sz || 0;
  const length = Math.sqrt(sx * sx + sy * sy + sz * sz);
  const { ra, rb } = coneShape(record.radius, length, lawOf(record));
  return { ax, ay, az, bx: ax + sx, by: ay + sy, bz: az + sz, ra, rb, length };
}

// Which shape law a record obeys. Defaults to the live one, so a bare
// {x,y,radius} object handed to contactAmount() by a caller that knows nothing
// about laws (blob-lobes.js's landing scan does exactly that) behaves like new
// clay rather than like a legacy save.
function lawOf(record) {
  return record && record.law === SHAPE_TAPER ? SHAPE_TAPER : SHAPE_BLUNT;
}

// The (ra, rb, length, maxLength) of a record, in one call. Every internal
// coneShape() call site goes through this so the law can never be forgotten at
// one of them — which is exactly how a legacy creature would silently morph.
function shapeOf(record) {
  const length = Math.hypot(record.sx || 0, record.sy || 0, record.sz || 0);
  const law = lawOf(record);
  const { ra, rb } = coneShape(record.radius, length, law);
  return { ra, rb, length, law, maxLength: maxLengthFor(record.radius, law) };
}

// Closest points between two line SEGMENTS (Ericson, "Real-Time Collision
// Detection", ClosestPtSegmentSegment). Returns the parameter along each
// segment (0..1) and the two closest points. Robust to either or both
// segments degenerating to a single point (zero stretch), which is the
// common case here and must reduce to plain point-vs-point distance.
function closestPointSegmentSegment(p1, q1, p2, q2) {
  const EPS = 1e-12;
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z; // |seg1|^2
  const e = d2x * d2x + d2y * d2y + d2z * d2z; // |seg2|^2
  const f = d2x * rx + d2y * ry + d2z * rz;

  let s, t;
  if (a <= EPS && e <= EPS) {
    s = 0; t = 0; // both segments are points: nothing to project along
  } else if (a <= EPS) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= EPS) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  return {
    s, t,
    c1: { x: p1.x + d1x * s, y: p1.y + d1y * s, z: p1.z + d1z * s },
    c2: { x: p2.x + d2x * t, y: p2.y + d2y * t, z: p2.z + d2z * t },
  };
}

// Generalizes the lab's 2D contactAmount() to cone-vs-cone in 3D. Pure, so
// the test can hit it without a field, and works unchanged on bare
// {x,y,z,radius} objects (no sx/sy/sz => a zero-length segment, i.e. a
// plain ball) — with both records unstretched this reduces EXACTLY to the
// old point-vs-point formula, since the closest-segment-point parameters
// collapse to s=t=0 and ra/rb collapse to radius. `tuning` lets a field
// reuse its own contactReach/contactSpan.
export function contactAmount(a, b, tuning = {}) {
  const contactReach = tuning.contactReach ?? DEFAULTS.contactReach;
  const contactSpan = tuning.contactSpan ?? DEFAULTS.contactSpan;
  const A = deriveCone(a);
  const B = deriveCone(b);
  const { s, t, c1, c2 } = closestPointSegmentSegment(
    { x: A.ax, y: A.ay, z: A.az }, { x: A.bx, y: A.by, z: A.bz },
    { x: B.ax, y: B.ay, z: B.az }, { x: B.bx, y: B.by, z: B.bz },
  );
  const dx = c1.x - c2.x, dy = c1.y - c2.y, dz = c1.z - c2.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  // Local radius at the closest point on each cone, linearly interpolated
  // along its taper — a stretched tip is thinner, so it only "reaches" as
  // far as its own local radius, not the lobe's full rest radius.
  const radiusA = A.ra + (A.rb - A.ra) * s;
  const radiusB = B.ra + (B.rb - B.ra) * t;
  const radiusSum = radiusA + radiusB;
  if (radiusSum <= 0) return 0;
  return clamp((radiusSum * contactReach - dist) / (radiusSum * contactSpan), 0, 1);
}

// Order-independent so a fusion recorded as (a,b) is found looking up (b,a).
// Also the exact string toJSON()/fromJSON() persist, so keep this stable.
export function pairKey(idA, idB) {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

function cloneRecord(record) {
  return { ...record };
}

export function createLobeField(options = {}) {
  const opts = {
    contactReach: Number(options.contactReach) || DEFAULTS.contactReach,
    contactSpan: Number(options.contactSpan) || DEFAULTS.contactSpan,
    fuseThreshold: Number(options.fuseThreshold) || DEFAULTS.fuseThreshold,
    neckSlack: Number(options.neckSlack) || DEFAULTS.neckSlack,
    constrainIterations: Math.max(1, Math.round(Number(options.constrainIterations) || DEFAULTS.constrainIterations)),
  };
  const maxLobes = clamp(Math.round(Number(options.maxLobes) || DEFAULTS.maxLobes), 1, MAX_LOBES);

  const lobes = new Map();   // id -> record, Map preserves insertion order for free
  const fused = new Set();   // pairKey strings; membership is permanent
  // pairKey -> the contact amount that weld is HELD to. Set the instant a pair
  // fuses and ratcheted up (never down, and never past WELD_FLOOR_CAP) as the
  // settle presses the join shut, so a weld that has taken its set cannot
  // afterwards be levered back open to the hairline it started as. Derived, not
  // persisted: a saved creature's welds are held to what they measure on load,
  // which is what keeps the save format at v4 and every old file loading
  // byte-identically.
  const weldFloor = new Map();
  const impacts = new Map(); // id -> {axisX, axisY, amount}; transient, never persisted
  // The one live reshaping gesture, or null. There is never more than one — a
  // second finger is a second gesture and this toy is deliberately
  // single-pointer — and it holds a full geometry SNAPSHOT of everything it
  // may touch, taken the moment the gesture starts.
  //
  // That snapshot is the whole replacement for the additive model's donor
  // ledger, and it is a much smaller thing to be right about. Every frame of a
  // drag recomputes the entire result FROM the snapshot rather than from the
  // previous frame, so pushing a mass back where it came from restores it
  // bit-exactly, and cancelling restores it by simply writing the snapshot
  // back. There is nothing to accumulate drift into and nothing to leak.
  let gesture = null;
  let groundY = null;        // world y of the ground plane; null = off
  let autoCounter = 0;
  let noiseSeed = DEFAULT_NOISE_SEED;
  // id -> {x,y,z} phase triple, memoized off (noiseSeed, id). Cleared whenever
  // the seed changes; entries are cheap and there are at most MAX_LOBES.
  const phases = new Map();
  // The live settle, if one is running: two geometry snapshots and a 0..1
  // parameter between them. `to` is computed ONCE, up front, from `from` — the
  // end state can therefore never depend on how many frames the browser
  // happened to deliver, which is what makes it safe to save and to assert on.
  let settle = null;

  function phaseOf(id) {
    let entry = phases.get(id);
    if (!entry) { entry = noisePhase(id, noiseSeed); phases.set(id, entry); }
    return entry;
  }

  // How deep this lobe sits in the table, as a fraction of its base radius. A
  // lobe that has taken its set sits a little deeper than one that has just
  // landed — that extra bite is what widens the flat contact patch and reads
  // as the mass spreading. Carried per-lobe so every ground clamp, donor
  // recompute and re-seat agrees with the settled height instead of fighting
  // it.
  function sinkOf(record) {
    return SINK + SETTLE_SINK * clamp(record.settled || 0, 0, 1);
  }

  // Is this mass sitting on the table right now (as opposed to stacked on
  // other clay, or in the air)?
  function restingOnGround(record) {
    if (groundY === null) return false;
    const { ra } = shapeOf(record);
    return record.y <= groundY + ra * (1 - sinkOf(record)) + 1e-9;
  }

  // Lifts a record clear of the ground plane, in place. Only touches `y`
  // (base) and `sy` (stretch vector's y component) — never sx/sz, so a tip
  // resting on the table keeps its horizontal position and just slides its
  // height up to the surface instead of being dragged back toward the base.
  function applyGroundClamp(record) {
    if (groundY === null) return;
    const length = Math.hypot(record.sx || 0, record.sy || 0, record.sz || 0);
    const { ra, rb } = coneShape(record.radius, length, lawOf(record));
    const sink = sinkOf(record);
    const baseMin = groundY + ra * (1 - sink);
    if (record.y < baseMin) record.y = baseMin;
    const tipMin = groundY + rb * (1 - sink);
    const tipY = record.y + (record.sy || 0);
    if (tipY < tipMin) record.sy = tipMin - record.y;
  }

  // stretch() must never move the base (that's the whole contract of "the
  // base is the welded/anchored end"), so it only ever gets the tip half of
  // the ground clamp — never the base-y half applyGroundClamp() also does.
  function applyGroundClampTip(record) {
    if (groundY === null) return;
    const length = Math.hypot(record.sx, record.sy, record.sz);
    const { rb } = coneShape(record.radius, length, lawOf(record));
    const tipMin = groundY + rb * (1 - sinkOf(record));
    const tipY = record.y + record.sy;
    if (tipY < tipMin) record.sy = tipMin - record.y;
  }

  // --- Clay accounting ------------------------------------------------------
  // Under the reshaping model there is no ledger. A lobe's `radius` IS how much
  // clay it is made of; transfers between lobes are permanent and immediate,
  // and the only thing that has to be remembered is a floor. What made the
  // additive model need bookkeeping was that a protrusion's volume was on loan
  // and had to be given back; nothing is on loan any more, because elongation
  // spends a mass's own volume on its own new shape.

  // The smallest a lobe may ever be thinned to by giving clay away — a fixed
  // fraction of the size it was BORN at, so a body cannot be hollowed out
  // however many branches come off it. `baseRadius` is that birth size and is
  // never rewritten after creation; `radius` is what the lobe is now.
  function floorRadiusOf(record) {
    return record.baseRadius * DONOR_FLOOR;
  }

  // Volume this lobe could still give away before hitting its floor. Reaching
  // zero here REFUSES NOTHING — the gesture that wanted the clay simply takes
  // less and goes on reshaping, which is the difference between clay that
  // resists and a toy that says no.
  function donorHeadroom(record) {
    return Math.max(0, sphereVolume(record.radius) - sphereVolume(floorRadiusOf(record)));
  }

  // Resizes a lobe in place, re-seating it on the table if it was resting on
  // it. A lobe that shrank where it stood would be left floating a few pixels
  // clear (the ground cut is only SINK deep, so it would lose its flat contact
  // patch entirely and the body would stop reading as resting on the wood),
  // and one that grew would sink into it. Spawned lobes deliberately do NOT
  // get the base half of this: their base is planted UNDER the surface of
  // whatever they grew out of, and lifting it to the plane would tear the weld
  // open.
  function setRadius(record, next) {
    if (!(next > 0) || next === record.radius) return;
    const length = Math.hypot(record.sx || 0, record.sy || 0, record.sz || 0);
    const law = lawOf(record);
    const raBefore = coneShape(record.radius, length, law).ra;
    const raAfter = coneShape(next, length, law).ra;
    const sink = sinkOf(record);
    const wasResting = groundY !== null && record.kind !== PULL_KIND
      && record.y <= groundY + raBefore * (1 - sink) + 1e-9;
    record.radius = next;
    if (wasResting) record.y = groundY + raAfter * (1 - sink);
    applyGroundClamp(record);
  }

  // Draws `volume` out of the clay welded around `takerId`, weighted by how
  // hard each neighbour is pressed against it, and returns how much was
  // actually raised. Best-effort by contract: a lump with nothing left to give
  // gives nothing and the caller carries on. Never touches the taker, never
  // touches clay that is not welded into the same lump, and never pushes a
  // donor under its floor.
  function drawFromNeighbours(takerId, volume) {
    if (!(volume > 0)) return 0;
    const taker = lobes.get(takerId);
    if (!taker) return 0;
    const donors = [];
    let totalWeight = 0;
    for (const partnerId of partnersOf(takerId)) {
      const partner = lobes.get(partnerId);
      if (!partner) continue;
      // A live gesture may only draw from clay it can put back. Anything it
      // touches is captured pristine on the first frame it is touched; a lobe
      // that somehow got past that is skipped rather than integrated.
      if (gesture) {
        captureForGesture(partnerId);
        if (!gesture.snapshot.has(partnerId)) continue;
      }
      const headroom = donorHeadroom(partner);
      if (headroom <= 0) continue;
      const weight = Math.max(contactAmount(taker, partner, opts), 1e-3);
      donors.push({ record: partner, headroom, weight });
      totalWeight += weight;
    }
    if (!donors.length) return 0;
    let raised = 0;
    for (const donor of donors) {
      const want = volume * (donor.weight / totalWeight);
      const give = Math.min(want, donor.headroom);
      if (give <= 0) continue;
      setRadius(donor.record, radiusForVolume(sphereVolume(donor.record.radius) - give));
      raised += give;
    }
    return raised;
  }

  // A pair only ever gains fusion here, never loses it — that permanence is
  // the whole point of "implicit clay" (a pinch stays pinched once you let go).
  // What is new is that fusing now also records the geometry it fused AT, which
  // is the constraint every later morph is held to.
  function evaluateFusion(changedId) {
    const changed = lobes.get(changedId);
    if (!changed) return [];
    const newlyFused = [];
    for (const other of lobes.values()) {
      if (other.id === changedId) continue;
      const key = pairKey(changedId, other.id);
      if (fused.has(key)) continue;
      const contact = contactAmount(changed, other, opts);
      if (contact > opts.fuseThreshold) {
        fused.add(key);
        noteWeldFloor(key, contact);
        newlyFused.push(key);
      }
    }
    return newlyFused;
  }

  // The floor a weld is held to, ratcheted upward only and capped. Upward-only
  // is safe precisely BECAUSE of the cap: it converges to WELD_FLOOR_CAP and
  // stays there, so it is a fixed point like everything else in the settle and
  // not a slow tightening that could eventually freeze a creature solid.
  function noteWeldFloor(key, contact) {
    const prev = weldFloor.get(key) ?? 0;
    const next = Math.min(WELD_FLOOR_CAP, Math.max(prev, contact));
    if (next > prev) weldFloor.set(key, next);
  }

  function weldFloorOf(idA, idB) {
    return weldFloor.get(pairKey(idA, idB)) ?? opts.fuseThreshold;
  }

  // Every weld this creature has, re-measured. Called once at the end of a
  // settle (the join has just been pressed shut, so this is where the ratchet
  // earns its keep) and once on load.
  function noteAllWeldFloors() {
    for (const key of fused) {
      const [a, b] = key.split('|');
      const ra = lobes.get(a);
      const rb = lobes.get(b);
      if (!ra || !rb) continue;
      noteWeldFloor(key, contactAmount(ra, rb, opts));
    }
  }

  /**
   * WHERE ALONG ITS OWN AXIS this mass is held, 0 at the base end and 1 at the
   * tip end, contact-weighted across every weld — or null if nothing holds it.
   *
   * This is the input to the anchor decision, and it is the whole of Fix B's
   * first half: a mass rooted at s ~ 0 pivots about its base whichever end the
   * finger is nearer, so the root cannot be swung out of the body.
   */
  function weldParam(record, from) {
    const partnerIds = partnersOf(record.id);
    if (!partnerIds.length) return null;
    const probe = {
      x: from.x, y: from.y, z: from.z,
      sx: from.sx, sy: from.sy, sz: from.sz,
      radius: from.radius, law: lawOf(record),
    };
    const A = deriveCone(probe);
    let sum = 0;
    let weight = 0;
    for (const partnerId of partnerIds) {
      const partner = lobes.get(partnerId);
      if (!partner) continue;
      const c = contactAmount(probe, partner, opts);
      if (!(c > 0)) continue;
      const B = deriveCone(partner);
      const { s } = closestPointSegmentSegment(
        { x: A.ax, y: A.ay, z: A.az }, { x: A.bx, y: A.by, z: A.bz },
        { x: B.ax, y: B.ay, z: B.az }, { x: B.bx, y: B.by, z: B.bz },
      );
      sum += s * c;
      weight += c;
    }
    return weight > 0 ? sum / weight : null;
  }

  /**
   * Fix B's second half: slide `record` — rigidly, keeping every bit of the
   * shape the child just pulled — back along the line to each welded neighbour
   * until their contact is at or above its floor.
   *
   * SLIDING IS WHY THIS FEELS LIKE CLAY. A clamp on the gesture would stop the
   * finger dead against an invisible wall. Sliding instead lets the mass keep
   * exactly the length and direction the drag asked for and roots it deeper
   * into the body to pay for it, so what the child feels as they approach the
   * constraint is the material running out from under them: the tip follows
   * more and more slowly as more and more of the travel is spent burrowing, and
   * it saturates smoothly rather than stopping.
   */
  // Everything planted in this mass, however many spawns deep. A branch is made
  // OF the mass it came out of, so when that mass is slid deeper into the body
  // its branches go with it — the alternative is a limb left hanging in the air
  // where its parent used to be.
  function rootedOn(id) {
    const out = [];
    for (const record of lobes.values()) {
      if (record.kind !== PULL_KIND) continue;
      let cursor = record;
      for (let hops = 0; cursor && hops < MAX_LOBES; hops++) {
        if (cursor.root === id) { out.push(record); break; }
        cursor = cursor.root ? lobes.get(cursor.root) : null;
        if (!cursor || cursor.kind !== PULL_KIND) break;
      }
    }
    return out;
  }

  // The welds that CONSTRAIN a mass, as opposed to the ones it carries with it.
  // A mass's own branches ride along (see rootedOn) and so can never be the
  // reason it may not move; asking them to hold it in place as well would be
  // asking it to satisfy constraints it is itself the anchor of, which is
  // over-determined and simply oscillates.
  function bindingPartners(id) {
    return partnersOf(id).filter((partnerId) => {
      const partner = lobes.get(partnerId);
      return partner && !(partner.kind === PULL_KIND && partner.root === id);
    });
  }

  function bedWelds(record) {
    const partnerIds = bindingPartners(record.id);
    if (!partnerIds.length) return false;
    const riders = rootedOn(record.id);
    let corrected = false;
    for (let iter = 0; iter < WELD_ITERS; iter++) {
      let moved = false;
      for (const partnerId of partnerIds) {
        const partner = lobes.get(partnerId);
        if (!partner) continue;
        const floor = weldFloorOf(record.id, partnerId);
        if (contactAmount(record, partner, opts) >= floor - WELD_TOL) continue;
        const A = deriveCone(record);
        const B = deriveCone(partner);
        const { s, t, c1, c2 } = closestPointSegmentSegment(
          { x: A.ax, y: A.ay, z: A.az }, { x: A.bx, y: A.by, z: A.bz },
          { x: B.ax, y: B.ay, z: B.az }, { x: B.bx, y: B.by, z: B.bz },
        );
        const radiusSum = (A.ra + (A.rb - A.ra) * s) + (B.ra + (B.rb - B.ra) * t);
        if (!(radiusSum > 0)) continue;
        // The separation at which contact is exactly the floor — invert
        // contactAmount, which is linear in the separation over its span.
        const need = radiusSum * (opts.contactReach - floor * opts.contactSpan);
        let dx = c1.x - c2.x, dy = c1.y - c2.y, dz = c1.z - c2.z;
        const dist = Math.hypot(dx, dy, dz);
        const close = dist - need;
        if (!(close > 0) || dist < 1e-9) continue;
        dx /= dist; dy /= dist; dz /= dist;
        const wasX = record.x, wasY = record.y, wasZ = record.z;
        record.x -= dx * close; record.y -= dy * close; record.z -= dz * close;
        // Burrowing into a neighbour must never burrow into the TABLE. Only the
        // base half of the ground clamp is applied here: pushing the tip up
        // would change the shape the child pulled, which is the one thing this
        // pass exists not to do.
        if (groundY !== null && record.kind !== PULL_KIND) {
          const { ra } = shapeOf(record);
          const baseMin = groundY + ra * (1 - sinkOf(record));
          if (record.y < baseMin) record.y = baseMin;
        }
        // ...and whatever is planted in this mass goes with it, by exactly the
        // movement that actually happened rather than the one that was asked
        // for, so a branch cannot be left behind by a ground clamp.
        const moveX = record.x - wasX, moveY = record.y - wasY, moveZ = record.z - wasZ;
        for (const rider of riders) { rider.x += moveX; rider.y += moveY; rider.z += moveZ; }
        moved = true;
        corrected = true;
      }
      if (!moved) break;
    }
    return corrected;
  }

  /** How far the worst of this mass's welds is below its floor. 0 = all held. */
  function weldDeficit(record) {
    let worst = 0;
    for (const partnerId of bindingPartners(record.id)) {
      const partner = lobes.get(partnerId);
      if (!partner) continue;
      const short = weldFloorOf(record.id, partnerId) - contactAmount(record, partner, opts);
      if (short > worst) worst = short;
    }
    return worst;
  }

  /**
   * WHERE THE MATERIAL RUNS OUT. Sliding the mass deeper (bedWelds) holds one
   * weld perfectly and two welds only sometimes: a mass bedded between two
   * neighbours cannot move toward both of them at once, and elongating it thins
   * it, which costs contact at BOTH ends however it is positioned. Past that
   * point the only honest answer is that there is not enough clay to make a
   * limb that long and keep the joins — so the length gives, not the joins.
   *
   * `place(L)` re-aims the mass at length L, re-seats it on the table and beds
   * its welds; this finds the longest L those welds survive. Doing it as a
   * bisection rather than a clamp is what makes it feel like clay: the boundary
   * moves continuously as the finger moves, so the limb goes on responding —
   * turning, thickening, rooting deeper — while its LENGTH asymptotes. The
   * child feels the material run out from under them rather than the gesture
   * hit glass. A mass with no welds never enters the search at all.
   */
  function holdWelds(record, place, wanted) {
    let length = place(wanted);
    if (weldDeficit(record) <= WELD_TOL) return length;
    // Nothing to be gained if even a bare ball at the anchor cannot hold them:
    // take the length the child asked for and let bedWelds do what it can.
    if (place(0), weldDeficit(record) > WELD_TOL) return place(wanted);
    let lo = 0, hi = wanted;
    for (let i = 0; i < WELD_BISECT; i++) {
      const mid = (lo + hi) / 2;
      place(mid);
      if (weldDeficit(record) <= WELD_TOL) lo = mid; else hi = mid;
    }
    return place(lo);
  }

  /** The weakest weld on the creature, as a fraction of its own floor. */
  function weldState() {
    const out = [];
    for (const key of fused) {
      const [a, b] = key.split('|');
      const ra = lobes.get(a);
      const rb = lobes.get(b);
      if (!ra || !rb) continue;
      const floor = weldFloor.get(key) ?? opts.fuseThreshold;
      out.push({ pair: key, floor, contact: contactAmount(ra, rb, opts) });
    }
    return out;
  }

  function partnersOf(id) {
    const result = [];
    for (const key of fused) {
      const [a, b] = key.split('|');
      if (a === id) result.push(b);
      else if (b === id) result.push(a);
    }
    return result;
  }

  // Projects `pos` onto the sphere of radius `limit` around a stationary
  // partner, only when it has strayed past it. Exact (not iterative), so a
  // single-partner drag converges to machine precision in one pass.
  function clampToPartner(pos, partner, limit) {
    const dx = pos.x - partner.x;
    const dy = pos.y - partner.y;
    const dz = pos.z - partner.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist <= limit || dist === 0) return pos; // 0-length: no direction to project along
    const scale = limit / dist;
    return { x: partner.x + dx * scale, y: partner.y + dy * scale, z: partner.z + dz * scale };
  }

  // Multiple fused partners can each demand a different projection, so no
  // single pass satisfies all of them exactly. Gauss-Seidel — resolve one
  // partner, carry the corrected point into the next — converges toward a
  // position that respects every constraint as well as the geometry allows.
  // The limit now uses each side's DERIVED base radius (ra), not restRadius,
  // so a stretched-thin lobe gets a correspondingly shorter leash — for an
  // unstretched lobe ra === radius exactly, so this is a no-op change there.
  function restrainToPartners(id, pos) {
    const partnerIds = partnersOf(id);
    if (partnerIds.length === 0) return pos;
    const moving = lobes.get(id);
    const movingLength = Math.hypot(moving.sx || 0, moving.sy || 0, moving.sz || 0);
    const movingRa = coneShape(moving.radius, movingLength, lawOf(moving)).ra;
    let result = pos;
    for (let iter = 0; iter < opts.constrainIterations; iter++) {
      for (const partnerId of partnerIds) {
        const partner = lobes.get(partnerId);
        if (!partner) continue;
        const partnerLength = Math.hypot(partner.sx || 0, partner.sy || 0, partner.sz || 0);
        const partnerRa = coneShape(partner.radius, partnerLength, lawOf(partner)).ra;
        const limit = (movingRa + partnerRa) * opts.neckSlack;
        result = clampToPartner(result, partner, limit);
      }
    }
    return result;
  }

  function add(spec = {}) {
    if (lobes.size >= maxLobes) return null;
    const radius = Number(spec.radius);
    if (!(radius > 0)) return null;
    let id = spec.id;
    if (id !== undefined && id !== null) {
      id = String(id);
      if (lobes.has(id)) return null;
    } else {
      do {
        autoCounter += 1;
        id = `lobe-${autoCounter}`;
      } while (lobes.has(id));
    }
    const x = Number(spec.x);
    const y = Number(spec.y);
    const z = spec.z === undefined ? 0 : Number(spec.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    const sx = spec.sx === undefined ? 0 : Number(spec.sx);
    const sy = spec.sy === undefined ? 0 : Number(spec.sy);
    const sz = spec.sz === undefined ? 0 : Number(spec.sz);
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz)) return null;
    const record = {
      id,
      kind: spec.kind != null ? String(spec.kind) : 'lobe',
      x, y, z, radius, sx, sy, sz,
      // The size this lobe was BORN at. `radius` is what it is made of now;
      // this is the constant its give-away floor is measured against, and it is
      // never rewritten (except upward by a merge, which genuinely makes a
      // bigger mass).
      baseRadius: radius,
      // Which shape law derives this lobe's (ra, rb). New clay is always
      // SHAPE_BLUNT; only a pre-v4 save stamps SHAPE_TAPER (see fromJSON).
      law: spec.law === SHAPE_TAPER ? SHAPE_TAPER : SHAPE_BLUNT,
      root: spec.root != null ? String(spec.root) : null,
      // Freshly dropped clay has not taken its set; the settle after it lands
      // ramps this to 1 and it stays there.
      settled: 0,
      // Whether this mass belongs on the table. Set the moment it comes to rest
      // on the ground plane and never cleared, because a lump of clay that has
      // been put down does not stop being a thing that sits on the table just
      // because it got worked. Under the additive model this was inferred from
      // the CURRENT height every time it was needed, which was fine while
      // nothing could move a welded ball; under reshaping a drag re-anchors a
      // mass on its far end, so a body can climb off the turntable one gesture
      // at a time and — because a ground clamp only ever pushes UP — never come
      // back down. Carrying the fact fixes that: the settle re-seats it.
      grounded: false,
      // The length this mass had when it last took its set. The relax below
      // never goes under it, which is what stops a run of tiny adjustments
      // from eroding a limb one four-and-a-half percent at a time.
      setLength: 0,
      // Fresh WORK waiting to relax: 1 means the next settle has something to
      // slump. Driven to 0 by that settle, and back to 1 by the next gesture
      // that reshapes this clay — which is what makes the settle fire visibly
      // after every release without any of its effects compounding.
      slack: 1,
      // Radians of droop this lobe has already given, out of a lifetime
      // budget. Monotonic, so a limb worked forty times still slumps once.
      droopGiven: 0,
      color: typeof spec.color === 'string' && spec.color ? spec.color : '#7c7c7c',
    };
    applyGroundClamp(record);
    record.grounded = restingOnGround(record);
    // New clay is the child's next action, so whatever the last gesture made
    // has stopped being the thing they are making. See bestMergePair.
    for (const other of lobes.values()) other.justMade = false;
    lobes.set(id, record);
    evaluateFusion(id);
    return cloneRecord(record);
  }

  /**
   * Takes a lobe out of the field. The clay goes with it — there is no ledger
   * to refund any more, because a mass's `radius` IS its clay and whatever it
   * gave to a neighbour was given permanently. `inheritTo` is the lobe anything
   * rooted on the departing one should re-root to (a merge hands the surviving
   * mass); by default they inherit whatever IT was planted in, so a dangling
   * `root` can never strand a branch outside the settle's anchor walk.
   */
  function removeLobe(id, inheritTo) {
    const record = lobes.get(id);
    if (!record) return false;
    const inheritedRoot = inheritTo !== undefined ? inheritTo : (record.root || null);
    lobes.delete(id);
    impacts.delete(id);
    for (const key of fused) {
      const [a, b] = key.split('|');
      if (a === id || b === id) { fused.delete(key); weldFloor.delete(key); }
    }
    for (const other of lobes.values()) if (other.root === id) other.root = inheritedRoot;
    if (gesture) {
      gesture.scope.delete(id);
      gesture.snapshot.delete(id);
    }
    return true;
  }

  function remove(id) { return removeLobe(id); }

  function clear() {
    lobes.clear();
    fused.clear();
    weldFloor.clear();
    impacts.clear();
    gesture = null;
    settle = null;
    autoCounter = 0;
  }

  function get(id) {
    const record = lobes.get(id);
    return record ? cloneRecord(record) : null;
  }

  function list() { return [...lobes.values()].map(cloneRecord); }
  function count() { return lobes.size; }
  function has(id) { return lobes.has(id); }

  function setGround(worldY) {
    if (worldY === null || worldY === undefined) { groundY = null; for (const r of lobes.values()) r.grounded = false; return; }
    const n = Number(worldY);
    if (!Number.isFinite(n)) return;
    groundY = n;
    // The plane moved (a resize, or a save being rasterized after it loaded),
    // so which masses belong on it is a fresh question.
    for (const record of lobes.values()) record.grounded = restingOnGround(record);
  }
  function ground() { return groundY; }

  function move(id, x, y, z, { constrain = true } = {}) {
    const record = lobes.get(id);
    const nx = Number(x);
    const ny = Number(y);
    const nz = z === undefined ? (record ? record.z : 0) : Number(z);
    if (!record || !Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) {
      return { moved: false, x: record ? record.x : nx, y: record ? record.y : ny, z: record ? record.z : nz, fused: [] };
    }
    let target = { x: nx, y: ny, z: nz };
    if (constrain) target = restrainToPartners(id, target);
    record.x = target.x;
    record.y = target.y;
    record.z = target.z;
    applyGroundClamp(record);
    record.grounded = record.grounded || restingOnGround(record);
    const newlyFused = evaluateFusion(id);
    // A ball pushed into the body has just made a weld, and a brand new weld is
    // exactly what the settle's press-together exists to close. Without this the
    // join would only ever deepen for a ball that ARRIVED by falling.
    if (newlyFused.length > 0) record.slack = 1;
    return { moved: true, x: record.x, y: record.y, z: record.z, fused: newlyFused };
  }

  // Sets the stretch vector so the tip lands at (or as near as the length
  // cap and ground allow) the given world point. Never moves the base, and
  // deliberately never touches fusion: re-evaluating fusion on every stretch
  // frame would weld a tentacle to whatever it swept past mid-gesture, which
  // is a placement/move concern, not a stretch one. A length of 0 restores
  // an exact ball (sx/sy/sz set to literal 0, not merely a tiny residual).
  function stretch(id, tipX, tipY, tipZ, { clamp: clampLength = true } = {}) {
    const record = lobes.get(id);
    const tx = Number(tipX);
    const ty = Number(tipY);
    // Omitting tipZ means "leave the depth alone", so it defaults to the
    // lobe's OWN z, not world zero. Placement gives every lobe a small z
    // jitter, so defaulting to 0 would tilt a purely horizontal swipe out of
    // the plane and quietly bend the limb away from the camera.
    const tz = tipZ === undefined ? (record ? record.z : 0) : Number(tipZ);
    if (!record || !Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) {
      const length = record ? Math.hypot(record.sx, record.sy, record.sz) : 0;
      return {
        stretched: false,
        length,
        tipX: record ? record.x + record.sx : tx,
        tipY: record ? record.y + record.sy : ty,
        tipZ: record ? record.z + record.sz : tz,
      };
    }
    let dx = tx - record.x;
    let dy = ty - record.y;
    let dz = tz - record.z;
    let length = Math.hypot(dx, dy, dz);
    if (length === 0) {
      record.sx = 0;
      record.sy = 0;
      record.sz = 0;
    } else {
      const cap = maxLengthFor(record.radius, lawOf(record));
      if (clampLength !== false && length > cap) {
        const scale = cap / length;
        dx *= scale; dy *= scale; dz *= scale;
        length = cap; // assign directly rather than re-measuring: keeps the cap exact
      }
      record.sx = dx;
      record.sy = dy;
      record.sz = dz;
    }
    applyGroundClampTip(record);
    return {
      stretched: true,
      length: Math.hypot(record.sx, record.sy, record.sz),
      tipX: record.x + record.sx,
      tipY: record.y + record.sy,
      tipZ: record.z + record.sz,
    };
  }

  // --- Pulling material out of the lump -------------------------------------

  /**
   * The finished union's distance at a point — per-lobe displacement, smooth
   * union, then ground cut, then the raymarch safety scale. A faithful mirror
   * of the GLSL mapDistance(), in that order, because a pull has to root on
   * the surface the child can actually SEE.
   */
  function unionDistance(shaded, px, py, pz) {
    let d = 1000;
    let groundK = 0;
    for (const s of shaded) {
      d = smoothMin(d, shadeDistanceOrganic(s, px, py, pz), Math.max(s.blend, 1e-5));
      if (s.radius * 0.10 > groundK) groundK = s.radius * 0.10;
    }
    // The ground cut runs on the FINISHED union and is a hard plane, so the
    // flat contact patch survives the displacement exactly — only the
    // silhouette above it goes lumpy, which is the point.
    if (groundY !== null) d = smoothMax(d, groundY - py, Math.max(groundK, 1e-4));
    return d * NOISE_SAFETY;
  }

  /**
   * Sphere-traces the union from the camera (orthographic, looking down -z, the
   * same projection lobes-three.js renders with) through the world point
   * (x, y) and reports where the clay surface actually is. This is what makes a
   * pull start AT THE GRAB POINT rather than at some lobe's centre.
   *
   * Returns null on a miss. On a hit: the surface point, its outward normal,
   * the id and colour of the lobe that OWNS that point (the same nearest-raw-
   * distance rule the shader's clayColor uses, minus its cosmetic seam wobble),
   * and the nearest non-protrusion lobe, which is what a pull sizes its grip
   * from.
   */
  function raycast(x, y) {
    const px = Number(x), py = Number(y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    const shaded = shading();
    if (shaded.length === 0) return null;

    let zStart = -Infinity;
    let zEnd = Infinity;
    let refRadius = 0;
    for (const s of shaded) {
      zStart = Math.max(zStart, s.z + s.radius, s.tipZ + s.tipRadius);
      zEnd = Math.min(zEnd, s.z - s.radius, s.tipZ - s.tipRadius);
      refRadius += s.restRadius;
    }
    refRadius = Math.max(refRadius / shaded.length, 1e-4);
    // The blend can push the union a little outside every lobe's own hull, so
    // start the ray in front of the front-most one and end it behind the
    // back-most one rather than exactly on them.
    zStart += refRadius * 0.5;
    zEnd -= refRadius * 0.5;

    const eps = refRadius * 2e-3;
    const minStep = refRadius * 1e-3;
    const travelMax = zStart - zEnd;
    let travel = 0;
    let z = zStart;
    let hit = false;
    for (let i = 0; i < 240; i++) {
      z = zStart - travel;
      const d = unionDistance(shaded, px, py, z);
      if (d < eps) { hit = true; break; }
      travel += Math.max(d, minStep);
      if (travel > travelMax) return null;
    }
    if (!hit) return null;

    // 4-tap tetrahedral normal, same as the shader's, at a step comfortably
    // wider than the tolerance the trace converged to.
    const h = Math.max(eps * 2, refRadius * 3e-3);
    const d1 = unionDistance(shaded, px + h, py - h, z - h);
    const d2 = unionDistance(shaded, px - h, py - h, z + h);
    const d3 = unionDistance(shaded, px - h, py + h, z - h);
    const d4 = unionDistance(shaded, px + h, py + h, z + h);
    let nx = d1 - d2 - d3 + d4;
    let ny = -d1 - d2 + d3 + d4;
    let nz = -d1 + d2 - d3 + d4;
    const nlen = Math.hypot(nx, ny, nz);
    if (nlen > 1e-9) { nx /= nlen; ny /= nlen; nz /= nlen; } else { nx = 0; ny = 0; nz = 1; }

    // Ownership is the nearest raw per-lobe distance, and under additive
    // semantics EVERY lobe is a candidate — an arm is clay like any other clay
    // and a press on one roots a pull there, so there is no longer a second,
    // protrusion-excluding search to disambiguate a "re-grab" from a new pull.
    // There is no such thing as a re-grab.
    let ownerId = null, ownerBest = Infinity;
    let ownerSample = null;
    for (const s of shaded) {
      const sample = shadeSample(s, px, py, z);
      if (sample.d < ownerBest) { ownerBest = sample.d; ownerId = s.id; ownerSample = sample; }
    }
    const owner = lobes.get(ownerId);
    // The local surface radius a pull sizes its shoulder from: the owning
    // lobe's taper radius AT THE GRAB POINT, not its base radius. On an
    // unstretched ball those are the same number, so nothing about pulling
    // from the body changes; along a limb they are not, and using the local
    // one is what makes a chain weld invisibly (the new shoulder comes out the
    // same width as the parent is there) and a branch come off the shaft as
    // thick as the shaft. Divided back out of shading()'s ground compensation,
    // so an arm never comes out fatter just because the ball it grew from
    // happens to be sunk deeper into the turntable.
    let localRadius = refRadius;
    if (owner && ownerSample) {
      const shadedOwner = shaded.find((s) => s.id === ownerId);
      const raShaded = shadedOwner ? shadedOwner.radius : 0;
      const length = Math.hypot(owner.sx || 0, owner.sy || 0, owner.sz || 0);
      const raTrue = coneShape(owner.radius, length, lawOf(owner)).ra;
      const compensation = raShaded > 1e-9 ? raTrue / raShaded : 1;
      localRadius = Math.max(ownerSample.rLocal * compensation, 1e-6);
    }
    return {
      x: px, y: py, z,
      nx, ny, nz,
      lobeId: ownerId,
      color: owner ? owner.color : '#7c7c7c',
      donorId: ownerId,
      donorKind: owner ? owner.kind : null,
      localRadius,
    };
  }

  // Every lobe welded (transitively) to `id`, plus `id` itself. The reach of
  // DONOR_SPREAD: a loose ball sitting off to the side is not part of this
  // lump and must not quietly shrink when clay is drawn out of it.
  function componentOf(id) {
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length) {
      for (const next of partnersOf(queue.pop())) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return seen;
  }

  // --- Reshaping the mass ----------------------------------------------------
  // ONE GESTURE, and it does not add anything. A press-and-drag anywhere on the
  // clay takes hold of the mass under the finger and ELONGATES it in the
  // direction of the drag: the ball becomes an egg, the egg a capsule, and the
  // whole thing narrows as it lengthens because its volume is finite and is
  // being spread over a longer axis. Drag the far end and the stretch
  // continues from the other side. Drag a long shaft sideways and — only then,
  // only because there is no way to express that by reshaping one capsule — a
  // second capsule is spawned out of the first one's clay.
  //
  // NOTHING HERE CAN REFUSE. There is no budget to exhaust (elongation is
  // self-donation), no slot to run out of (reshaping allocates nothing, and a
  // spawn that finds the field full merges two masses to make room, or gives
  // up on spawning and reshapes instead), and no floor that says no (a mass at
  // its minimum thickness simply stops taking more clay and keeps reshaping).
  // The only thing a press can still fail to find is clay, and that is not a
  // refusal — it is empty table.

  // Everything one gesture may touch, captured before it touches any of it.
  // A drag recomputes its whole result from this every frame rather than from
  // the previous frame's numbers, which is what makes push-it-back-and-let-go
  // restore the lump bit-exactly instead of approximately.
  function snapshotOf(ids) {
    const out = new Map();
    for (const id of ids) {
      const record = lobes.get(id);
      if (!record) continue;
      out.set(id, {
        x: record.x, y: record.y, z: record.z,
        sx: record.sx || 0, sy: record.sy || 0, sz: record.sz || 0,
        radius: record.radius, settled: record.settled || 0,
        slack: record.slack || 0, droopGiven: record.droopGiven || 0,
        setLength: record.setLength || 0, grounded: !!record.grounded,
      });
    }
    return out;
  }

  /**
   * Brings a lobe into the live gesture's snapshot if it is not already there,
   * capturing it while it is still pristine.
   *
   * This exists because a gesture's scope is NOT fixed. A spawned branch welds
   * to whatever it touches on the frame it is born, and that can be clay the
   * original grab was not transitively welded to — clay the gesture then draws
   * from. Left outside the snapshot, such a lobe is the one thing in this file
   * that is INTEGRATED rather than recomputed: every frame takes another slice
   * off the value the previous frame left, so a six-frame drag charges it six
   * times over. It leaked a tenth of a percent of a creature's clay per branch,
   * and it would have made a mid-gesture cancel silently lossy.
   */
  function captureForGesture(id) {
    if (!gesture || gesture.snapshot.has(id) || !lobes.has(id)) return;
    gesture.scope.add(id);
    gesture.snapshot.set(id, snapshotOf([id]).get(id));
  }

  function restoreSnapshot(snapshot) {
    for (const [id, from] of snapshot) {
      const record = lobes.get(id);
      if (!record) continue;
      record.x = from.x; record.y = from.y; record.z = from.z;
      record.sx = from.sx; record.sy = from.sy; record.sz = from.sz;
      record.radius = from.radius;
      record.settled = from.settled;
      record.slack = from.slack;
      record.droopGiven = from.droopGiven;
      record.setLength = from.setLength;
      record.grounded = from.grounded;
    }
  }

  /**
   * Points a mass along the axis anchor -> tip and sets its length, returning
   * what the length came out at.
   *
   * LENGTH FOLLOWS THE FINGER'S TRAVEL, not the finger's absolute distance from
   * the anchor. That is the difference between a gesture that feels like clay
   * and one that pops: a finger landing on a ball is already a full radius from
   * its centre, so a length taken straight from the distance would snap the
   * mass out to a radius long on the very first frame. Travel-relative means
   * the mass is exactly as long as it was at the instant the finger landed,
   * however far from its axis that landing happened to be, and grows only as
   * fast as the hand moves. It also makes the gesture indifferent to WHERE on
   * the surface the child pressed, which a five-year-old's aim requires.
   */
  function aimMass(record, anchor, tipX, tipY, tipZ, startLength, reach0) {
    const maxLength = maxLengthFor(record.radius, lawOf(record));
    const reach = Math.hypot(tipX - anchor.x, tipY - anchor.y, tipZ - anchor.z);
    return pointMass(record, anchor, tipX, tipY, tipZ, clamp(startLength + (reach - reach0), 0, maxLength));
  }

  // The second half of aimMass, with the length handed in rather than derived
  // from the finger's travel. Split out because the weld constraint has to be
  // able to ask "and what if it were this long instead?" without re-deriving
  // (and re-clamping) the travel every time.
  function pointMass(record, anchor, tipX, tipY, tipZ, length) {
    const dx = tipX - anchor.x, dy = tipY - anchor.y, dz = tipZ - anchor.z;
    const reach = Math.hypot(dx, dy, dz);
    record.x = anchor.x; record.y = anchor.y; record.z = anchor.z;
    if (reach < 1e-9 || length <= 0) {
      record.sx = 0; record.sy = 0; record.sz = 0;
      return 0;
    }
    const scale = length / reach;
    record.sx = dx * scale;
    record.sy = dy * scale;
    record.sz = dz * scale;
    applyGroundClampTip(record);
    return Math.hypot(record.sx, record.sy, record.sz);
  }

  // The end of a mass a drag toward `tip` should pivot about: the one further
  // from the finger. On an unstretched ball both ends are the centre, so the
  // ball elongates about its own middle and its far side draws in as its near
  // side comes out — which is the mass redistributing, and exactly the read
  // "the ball is being stretched" needs.
  //
  // MEASURED IN SCREEN X/Y, NOT IN 3D. The child is pointing at a flat picture;
  // which end of a mass looks further from their finger is a two-dimensional
  // question, and answering it in three dimensions makes a mass that happens to
  // lean toward the camera pivot about the end the child can see is nearest.
  function anchorFor(from, tipX, tipY) {
    const bx = from.x + from.sx, by = from.y + from.sy, bz = from.z + from.sz;
    const dBase = Math.hypot(tipX - from.x, tipY - from.y);
    const dTip = Math.hypot(tipX - bx, tipY - by);
    return dBase >= dTip ? { x: from.x, y: from.y, z: from.z } : { x: bx, y: by, z: bz };
  }

  /**
   * ...unless the clay is WELDED, in which case the weld decides.
   *
   * A mass held in the body at one of its ends pivots about THAT end, whichever
   * end the finger happens to be nearer. This is the structural half of "once
   * welded, material can never be levered out as a unit": with the free end as
   * the anchor, a drag re-aims the mass by swinging its ROOT, which is exactly
   * how the owner walked a welded green mass out of the body. With the welded
   * end as the anchor the same drag draws material OUT of the weld and the root
   * does not move at all.
   *
   * A weld sitting near the middle of a mass holds neither end in particular;
   * the further-end rule stands there and the contact floor (bedWelds) does the
   * holding on its own.
   */
  function anchorForWelded(record, from, tipX, tipY) {
    const held = weldParam(record, from);
    if (held !== null) {
      if (held <= 0.5 - WELD_ANCHOR_MARGIN) return { x: from.x, y: from.y, z: from.z };
      if (held >= 0.5 + WELD_ANCHOR_MARGIN) {
        return { x: from.x + from.sx, y: from.y + from.sy, z: from.z + from.sz };
      }
    }
    return anchorFor(from, tipX, tipY);
  }

  // Where along its own axis the grab landed, 0 at the base end and 1 at the
  // tip end. A ball has no axis, so everything on it is 0.5 — the middle,
  // which is the truth about a sphere.
  function grabParam(from, px, py, pz) {
    const l2 = from.sx * from.sx + from.sy * from.sy + from.sz * from.sz;
    if (l2 < 1e-12) return 0.5;
    return clamp(((px - from.x) * from.sx + (py - from.y) * from.sy + (pz - from.z) * from.sz) / l2, 0, 1);
  }

  /**
   * Should this drag spawn a second capsule instead of reshaping the first?
   *
   * Three conditions, all necessary. The mass has to already BE a shaft
   * (a round ball has no sideways — every direction from it is the same
   * direction, and a drag on one always elongates it). The grab has to be on
   * that shaft rather than on an end cap (a sideways drag on the tip is
   * re-aiming the capsule, which reshaping expresses perfectly well). And the
   * drag has to be genuinely off-axis, past 58 degrees, or it is a continuation
   * of the same stretch.
   *
   * Spawning is the expensive answer — it costs a primitive — so it is the one
   * that has to justify itself. Everything else reshapes and costs nothing.
   */
  function wantsBranch(record, from, grabT, dirX, dirY, dirZ) {
    const length = Math.hypot(from.sx, from.sy, from.sz);
    if (elongation(from.radius, length, lawOf(record)) < BRANCH_MIN_ELONGATION) return false;
    if (grabT < BRANCH_SHAFT_BAND[0] || grabT > BRANCH_SHAFT_BAND[1]) return false;
    const dl = Math.hypot(dirX, dirY, dirZ);
    if (dl < 1e-9) return false;
    const axis = Math.hypot(from.sx, from.sy, from.sz);
    if (axis < 1e-9) return false;
    const cos = Math.abs((dirX * from.sx + dirY * from.sy + dirZ * from.sz) / (dl * axis));
    return cos < BRANCH_ANGLE_COS;
  }

  /**
   * Frees a slot by merging the two most-overlapping same-colour masses, so a
   * gesture at the primitive cap can still spawn. This is the third and last
   * line of the no-limit promise (the first two are "reshaping allocates
   * nothing" and "the settle merges as it goes"), and it exists so that the
   * answer to "the field is full" is never the word no.
   */
  function makeRoom() {
    const pair = bestMergePair();
    if (!pair) return false;
    mergeInto(pair.keepId, pair.goneId, 1);
    return true;
  }

  /**
   * Takes hold of the clay under (x, y). Returns null ONLY when there is no
   * clay there — the one honest failure left, and not a refusal: it means the
   * finger is on the table.
   */
  /**
   * A hit-shaped answer built on the surface of a KNOWN mass, nearest a given
   * world point. Not a trace: the caller has already decided which clay this
   * is about and only needs somewhere on it to take hold of.
   */
  function nearestSurfaceOn(id, px, py, pz) {
    const record = lobes.get(id);
    if (!record) return null;
    const { ra, rb, length } = shapeOf(record);
    const sx = record.sx || 0, sy = record.sy || 0, sz = record.sz || 0;
    let t = 0;
    if (length > 1e-9) {
      t = clamp(((px - record.x) * sx + (py - record.y) * sy + (pz - record.z) * sz) / (length * length), 0, 1);
    }
    const ax = record.x + sx * t, ay = record.y + sy * t, az = record.z + sz * t;
    const localRadius = Math.max(ra + (rb - ra) * t, 1e-6);
    let nx = px - ax, ny = py - ay, nz = pz - az;
    let n = Math.hypot(nx, ny, nz);
    if (n < 1e-9) { nx = 0; ny = 0; nz = 1; n = 1; }
    nx /= n; ny /= n; nz /= n;
    return {
      x: ax + nx * localRadius, y: ay + ny * localRadius, z: az + nz * localRadius,
      nx, ny, nz,
      lobeId: id,
      color: record.color,
      donorId: id,
      donorKind: record.kind,
      localRadius,
    };
  }

  function beginPull(x, y) {
    // WHICH CLAY THE FINGER LANDED ON IS A QUESTION ABOUT THE PICTURE THE CHILD
    // COULD SEE, so it is asked before anything moves. A settle still
    // interpolating would fight the finger — and would be writing to the very
    // records the gesture is about to snapshot — so it still has to be landed
    // before the gesture starts. But landing it MOVES THE CLAY, and since the
    // settle learned to topple a creature onto its side that can be most of the
    // stage: the child presses on their creature, it lands somewhere else under
    // their finger, and the press they made on clay is tested against bare
    // table. Asking first and landing second means the mass they touched is the
    // mass they get, wherever it has got to by the time they have hold of it.
    const seen = settle ? raycast(x, y) : null;
    if (settle) finishSettle();
    let hit = raycast(x, y);
    // The overwhelmingly common case is that the point is still on the same
    // clay after the settle, and then this changes nothing at all — the
    // re-trace is the answer. The fallback only runs when the clay has moved
    // out from under a press that WAS on it, and it takes hold of the nearest
    // point on that same mass. (A mass the settle's merge absorbed is gone; a
    // press on one is a press on clay that no longer exists.)
    if ((!hit || !hit.lobeId) && seen && seen.lobeId && lobes.has(seen.lobeId)) {
      hit = nearestSurfaceOn(seen.lobeId, seen.x, seen.y, seen.z);
    }
    if (!hit || !hit.lobeId) return null;
    const target = lobes.get(hit.lobeId);
    if (!target) return null;
    // A gesture that was never ended (a lost pointer, a torn-down stage) is
    // committed rather than left half-applied: the clay a child has already
    // seen move is theirs.
    if (gesture) endPull(gesture.token);
    // The previous gesture's work is now part of the creature: from here on the
    // clay may round it together with whatever it overlaps.
    for (const record of lobes.values()) record.justMade = false;
    const scope = new Set(componentOf(hit.lobeId));
    const from = snapshotOf(scope).get(hit.lobeId);
    gesture = {
      token: hit.lobeId,
      lobeId: hit.lobeId,
      spawned: null,
      mode: null,               // decided on the first pullTo, from the direction
      grab: { x: hit.x, y: hit.y, z: hit.z },
      normal: { x: hit.nx, y: hit.ny, z: hit.nz },
      localRadius: hit.localRadius,
      grabT: grabParam(from, hit.x, hit.y, hit.z),
      startLength: Math.hypot(from.sx, from.sy, from.sz),
      // Where the drawn end of this mass was when the finger landed. Travel is
      // measured from HERE, not from the length, because re-aiming a mass that
      // is already at full elongation changes its shape completely while
      // changing its length not at all — and a release test that only watched
      // the length would throw that gesture away as "never happened".
      startTip: { x: from.x + from.sx, y: from.y + from.sy, z: from.z + from.sz },
      snapshot: snapshotOf(scope),
      scope,
    };
    return {
      id: hit.lobeId,
      token: hit.lobeId,
      lobeId: hit.lobeId,
      mode: 'reshape',
      color: target.color,
      grip: hit.localRadius,
      maxLength: maxLengthFor(target.radius, lawOf(target)),
      startLength: gesture.startLength,
    };
  }

  /**
   * Why a press at (x, y) would do nothing, as a pure query that changes
   * nothing. There is exactly one answer left, and keeping the function is the
   * point: a review hook that still reported 'spent' or 'at-cap' would be
   * describing a toy this one is not.
   */
  function pullRefusal(x, y) {
    const hit = raycast(x, y);
    if (!hit || !hit.lobeId) return 'no-surface';
    return null;
  }

  // Spawns the second capsule of a branch out of the parent's own clay, and
  // returns its record — or null if it could not be afforded or housed, in
  // which case the caller reshapes instead and the child never learns there
  // was a decision.
  function spawnBranch(parent, hit) {
    if (lobes.size >= maxLobes && !makeRoom()) return null;
    if (lobes.size >= maxLobes) return null;
    const want = Math.max(hit.localRadius * BRANCH_GRIP_FRACTION, 1e-6);
    // The parent pays, and only the parent: a branch is clay pinched off the
    // shaft it comes out of. Whatever the floor leaves is what the branch is
    // made of, which is why this can shrink a branch but never refuse one.
    const affordable = radiusForVolume(Math.min(sphereVolume(want), donorHeadroom(parent)));
    if (!(affordable > hit.localRadius * 0.18)) return null; // too small to read as anything
    const sink = affordable * BRANCH_BASE_SINK;
    let id;
    do { autoCounter += 1; id = `lobe-${autoCounter}`; } while (lobes.has(id));
    const record = {
      id,
      kind: PULL_KIND,
      x: hit.x - hit.nx * sink,
      y: hit.y - hit.ny * sink,
      z: hit.z - hit.nz * sink,
      radius: affordable,
      baseRadius: affordable,
      sx: 0, sy: 0, sz: 0,
      law: SHAPE_BLUNT,
      root: parent.id,
      settled: 0,
      slack: 1,
      droopGiven: 0,
      grounded: false,
      setLength: 0,
      // Protected from the merge until the child's next gesture. See
      // bestMergePair.
      justMade: true,
      color: parent.color,
    };
    // The parent is NOT charged here. Charging is the per-frame recompute's
    // job (see pullTo's branch block), which subtracts the branch's volume from
    // the parent's RESTORED radius every frame. Taking it here as well made the
    // parent pay twice on the one frame the branch is born — invisible on a
    // long drag, because the next frame restores the snapshot and re-charges
    // once, but permanent on a short one that ended on that frame. It leaked
    // 0.08% of a creature's clay over a hundred gestures, and the node soak's
    // conservation assertion is what caught it.
    lobes.set(id, record);
    // Fusion is evaluated ONCE, here, at birth: the base is planted inside the
    // skin, so it welds to what it came out of on the frame it appears and the
    // union closes over the joint. Every later frame of the gesture skips it,
    // or a sweeping limb would weld to whatever it passed over.
    evaluateFusion(id);
    // The welds it just made can reach clay the original grab was not part of.
    // Capture that clay now, while it is untouched, so the gesture can put it
    // back exactly (see captureForGesture).
    for (const partnerId of partnersOf(id)) captureForGesture(partnerId);
    return record;
  }

  /**
   * Draws the held mass toward a world point. The whole result is recomputed
   * from the gesture's opening snapshot every frame — nothing is integrated —
   * so a drag out and back leaves the lump bit-identical to how it started.
   */
  function pullTo(token, tipX, tipY, tipZ) {
    const miss = { pulled: false, length: 0, tipX: 0, tipY: 0, tipZ: 0, volume: 0, mode: null, lobeId: null };
    if (!gesture || gesture.token !== String(token)) return miss;
    const tx = Number(tipX);
    const ty = Number(tipY);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return miss;

    restoreSnapshot(gesture.snapshot);
    const held = lobes.get(gesture.lobeId);
    if (!held) return miss;
    const from = gesture.snapshot.get(gesture.lobeId);

    // THE DRAG IS PLANAR unless the caller says otherwise, and the plane is the
    // one through the mass's own ANCHOR — not through the surface point the
    // finger landed on.
    //
    // This is not a detail. The grab point is on the SKIN of the mass, a full
    // radius nearer the camera than its centre line, so aiming at the grab
    // point's own depth gives every single drag a forward z component as long
    // as the shoulder radius. The mass then swings out of the screen instead of
    // across it: a sideways drag on what LOOKS like a long shaft is measured
    // against an axis pointing at the viewer, its screen-space midpoint is
    // nowhere near its real midpoint, and the reshape-or-branch decision reads
    // the wrong numbers. It also foreshortens every elongation the child makes,
    // which quietly costs the whole model its read.
    const anchorPlane = gesture.mode === 'branch' && gesture.branchAnchor
      ? gesture.branchAnchor
      : anchorForWelded(held, from, tx, ty);
    const tz = tipZ === undefined ? anchorPlane.z : Number(tipZ);
    if (!Number.isFinite(tz)) return miss;

    // Which of the two things this gesture is, decided once and then kept: a
    // gesture that flipped between reshaping and branching as the finger
    // wandered would be two different toys in one drag.
    if (gesture.mode === null) {
      const dirX = tx - gesture.grab.x, dirY = ty - gesture.grab.y, dirZ = tz - gesture.grab.z;
      if (Math.hypot(dirX, dirY, dirZ) < gesture.localRadius * 0.12) {
        // Not enough direction to decide anything yet; leave the clay alone.
        return { ...miss, pulled: false, mode: null, lobeId: gesture.lobeId };
      }
      if (wantsBranch(held, from, gesture.grabT, dirX, dirY, dirZ)) {
        const spawned = spawnBranch(held, { ...gesture.grab, nx: gesture.normal.x, ny: gesture.normal.y, nz: gesture.normal.z, localRadius: gesture.localRadius });
        if (spawned) {
          gesture.mode = 'branch';
          gesture.spawned = spawned.id;
          gesture.lobeId = spawned.id;
          // The base it was planted at, held for the life of the gesture: a
          // branch pivots about where it left its parent, not about whichever
          // of its ends is currently furthest from the finger.
          gesture.branchAnchor = { x: spawned.x, y: spawned.y, z: spawned.z };
          // The parent paid for it, and the parent IS in the opening snapshot,
          // so cancelling puts its clay back with everything else.
          gesture.parentId = held.id;
        } else {
          gesture.mode = 'reshape';
        }
      } else {
        gesture.mode = 'reshape';
      }
    }

    // How far the finger was from the anchor when it landed, measured in the
    // same plane the drag is happening in — the zero point travel is counted
    // from.
    const reachAt = (px, py) => Math.hypot(px - anchorPlane.x, py - anchorPlane.y, tz - anchorPlane.z);
    const reach0 = reachAt(gesture.grab.x, gesture.grab.y);

    let record;
    let anchor;
    if (gesture.mode === 'branch') {
      record = lobes.get(gesture.lobeId);
      if (!record) return miss;
      // Re-pay for the branch out of the restored parent every frame, so the
      // arithmetic is a recompute rather than an accumulation.
      const parent = lobes.get(gesture.parentId);
      if (parent) setRadius(parent, radiusForVolume(Math.max(sphereVolume(parent.radius) - sphereVolume(record.baseRadius), sphereVolume(floorRadiusOf(parent)))));
      record.radius = record.baseRadius;
      anchor = gesture.branchAnchor;
    } else {
      record = held;
      anchor = anchorPlane;
    }

    const startLength = gesture.mode === 'branch' ? 0 : gesture.startLength;
    let length = aimMass(record, anchor, tx, ty, tz, startLength, reach0);

    // THE MINOR CROSS-DRAW. Elongation is paid for out of the mass's own
    // volume — that is what makes it narrow — but the lump around it should
    // visibly give a little too, or the body reads as inert while the child
    // works it. Recomputed from the restored snapshot each frame (never added
    // to last frame's answer), floored per donor, and best-effort: a lump with
    // nothing left simply gives nothing.
    const u = elongation(record.radius, length, lawOf(record));
    if (u > 0) {
      const want = sphereVolume(record.radius) * ELONGATION_DRAW * u;
      const raised = drawFromNeighbours(record.id, want);
      if (raised > 0) {
        setRadius(record, radiusForVolume(sphereVolume(record.radius) + raised));
        length = aimMass(record, anchor, tx, ty, tz, startLength, reach0);
      }
    }

    // ONCE WELDED, NEVER LEVERED OUT. Whatever the drag asked for, the mass
    // ends the frame bedded in every neighbour it has ever joined by at least
    // as much as it was when it joined them — by rooting deeper if that is
    // enough, and by giving up length if it is not.
    const place = (want) => {
      const got = pointMass(record, anchor, tx, ty, tz, want);
      if (groundY !== null && record.kind !== PULL_KIND) applyGroundClamp(record);
      if (bedWelds(record)) applyGroundClampTip(record);
      return got;
    };
    length = holdWelds(record, place, length);
    record.slack = 1;
    return {
      pulled: true,
      mode: gesture.mode,
      lobeId: record.id,
      spawned: gesture.spawned,
      length,
      startLength: gesture.startLength,
      restRadius: record.radius,
      tipX: record.x + record.sx, tipY: record.y + record.sy, tipZ: record.z + record.sz,
      volume: sphereVolume(record.radius),
    };
  }

  /** What the live gesture has done so far, for a caller deciding on release. */
  function gestureState() {
    if (!gesture) return null;
    const record = lobes.get(gesture.lobeId);
    const length = record ? Math.hypot(record.sx || 0, record.sy || 0, record.sz || 0) : 0;
    const travel = record
      ? Math.hypot(
        record.x + (record.sx || 0) - gesture.startTip.x,
        record.y + (record.sy || 0) - gesture.startTip.y,
        record.z + (record.sz || 0) - gesture.startTip.z,
      )
      : 0;
    return {
      token: gesture.token,
      mode: gesture.mode,
      lobeId: gesture.lobeId,
      spawned: gesture.spawned,
      grip: gesture.localRadius,
      // WHERE ALONG THE MASS the finger landed, 0 at the base end and 1 at the
      // tip end (0.5 everywhere on a ball, which has no ends). This is the
      // input the reshape-or-branch decision turns on, so a reviewer who
      // cannot see why a gesture chose one over the other has to be able to
      // read it back rather than infer it from the result.
      grabT: gesture.grabT,
      startLength: gesture.startLength,
      length,
      // How far the clay actually moved under the finger, in world units.
      travel,
    };
  }

  /**
   * Lets go. The clay keeps whatever shape the drag left it in, every lobe the
   * gesture touched is marked as fresh work for the next settle, and the
   * gesture's snapshot is dropped.
   */
  function endPull(token) {
    if (!gesture || gesture.token !== String(token)) return null;
    const state = gestureState();
    // ONLY the mass this gesture actually reshaped is marked as fresh work —
    // never the whole lump. Marking a welded neighbour fresh would hand the
    // settle's relax a limb the child did not touch, and THAT is how a
    // creature erodes over a long session. A neighbour that merely donated a
    // little clay needs no slack: every other settle effect is a fixed point
    // and reaches its target with or without it.
    const held = lobes.get(gesture.lobeId);
    if (held) held.slack = 1;
    if (gesture.parentId) {
      const parent = lobes.get(gesture.parentId);
      if (parent) parent.slack = 1;
    }
    gesture = null;
    return state;
  }

  /**
   * THE MID-GESTURE ESCAPE: this drag never happened. The opening snapshot is
   * written straight back (bit-identical, not approximately), and anything the
   * gesture spawned is removed.
   *
   * It is reachable only from inside the one press-drag-release that started
   * it. Once the finger comes up, the clay is clay.
   */
  function cancelPull(token) {
    if (!gesture || gesture.token !== String(token)) return false;
    const spawned = gesture.spawned;
    const snapshot = gesture.snapshot;
    gesture = null;
    if (spawned) removeLobe(spawned);
    restoreSnapshot(snapshot);
    for (const [id] of snapshot) {
      const record = lobes.get(id);
      if (record) applyGroundClamp(record);
    }
    return true;
  }

  /**
   * The bin, mid-gesture. A branch is thrown away and the clay goes with it —
   * the parent keeps the size it gave up, exactly as it always has. A reshape
   * has nothing to throw away (no clay was made, only moved), so binning one
   * means the same thing as changing your mind about it: the mass goes back to
   * the shape it had when the finger went down.
   */
  function discardPull(token) {
    if (!gesture || gesture.token !== String(token)) return false;
    const spawned = gesture.spawned;
    const snapshot = gesture.snapshot;
    const parentId = gesture.parentId;
    gesture = null;
    if (!spawned) {
      restoreSnapshot(snapshot);
      return true;
    }
    // Restore everything EXCEPT the parent's radius: the clay in the binned
    // branch is gone for good.
    const parentRadius = lobes.get(parentId)?.radius;
    removeLobe(spawned);
    restoreSnapshot(snapshot);
    const parent = lobes.get(parentId);
    if (parent && parentRadius !== undefined) setRadius(parent, parentRadius);
    return true;
  }

  /** Removes a released spawned mass and its clay — the bin, after the fact. */
  function pinchOff(id) {
    const record = lobes.get(id);
    if (!record || record.kind !== PULL_KIND) return false;
    return removeLobe(id);
  }

  /** Removes a spawned mass. Kept for QA teardown; the gesture uses cancelPull. */
  function squashAway(id) {
    const record = lobes.get(id);
    if (!record || record.kind !== PULL_KIND) return false;
    return removeLobe(id);
  }

  function isProtrusion(id) {
    const record = lobes.get(id);
    return !!record && record.kind === PULL_KIND;
  }

  /**
   * The full shape of any lobe — the introspection QLOBE_DEBUG and both test
   * suites read the reshaping semantics out of. Works on every lobe, not only
   * spawned ones: under this model a ball that has been drawn out IS the limb,
   * so a hook that only described spawned masses would be describing the
   * additive toy this one replaced.
   */
  function protrusion(id) {
    const record = lobes.get(id);
    if (!record) return null;
    const s = shapeOf(record);
    return {
      id,
      kind: record.kind,
      spawned: record.kind === PULL_KIND,
      law: s.law,
      grip: s.ra,
      length: s.length,
      maxLength: s.maxLength,
      elongation: elongation(record.radius, s.length, s.law),
      ra: s.ra, rb: s.rb,
      tipRatio: s.ra > 0 ? s.rb / s.ra : 1,
      restRadius: record.radius,
      volume: sphereVolume(record.radius),
      settled: clamp(record.settled || 0, 0, 1),
      slack: clamp(record.slack || 0, 0, 1),
      root: record.root || null,
      x: record.x, y: record.y, z: record.z,
      tipX: record.x + (record.sx || 0), tipY: record.y + (record.sy || 0), tipZ: record.z + (record.sz || 0),
    };
  }

  /** Number of lobes that came from the tray rather than from a pull. */
  function ballCount() {
    let n = 0;
    for (const record of lobes.values()) if (record.kind !== PULL_KIND) n += 1;
    return n;
  }

  /** Total clay in the field. The conservation invariant the node test asserts on. */
  function totalVolume() {
    let total = 0;
    for (const record of lobes.values()) total += sphereVolume(record.radius);
    return total;
  }

  // Transient per-lobe landing impact: amount > 0 is a compression bulge,
  // amount < 0 is the rebound stretch. Never persisted (toJSON ignores it,
  // fromJSON resets it), and cleared with the rest of the field by clear().
  function setImpact(id, axisX, axisY, amount) {
    if (!lobes.has(id)) return false;
    const ax = Number(axisX);
    const ay = Number(axisY);
    const amt = Number(amount);
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(amt)) return false;
    impacts.set(id, { axisX: ax, axisY: ay, amount: amt });
    return true;
  }

  function shape(id) {
    const record = lobes.get(id);
    if (!record) return null;
    const sx = record.sx || 0, sy = record.sy || 0, sz = record.sz || 0;
    const length = Math.hypot(sx, sy, sz);
    const { ra, rb } = coneShape(record.radius, length, lawOf(record));
    return {
      x: record.x, y: record.y, z: record.z,
      tipX: record.x + sx, tipY: record.y + sy, tipZ: record.z + sz,
      ra, rb, restRadius: record.radius, length,
    };
  }

  function contact(idA, idB) {
    const a = lobes.get(idA);
    const b = lobes.get(idB);
    if (!a || !b) return 0;
    return contactAmount(a, b, opts);
  }

  function isFused(idA, idB) {
    return fused.has(pairKey(idA, idB));
  }

  function fusedPairs() {
    return [...fused].map((key) => key.split('|'));
  }

  function maxContact() {
    const items = [...lobes.values()];
    let max = 0;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const c = contactAmount(items[i], items[j], opts);
        if (c > max) max = c;
      }
    }
    return max;
  }

  // Covers the tip sphere as well as the base sphere, since a stretched
  // limb can reach well outside the base-only box the sphere-era code used.
  function bounds({ pad = 0 } = {}) {
    const items = [...lobes.values()];
    if (items.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const lobe of items) {
      const sx = lobe.sx || 0, sy = lobe.sy || 0, sz = lobe.sz || 0;
      const length = Math.hypot(sx, sy, sz);
      const { ra, rb } = coneShape(lobe.radius, length, lawOf(lobe));
      const raP = ra + pad, rbP = rb + pad;
      const tipX = lobe.x + sx, tipY = lobe.y + sy;
      minX = Math.min(minX, lobe.x - raP, tipX - rbP);
      maxX = Math.max(maxX, lobe.x + raP, tipX + rbP);
      minY = Math.min(minY, lobe.y - raP, tipY - rbP);
      maxY = Math.max(maxY, lobe.y + raP, tipY + rbP);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  // How much a resting base sphere should visually swell to compensate for
  // the volume the ground plane slices off its underside (computed fresh
  // every call, never stored — it's a pure function of current y/ra/ground).
  function groundCompensation(y, ra) {
    if (groundY === null) return 1;
    const V = sphereVolume(ra);
    const h = clamp(groundY - (y - ra), 0, 2 * ra);
    if (h <= 0) return 1;
    const capVolume = (r, depth) => Math.PI * depth * depth * (3 * r - depth) / 3;
    let scale = clamp(Math.cbrt(V / (V - capVolume(ra, h))), 1, 1.15);
    // One refinement pass: the first estimate used the un-scaled radius, but
    // a bigger sphere sinks a bit deeper, so recompute h/Vcap at the scaled
    // radius once rather than iterating to full convergence (not worth it
    // for a cosmetic compensation term).
    const ra2 = ra * scale;
    const h2 = clamp(groundY - (y - ra2), 0, 2 * ra2);
    if (h2 > 0) scale = clamp(Math.cbrt(V / (V - capVolume(ra2, h2))), 1, 1.15);
    return scale;
  }

  // The render feed. Contact here is continuous geometric proximity (not
  // gated by permanent fusion) so a blob visibly squashes on approach, the
  // same way uFusion drove the lab's material before a pair ever locked.
  function shading() {
    const items = [...lobes.values()];
    return items.map((lobe) => {
      let axisX = 0, axisY = 0, sumContact = 0, maxC = 0;
      for (const other of items) {
        if (other.id === lobe.id) continue;
        const c = contactAmount(lobe, other, opts);
        if (c <= 0) continue;
        axisX += (other.x - lobe.x) * c;
        axisY += (other.y - lobe.y) * c;
        sumContact += c;
        if (c > maxC) maxC = c;
      }
      const len = Math.hypot(axisX, axisY);
      const unitAxisX = len > 0 ? axisX / len : 0;
      const unitAxisY = len > 0 ? axisY / len : 0;
      const squash = clamp(sumContact, 0, 1);
      const join = clamp(maxC, 0, 1);

      const sx = lobe.sx || 0, sy = lobe.sy || 0, sz = lobe.sz || 0;
      const length = Math.hypot(sx, sy, sz);
      const { ra, rb } = coneShape(lobe.radius, length, lawOf(lobe));
      const scale = groundCompensation(lobe.y, ra);

      const impact = impacts.get(lobe.id);
      let impactAxisX = 0, impactAxisY = 0, impactAmount = 0;
      if (impact) {
        const ilen = Math.hypot(impact.axisX, impact.axisY);
        if (ilen > 0) { impactAxisX = impact.axisX / ilen; impactAxisY = impact.axisY / ilen; }
        impactAmount = impact.amount;
      }

      // Impact and contact both want to drive the same squash/stretch
      // uniform, so whichever pushes harder wins outright rather than
      // summing (summing would let a big contact permanently mask a small
      // rebound, or vice versa). With no impact this reduces to exactly
      // today's 0.10*squash-along-contact-axis, which is the regression guard.
      const contactTerm = CONTACT_SQUASH * squash;
      const impactTerm = IMPACT_SQUASH * impactAmount;
      let deform, deformX, deformY;
      if (Math.abs(impactTerm) >= contactTerm) {
        deform = impactTerm; deformX = impactAxisX; deformY = impactAxisY;
      } else {
        deform = contactTerm; deformX = unitAxisX; deformY = unitAxisY;
      }
      deform = clamp(deform, -DEFORM_LIMIT, DEFORM_LIMIT);
      if (deformX === 0 && deformY === 0) { deform = 0; deformX = 1; deformY = 0; }

      const stretchFraction = clamp(length / maxLengthFor(lobe.radius, lawOf(lobe)), 0, 1);
      // A lobe that has taken its set carries a wider fillet at its welds —
      // the visible half of "the joins deepen into the mass". Brand-new clay
      // starts at the un-softened width and the settle ramps it, so the child
      // watches the join close rather than finding it already closed.
      const soften = 1 + SETTLE_SOFTEN * clamp(lobe.settled || 0, 0, 1);
      const blend = lobe.radius * (BLEND_BASE + BLEND_JOIN * join) * (1 + BLEND_STRETCH_GAIN * stretchFraction) * soften;

      return {
        id: lobe.id, color: lobe.color,
        x: lobe.x, y: lobe.y, z: lobe.z,
        radius: ra * scale,
        blend,
        tipX: lobe.x + sx, tipY: lobe.y + sy, tipZ: lobe.z + sz,
        tipRadius: rb * scale,
        restRadius: lobe.radius,
        axisX: unitAxisX, axisY: unitAxisY, squash, join,
        deformX, deformY, deform,
        // The hand-worked displacement's two per-lobe inputs. Amplitude is
        // uniform across the creature (it is one lump of clay, worked by one
        // pair of hands); the phase triple is what makes each lobe's lumps its
        // own, and it is a pure function of the persisted seed and lobe id.
        noiseAmp: NOISE_AMP,
        noisePhase: phaseOf(lobe.id),
        settled: clamp(lobe.settled || 0, 0, 1),
      };
    });
  }

  // --- Taking its set --------------------------------------------------------

  function geometryOf(record) {
    return {
      x: record.x, y: record.y, z: record.z,
      sx: record.sx || 0, sy: record.sy || 0, sz: record.sz || 0,
      radius: record.radius,
      settled: clamp(record.settled || 0, 0, 1),
      slack: clamp(record.slack || 0, 0, 1),
      droopGiven: Math.max(record.droopGiven || 0, 0),
      setLength: Math.max(record.setLength || 0, 0),
      grounded: !!record.grounded,
    };
  }

  // Walks a chain's `root` links down to the mass everything is ultimately
  // planted in. A branch's base has to move with THAT, not with its immediate
  // parent's own base, because the parent's base is itself planted somewhere.
  function anchorOf(id) {
    let current = lobes.get(id);
    for (let hops = 0; current && current.kind === PULL_KIND && hops < MAX_LOBES; hops++) {
      current = current.root ? lobes.get(current.root) : null;
    }
    return current ? current.id : null;
  }

  // --- Organic simplification -------------------------------------------------

  // Are these two masses already reading as one? Same colour (a seam between
  // colours is a decision, never noise), deeply interpenetrated, and lying
  // along the same line. A ball has no line, so it agrees with everything.
  function mergeable(a, b, shaded) {
    if (a.color !== b.color) return false;
    // A merge may never cost the creature a ball: the four-ball Decorate gate
    // counts balls, and clay tidying itself out of a gate is the worst trap
    // this feature could introduce. So exactly one side may vanish, and it has
    // to be a mass a gesture spawned.
    if (a.kind !== PULL_KIND && b.kind !== PULL_KIND) return false;
    if (contactAmount(a, b, opts) < MERGE_CONTACT) return false;
    const la = Math.hypot(a.sx || 0, a.sy || 0, a.sz || 0);
    const lb = Math.hypot(b.sx || 0, b.sy || 0, b.sz || 0);
    if (la < 1e-9 || lb < 1e-9) return true;
    const cos = Math.abs(((a.sx * b.sx) + (a.sy * b.sy) + (a.sz * b.sz)) / (la * lb));
    if (cos >= MERGE_ALIGN) return true;
    // Not aligned — but is the one that would vanish already buried? Only the
    // spawned side can vanish, so only it is worth measuring, and this is the
    // expensive test so it runs last and only on a pair that has already
    // cleared colour, kind and contact.
    const gone = a.kind === PULL_KIND ? a : b;
    return engulfment(gone.id, shaded || shading()) >= MERGE_ENGULF;
  }

  /**
   * How much of one lobe's own hull is buried inside the rest of the union (or
   * under the table), 0 to 1. Sampled on the SAME fixed lattice the
   * consolidation test uses, so the two agree with each other and the answer is
   * reproducible frame to frame — a merge that fired on one machine and not
   * another would make a creature's own shelf card wrong.
   */
  function engulfment(id, shaded) {
    const s = shaded.find((entry) => entry.id === id);
    if (!s) return 0;
    let buried = 0;
    let total = 0;
    for (const station of CONSOLIDATE_STATIONS) {
      const cx = s.x + (s.tipX - s.x) * station;
      const cy = s.y + (s.tipY - s.y) * station;
      const cz = s.z + (s.tipZ - s.z) * station;
      const r = s.radius + (s.tipRadius - s.radius) * station;
      for (const dir of SPHERE_DIRECTIONS) {
        const px = cx + dir[0] * r;
        const py = cy + dir[1] * r;
        const pz = cz + dir[2] * r;
        total += 1;
        if (groundY !== null && py < groundY) { buried += 1; continue; }
        if (unionWithout(shaded, id, px, py, pz) <= 0) buried += 1;
      }
    }
    return total > 0 ? buried / total : 0;
  }

  /**
   * The pair the clay would round together first, or null. Deterministic: ties
   * break on the id pair, never on Map order, so two identical creatures merge
   * identically on any machine and a thumbnail matches the stage.
   */
  function bestMergePair() {
    const items = [...lobes.values()];
    if (items.length < 2) return null;
    // Built once for the whole scan rather than per candidate pair: the
    // engulfment test needs it and shading() is the expensive call in this file.
    let shaded = null;
    let best = null;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        if (a.color !== b.color) continue;
        if (a.kind !== PULL_KIND && b.kind !== PULL_KIND) continue;
        // NEVER THE THING THE CHILD JUST MADE. A mass spawned by the gesture
        // that is being released right now must survive its own release —
        // rounding it away in the same breath, however defensible the geometry,
        // is the creature answering a five-year-old's work by undoing it.
        //
        // The flag is cleared by the NEXT beginPull, not by this settle, and
        // that distinction is what keeps the relaxation idempotent: a guard
        // that expired when the settle cleared it would simply move the merge
        // to the second settle, and "settling an already-settled composition is
        // a literal no-op" would stop being true.
        if (a.justMade || b.justMade) continue;
        if (contactAmount(a, b, opts) < MERGE_CONTACT) continue;
        if (!shaded) shaded = shading();
        if (!mergeable(a, b, shaded)) continue;
        // The spawned one is the one that vanishes; if both are spawned, the
        // smaller one does.
        let keep = a, gone = b;
        if (a.kind === PULL_KIND && b.kind === PULL_KIND) {
          if (a.radius < b.radius || (a.radius === b.radius && a.id < b.id)) { keep = b; gone = a; }
        } else if (a.kind === PULL_KIND) { keep = b; gone = a; }
        const score = contactAmount(a, b, opts);
        const key = pairKey(a.id, b.id);
        if (!best || score > best.score + 1e-12 || (Math.abs(score - best.score) <= 1e-12 && key < best.key)) {
          best = { keepId: keep.id, goneId: gone.id, score, key };
        }
      }
    }
    return best;
  }

  /**
   * The merged mass `keep` becomes, at blend `t` (0 = untouched, 1 = fully
   * merged). Volume-summed and spanning BOTH originals along their shared
   * axis, so the silhouette the child made survives the merge — a limb cannot
   * be swallowed, because the merged capsule reaches as far as the limb did.
   */
  function mergedGeometry(keep, gone) {
    const kb = { x: keep.x + (keep.sx || 0), y: keep.y + (keep.sy || 0), z: keep.z + (keep.sz || 0) };
    const gb = { x: gone.x + (gone.sx || 0), y: gone.y + (gone.sy || 0), z: gone.z + (gone.sz || 0) };
    const points = [{ x: keep.x, y: keep.y, z: keep.z }, kb, { x: gone.x, y: gone.y, z: gone.z }, gb];
    // Principal direction: the longest span among the four endpoints. With the
    // pair already required to be near-parallel and deeply overlapping, that is
    // the axis both of them lie on.
    let a = points[0], b = points[1], span = -1;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = Math.hypot(points[j].x - points[i].x, points[j].y - points[i].y, points[j].z - points[i].z);
        if (d > span) { span = d; a = points[i]; b = points[j]; }
      }
    }
    // The base end stays the one nearer the mass we are keeping, so the merged
    // capsule points the way the kept lobe already pointed.
    const dKeepA = Math.hypot(a.x - keep.x, a.y - keep.y, a.z - keep.z);
    const dKeepB = Math.hypot(b.x - keep.x, b.y - keep.y, b.z - keep.z);
    const base = dKeepA <= dKeepB ? a : b;
    const tip = dKeepA <= dKeepB ? b : a;
    const radius = radiusForVolume(sphereVolume(keep.radius) + sphereVolume(gone.radius));
    const maxLength = maxLengthFor(radius, lawOf(keep));
    let sx = tip.x - base.x, sy = tip.y - base.y, sz = tip.z - base.z;
    const length = Math.hypot(sx, sy, sz);
    if (length > maxLength && length > 0) {
      const scale = maxLength / length;
      sx *= scale; sy *= scale; sz *= scale;
    }
    return { x: base.x, y: base.y, z: base.z, sx, sy, sz, radius };
  }

  /**
   * Rounds `goneId` into `keepId` immediately (t = 1). Used by makeRoom(); the
   * settle uses the same geometry but INTERPOLATES to it, which is what keeps a
   * merge reading as the clay rounding itself rather than as a pop.
   */
  function mergeInto(keepId, goneId) {
    const keep = lobes.get(keepId);
    const gone = lobes.get(goneId);
    if (!keep || !gone) return false;
    const merged = mergedGeometry(keep, gone);
    keep.x = merged.x; keep.y = merged.y; keep.z = merged.z;
    keep.sx = merged.sx; keep.sy = merged.sy; keep.sz = merged.sz;
    keep.radius = merged.radius;
    keep.baseRadius = Math.max(keep.baseRadius, merged.radius);
    removeLobe(goneId, keepId);
    applyGroundClamp(keep);
    evaluateFusion(keepId);
    return true;
  }

  // --- Gravity rest ----------------------------------------------------------
  // See the REST_* block at the top of the file for why this exists. Everything
  // below is a pure rigid-body tipping solve on a working COPY of the geometry;
  // nothing here touches a record until applyRest() writes the answer.

  // The y the settle's ground pass will put this mass at, or null if it is not
  // one the settle considers to be on the table. Exactly relaxedState's own
  // test, factored out so the stability solve and the relaxation can never
  // disagree about where the clay is.
  function seatHeight(record) {
    if (groundY === null || record.kind === PULL_KIND) return null;
    const { ra } = shapeOf(record);
    const seated = groundY + ra * (1 - sinkOf(record));
    return (record.grounded || record.y <= seated + 1e-9) ? seated : null;
  }

  /** Every welded-together group of lobes, each as an array of ids. */
  function componentIds() {
    const seen = new Set();
    const out = [];
    for (const id of lobes.keys()) {
      if (seen.has(id)) continue;
      const group = [...componentOf(id)].filter((memberId) => lobes.has(memberId));
      for (const memberId of group) seen.add(memberId);
      out.push(group);
    }
    return out;
  }

  /**
   * The view-plane pose of a component, plus the rotation-INVARIANT numbers a
   * rigid motion cannot change and so only have to be computed once.
   *
   * TWO THINGS ARE SUBTLE HERE, and both of them cost a debugging session.
   *
   * A FOOT'S HEIGHT IS ITS RESTING PLANE, NOT ITS LOWEST POINT. Clay sinks INTO
   * the table by a fraction of its own radius (see sinkOf), so a fat foot and a
   * thin foot lying side by side on the same wood have their lowest points at
   * different depths. Measured by lowest point, a loaf lying perfectly flat on
   * its belly looks like a fat foot on the table and a thin one hanging above
   * it — and the solver would obligingly topple a creature that was already
   * lying down. `ka`/`kb` are the sunk radii, so `y - ka` is the plane a foot
   * rests on and two seated feet agree exactly.
   *
   * AND A GROUNDED MASS IS MEASURED WHERE THE SETTLE WILL PUT IT. Elongating a
   * mass thins it, and the ground clamp only ever pushes UP, so a worked limb
   * hangs a few hundredths clear of the wood until the relaxation re-seats it.
   * Judging stability from that pose reports a creature lying flat as balanced
   * on one ball. The seat the settle is about to apply is applied here first.
   */
  function restBodies(ids) {
    const out = [];
    const spread = Math.sqrt(REST_FOOTPRINT * (2 - REST_FOOTPRINT));
    for (const id of ids) {
      const record = lobes.get(id);
      if (!record) continue;
      const sx = record.sx || 0, sy = record.sy || 0, sz = record.sz || 0;
      const length = Math.hypot(sx, sy, sz);
      const { ra, rb } = coneShape(record.radius, length, lawOf(record));
      const sink = sinkOf(record);
      let y = record.y;
      if (seatHeight(record) !== null) y = seatHeight(record);
      // Where along its own axis a round cone's clay actually sits. Weighting
      // the two ends by the cube of their radii puts the centroid of a ball at
      // its centre, of a symmetric capsule at its middle, and of a tapered limb
      // nearer its shoulder — which is all the fidelity a stability test needs.
      const wa = ra * ra * ra, wb = rb * rb * rb;
      out.push({
        id, ra, rb,
        ka: ra * (1 - sink), kb: rb * (1 - sink),
        pa: ra * spread, pb: rb * spread,
        mass: Math.max(roundConeVolume(ra, rb, length), 1e-12),
        t: wa + wb > 0 ? wb / (wa + wb) : 0.5,
        grounded: !!record.grounded,
        x: record.x, y, sx, sy,
      });
    }
    return out;
  }

  function restCom(bodies) {
    let mx = 0, my = 0, total = 0;
    for (const b of bodies) {
      mx += b.mass * (b.x + b.sx * b.t);
      my += b.mass * (b.y + b.sy * b.t);
      total += b.mass;
    }
    return total > 0 ? { x: mx / total, y: my / total } : { x: 0, y: 0 };
  }

  /**
   * The composite's contact patch with the table, in the view plane: the lowest
   * point it reaches, and the x-interval over which it is actually supported.
   *
   * A "foot" is one end sphere of one primitive. Only feet within
   * REST_CONTACT_BAND of the lowest point bear any load, and each of those
   * spreads into a flat patch of half-width sqrt(d(2r-d)) — the chord a sphere
   * pressed REST_FOOTPRINT of its radius into clay-soft ground actually makes.
   * Without that width a single ball would balance on a mathematical point and
   * every creature on the table would read as unstable.
   */
  function restSupport(bodies) {
    let yFloor = Infinity;
    let meanRadius = 0;
    const feet = [];
    for (const b of bodies) {
      feet.push({ x: b.x, y: b.y - b.ka, w: b.pa });
      feet.push({ x: b.x + b.sx, y: b.y + b.sy - b.kb, w: b.pb });
      meanRadius += b.ra;
    }
    meanRadius /= Math.max(bodies.length, 1);
    for (const f of feet) if (f.y < yFloor) yFloor = f.y;
    const band = meanRadius * REST_CONTACT_BAND;
    let sMin = Infinity, sMax = -Infinity;
    for (const f of feet) {
      if (f.y > yFloor + band) continue;
      if (f.x - f.w < sMin) sMin = f.x - f.w;
      if (f.x + f.w > sMax) sMax = f.x + f.w;
    }
    return { yFloor, sMin, sMax, meanRadius };
  }

  // How far outside its own support the COM hangs, in world units — negative
  // when it is inside. `slack` is the same figure with the stability margin
  // taken off: at or below zero the pose is one the clay will hold, and above
  // zero it topples. One predicate, used by the trigger and by the stop test
  // alike (see REST_MARGIN).
  function restOverhang(bodies) {
    const sup = restSupport(bodies);
    const com = restCom(bodies);
    const overhang = Math.max(sup.sMin - com.x, com.x - sup.sMax);
    return { sup, com, overhang, slack: overhang + sup.meanRadius * REST_MARGIN };
  }

  // A rotated, re-seated COPY of a pose. Rigid by construction: one rotation
  // about one point plus one vertical translation, applied identically to every
  // base point and every axis vector, so no pairwise distance in the composite
  // can change by more than floating-point round-off.
  function restPoseAt(bodies, pivotX, pivotY, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const out = bodies.map((b) => {
      const dx = b.x - pivotX, dy = b.y - pivotY;
      return {
        ...b,
        x: pivotX + dx * c - dy * s,
        y: pivotY + dx * s + dy * c,
        sx: b.sx * c - b.sy * s,
        sy: b.sx * s + b.sy * c,
      };
    });
    // Re-seat: the composite rolls ON the table, it does not sink through it or
    // hop off it. Whatever is lowest after the rotation goes back to the plane
    // the composite was resting on.
    let low = Infinity;
    for (const b of out) low = Math.min(low, b.y - b.ka, b.y + b.sy - b.kb);
    const lift = pivotY - low;
    if (lift !== 0) for (const b of out) b.y += lift;
    return out;
  }

  /**
   * THE TOPPLE. Returns the rigid transform that lets one component fall onto a
   * stable support, or null if it is already standing.
   *
   * `{ ids, angle, cx, cy, dx, dy }` reads: rotate every primitive of the
   * component by `angle` about `(cx, cy)` — the contact edge it topples over —
   * and then translate by `(dx, dy)`. Interpolating `angle` and the translation
   * together on one parameter gives a family of RIGID poses, which is what lets
   * the settle animate this without the composite distorting on the way down.
   */
  function restPlanFor(ids) {
    if (groundY === null) return null;
    if (gesture) return null;               // never rotate clay a child is holding
    const start = restBodies(ids);
    if (!start.length) return null;
    const first = restOverhang(start);
    // Clay in the air is falling, not resting: the landing animation owns it.
    const drop = first.sup.yFloor - groundY;
    const touching = start.some((b) => b.grounded) || drop <= first.sup.meanRadius * REST_DROP_BAND;
    if (!touching || !(drop > -first.sup.meanRadius)) return null;
    if (!(first.slack > 0)) return null;
    // Seat the composite on the table before solving, so the topple pivots
    // about the wood rather than about wherever a thinning pull left the clay
    // hanging. The seat rides in the plan's translation and is only ever
    // applied if a topple is actually found.
    let bodies = drop !== 0 ? start.map((b) => ({ ...b, y: b.y - drop })) : start;

    let angleTotal = 0;
    let pivot = null;
    let guard = 0;

    for (let tip = 0; tip < REST_MAX_TIPS; tip++) {
      const { sup, com, slack } = restOverhang(bodies);
      if (!(slack > 0)) break;
      // Which edge it goes over: the one the COM is nearest to falling past.
      const dir = (sup.sMin - com.x) >= (com.x - sup.sMax) ? 1 : -1;  // +1 = CCW, topples left
      const pivotX = dir > 0 ? sup.sMin : sup.sMax;
      const pivotY = sup.yFloor;
      if (pivot === null) pivot = { x: pivotX, y: pivotY };
      const comYBefore = com.y;

      const poseAt = (angle) => restPoseAt(bodies, pivotX, pivotY, dir * angle);
      const held = (pose) => !(restOverhang(pose).slack > 0);

      let lo = 0, hi = 0, found = false;
      // The lowest the composite got anywhere in the sweep, as the fallback for
      // a shape that never catches: clay comes to rest at the bottom of the
      // fall whether or not anything caught it.
      let bestAngle = 0, bestY = comYBefore;
      const budget = REST_MAX_ANGLE - Math.abs(angleTotal);
      while (hi + REST_STEP <= budget) {
        const next = hi + REST_STEP;
        const pose = poseAt(next);
        const y = restCom(pose).y;
        if (y < bestY) { bestY = y; bestAngle = next; }
        if (held(pose)) { lo = hi; hi = next; found = true; break; }
        hi = next;
        if (++guard > 400) break;
      }
      if (!found) {
        if (bestAngle > 0) { bodies = poseAt(bestAngle); angleTotal += dir * bestAngle; }
        break;
      }
      // Land exactly on the moment the new contact catches it, rather than a
      // step past. Both ends of the bracket are known, so this is a plain
      // bisection on a monotone predicate and it converges to 3e-5 rad.
      for (let i = 0; i < REST_BISECT; i++) {
        const mid = (lo + hi) / 2;
        if (held(poseAt(mid))) hi = mid; else lo = mid;
      }
      const landed = poseAt(hi);
      // GRAVITY ONLY EVER LOWERS THINGS. A tip that did not lower the centre of
      // mass is not a topple — it is the solver oscillating between two feet —
      // and it is discarded, which is what bounds this loop absolutely.
      if (restCom(landed).y >= comYBefore - 1e-12) break;
      bodies = landed;
      angleTotal += dir * hi;
    }

    if (Math.abs(angleTotal) < 1e-9 || pivot === null) return null;

    // Recover the net translation from one point, which is exact: the whole
    // motion was rigid, so p' = R(angle)(p - pivot) + pivot + (dx, dy) holds for
    // every primitive once it holds for one.
    const c = Math.cos(angleTotal), s = Math.sin(angleTotal);
    const ax = start[0].x - pivot.x, ay = start[0].y - pivot.y;
    const dx = bodies[0].x - (pivot.x + ax * c - ay * s);
    const dy = bodies[0].y - (pivot.y + ax * s + ay * c);
    return { ids: bodies.map((b) => b.id), angle: angleTotal, cx: pivot.x, cy: pivot.y, dx, dy };
  }

  /** Every component's topple, keyed by lobe id. Pure. */
  function restPlans() {
    const byId = new Map();
    const plans = [];
    for (const group of componentIds()) {
      const plan = restPlanFor(group);
      if (!plan) continue;
      plans.push(plan);
      for (const id of plan.ids) byId.set(id, plan);
    }
    return { plans, byId };
  }

  // One point of one plan, at rotation parameter u in [0, 1].
  function restApplyPoint(plan, u, x, y) {
    const angle = plan.angle * u;
    const c = Math.cos(angle), s = Math.sin(angle);
    const dx = x - plan.cx, dy = y - plan.cy;
    return {
      x: plan.cx + dx * c - dy * s + plan.dx * u,
      y: plan.cy + dx * s + dy * c + plan.dy * u,
    };
  }

  // ...and one vector (an axis), which the translation does not touch.
  function restApplyVector(plan, u, x, y) {
    const angle = plan.angle * u;
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: x * c - y * s, y: x * s + y * c };
  }

  // Writes the FULL topple into the live records. Called once, at the top of
  // beginSettle, so that every existing relaxation effect — the weld press, the
  // merge, and above all the ground flatten — runs on the pose the creature has
  // actually come to rest in rather than on the pose it toppled out of.
  function applyRest(byId) {
    for (const [id, plan] of byId) {
      const record = lobes.get(id);
      if (!record) continue;
      // Seat first, exactly as the solve did (see restBodies). The transform
      // was derived FROM the seated pose, so applying it to an unseated record
      // would rotate the right shape about the wrong place.
      const seated = seatHeight(record);
      if (seated !== null) record.y = seated;
      const p = restApplyPoint(plan, 1, record.x, record.y);
      const v = restApplyVector(plan, 1, record.sx || 0, record.sy || 0);
      record.x = p.x; record.y = p.y;
      record.sx = v.x; record.sy = v.y;
    }
    // Which masses are on the table is a fresh question after a topple: a lobe
    // that was resting and is now in the air must NOT be dragged back down to
    // the wood by the ground re-seat, or the pose that was just solved for
    // would be torn apart the moment it was found.
    for (const id of byId.keys()) {
      const record = lobes.get(id);
      if (record) record.grounded = restingOnGround(record);
    }
  }

  /**
   * The whole creature's pose part-way through the topple, at rotation
   * parameter u in [0, 1]. Read-only, allocates a fresh array, and touches
   * nothing.
   *
   * This is the transform ALONE — no weld press, no relax, no droop — which is
   * what makes it the thing to assert rigidity against: those effects are
   * non-rigid on purpose and asserting through them would prove nothing. u = 0
   * is where the creature is now, u = 1 is where gravity leaves it.
   */
  function restPose(u = 1) {
    const { byId } = restPlans();
    const t = clamp(Number(u) || 0, 0, 1);
    return [...lobes.values()].map((record) => {
      const plan = byId.get(record.id);
      if (!plan) return { id: record.id, x: record.x, y: record.y, sx: record.sx || 0, sy: record.sy || 0 };
      const seated = seatHeight(record);
      const y0 = seated !== null ? seated : record.y;
      const p = restApplyPoint(plan, t, record.x, y0);
      const v = restApplyVector(plan, t, record.sx || 0, record.sy || 0);
      return { id: record.id, x: p.x, y: p.y, sx: v.x, sy: v.y };
    });
  }

  /**
   * The rest state, for review: where each component's clay is, where it is
   * supported, and whether gravity is done with it. Read-only.
   */
  function restState() {
    const { byId } = restPlans();
    return componentIds().map((group) => {
      const bodies = restBodies(group);
      const { sup, com, overhang, slack } = restOverhang(bodies);
      const plan = group.map((id) => byId.get(id)).find(Boolean) || null;
      const drop = groundY === null ? null : sup.yFloor - groundY;
      return {
        ids: group,
        com,
        support: { minX: sup.sMin, maxX: sup.sMax, y: sup.yFloor },
        overhang,
        slack,
        meanRadius: sup.meanRadius,
        onTable: drop !== null && drop > -sup.meanRadius
          && (bodies.some((b) => b.grounded) || drop <= sup.meanRadius * REST_DROP_BAND),
        stable: !plan,
        angle: plan ? plan.angle : 0,
      };
    });
  }

  /**
   * The relaxed end state, as a PURE function of the current one.
   *
   * Jacobi, not Gauss-Seidel: every delta is measured against the same starting
   * snapshot and applied afterwards, so the answer cannot depend on Map
   * iteration order and two identical fields always settle to identical
   * numbers. That is what lets a thumbnail rasterized tomorrow match the stage
   * the child saw today.
   *
   * Five things happen, and every one of them is a FIXED POINT rather than a
   * delta — which is the property that makes the whole relaxation safe to run
   * after every single release, forever, without the creature slowly sagging
   * and closing up:
   *   WELDS DRAW to a set separation. A pair already at (or inside) that
   *   separation does not move at all. This is the visible half of the settle
   *   and the reason a join stops reading as two balls touching.
   *   MASS SPREADS. A ball resting on the table drops to its SETTLED resting
   *   height and stays there.
   *   FRESH WORK RELAXES. A mass elongated since the last settle gives back
   *   SETTLE_RELAX of its length — once, off the length the child just chose.
   *   Its slack is then spent, so working it again relaxes the NEW length by
   *   the same small fraction rather than compounding on the old one.
   *   LIMBS DROOP, out of a lifetime budget. A lobe that has already given its
   *   SETTLE_DROOP_BUDGET has nothing left however many times it is worked.
   *   THE CLAY ROUNDS ITSELF. One same-colour pair that already reads as a
   *   single mass is merged into the single mass it looks like — interpolated
   *   over the whole settle (the absorbed lobe shrinks as the kept one grows,
   *   with their volumes summing to a constant at every instant), so it reads
   *   as clay rounding rather than as anything disappearing.
   *
   * NOTHING is shortened past SETTLE_LENGTH_FLOOR of what the child dragged to,
   * and no lobe is ever removed except by the merge, which conserves its clay.
   */
  function relaxedState() {
    const from = new Map();
    for (const [id, record] of lobes) from.set(id, geometryOf(record));
    const fresh = (id) => (from.get(id)?.slack ?? 0) > 0;

    // --- the merge, chosen once and carried as a target ---
    const pair = bestMergePair();
    const mergeTarget = pair ? mergedGeometry(lobes.get(pair.keepId), lobes.get(pair.goneId)) : null;

    // --- welds draw toward their set separation ---
    const delta = new Map();
    const bump = (id, dx, dy, dz) => {
      const d = delta.get(id) || { dx: 0, dy: 0, dz: 0 };
      d.dx += dx; d.dy += dy; d.dz += dz;
      delta.set(id, d);
    };
    for (const key of fused) {
      const [aId, bId] = key.split('|');
      const a = lobes.get(aId);
      const b = lobes.get(bId);
      if (!a || !b) continue;
      if (a.kind === PULL_KIND || b.kind === PULL_KIND) continue; // a branch rides its parent
      const fa = from.get(aId);
      const fb = from.get(bId);
      let dx = fb.x - fa.x, dy = fb.y - fa.y, dz = fb.z - fa.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1e-9) continue;
      const raA = coneShape(a.radius, Math.hypot(fa.sx, fa.sy, fa.sz), lawOf(a)).ra;
      const raB = coneShape(b.radius, Math.hypot(fb.sx, fb.sy, fb.sz), lawOf(b)).ra;
      const target = (raA + raB) * SETTLE_WELD_SET;
      const close = dist - target;
      if (close <= 0) continue; // already pressed together: a fixed point, not a ratchet
      const freshA = fresh(aId);
      const freshB = fresh(bId);
      if (!freshA && !freshB) continue;
      // The join closes by the same amount however the work is shared, so a
      // new ball landing against a settled body does the whole travel itself
      // rather than dragging the body it landed on.
      const share = freshA && freshB ? 0.5 : 1;
      dx /= dist; dy /= dist; dz /= dist;
      if (freshA) bump(aId, dx * close * share, dy * close * share, dz * close * share);
      if (freshB) bump(bId, -dx * close * share, -dy * close * share, -dz * close * share);
    }

    const settledSink = SINK + SETTLE_SINK;
    const to = new Map();
    for (const [id, record] of lobes) {
      const f = from.get(id);
      const isPull = record.kind === PULL_KIND;
      const next = {
        x: f.x, y: f.y, z: f.z, sx: f.sx, sy: f.sy, sz: f.sz,
        radius: f.radius, settled: 1, slack: 0, droopGiven: f.droopGiven,
        setLength: Math.hypot(f.sx, f.sy, f.sz), grounded: !!f.grounded, gone: false,
      };

      // The merge, as an interpolable target. The absorbed mass shrinks to
      // nothing while the kept one grows to hold both volumes; because both
      // ramp on the same parameter through cube-rooted volume (see
      // writeSettle), the total clay in the field is constant at every instant
      // of the animation, not merely at its two ends.
      if (mergeTarget && id === pair.keepId) {
        next.x = mergeTarget.x; next.y = mergeTarget.y; next.z = mergeTarget.z;
        next.sx = mergeTarget.sx; next.sy = mergeTarget.sy; next.sz = mergeTarget.sz;
        next.radius = mergeTarget.radius;
        next.setLength = Math.hypot(next.sx, next.sy, next.sz);
        to.set(id, next);
        continue;
      }
      if (mergeTarget && id === pair.goneId) {
        next.radius = 0;
        next.gone = true;
        to.set(id, next);
        continue;
      }

      if (!fresh(id)) { to.set(id, next); continue; }

      const own = delta.get(isPull ? anchorOf(id) : id);
      if (own) {
        // Cap the summed demand: a ball welded to four others gets four
        // separate asks, and no one of them ever meant to move it this far.
        const raOwn = coneShape(record.radius, Math.hypot(f.sx, f.sy, f.sz), lawOf(record)).ra;
        const cap = raOwn * SETTLE_WELD_MAX;
        const mag = Math.hypot(own.dx, own.dy, own.dz);
        const k = mag > cap && mag > 0 ? cap / mag : 1;
        next.x += own.dx * k; next.y += own.dy * k; next.z += own.dz * k;
      }

      let length = Math.hypot(f.sx, f.sy, f.sz);
      if (!isPull && groundY !== null) {
        const ra = coneShape(record.radius, length, lawOf(record)).ra;
        // A mass that belongs on the table goes back to the table. Not "if it
        // is currently at rest height" — that test can only ever hold a lobe
        // where it already is, and a reshape that lifted it off the wood would
        // leave the creature floating for the rest of the session.
        const resting = f.grounded || f.y <= groundY + ra * (1 - (SINK + SETTLE_SINK * f.settled)) + 1e-9;
        if (resting) { next.y = groundY + ra * (1 - settledSink); next.grounded = true; }
      }

      if (length > 1e-9) {
        // FRESH WORK RELAXES — the slump that makes a settle read as clay.
        // Floored at the length this mass ALREADY had when it last set, so a
        // child nudging the same limb twenty times does not watch it creep
        // shorter twenty times; only genuinely new length can slump.
        const floorLength = Math.min(length, f.setLength);
        const relaxed = Math.max(length * (1 - SETTLE_RELAX * f.slack), floorLength);
        const shrink = relaxed / length;
        next.sx = f.sx * shrink; next.sy = f.sy * shrink; next.sz = f.sz * shrink;
        length = relaxed;

        const ux = next.sx / length, uy = next.sy / length, uz = next.sz / length;
        // World-down, with the component along the limb removed. Its LENGTH is
        // exactly how horizontal the limb is (1 flat, 0 straight up or down),
        // which is the scale the droop wants anyway.
        const along = -uy;
        let px = -ux * along, py = -1 - uy * along, pz = -uz * along;
        const horizontality = Math.hypot(px, py, pz);
        const remaining = Math.max(0, SETTLE_DROOP_BUDGET - f.droopGiven);
        const angle = Math.min(remaining, SETTLE_DROOP_BUDGET * SETTLE_DROOP_STEP) * horizontality;
        if (horizontality > 1e-6 && angle > 0) {
          px /= horizontality; py /= horizontality; pz /= horizontality;
          const c = Math.cos(angle), sn = Math.sin(angle);
          next.sx = (ux * c + px * sn) * length;
          next.sy = (uy * c + py * sn) * length;
          next.sz = (uz * c + pz * sn) * length;
          next.droopGiven = f.droopGiven + angle;
        }
      }

      if (groundY !== null) {
        const rb = coneShape(record.radius, Math.hypot(next.sx, next.sy, next.sz), lawOf(record)).rb;
        const tipMin = groundY + rb * (1 - settledSink);
        if (next.y + next.sy < tipMin) next.sy = tipMin - next.y;
      }
      next.setLength = Math.hypot(next.sx, next.sy, next.sz);
      to.set(id, next);
    }
    return { from, to, merge: pair ? { keepId: pair.keepId, goneId: pair.goneId } : null };
  }

  /**
   * The topple's own timing, separate from the relaxation's.
   *
   * The relaxation rings past its target and eases back (SETTLE_DECAY /
   * SETTLE_RING), which is right for a weld closing and wrong for a body
   * falling over — an overshoot there would rotate the creature past its side
   * and back, and on the way past it would cut through the table. So the
   * rotation gets a plain smoothstep instead: zero angular velocity at both
   * ends, so it leaves the balance point slowly (the teeter), accelerates
   * through the fall, and absorbs into the wood rather than snapping to a halt.
   * It finishes at REST_PHASE and the relaxation's ring plays out on top of the
   * landed pose, which is what makes a big topple read as heavy.
   */
  function restEase(t) {
    const u = clamp(t / REST_PHASE, 0, 1);
    return u * u * (3 - 2 * u);
  }

  function writeSettle(t) {
    if (!settle) return;
    const clamped = clamp(t, 0, 1);
    // The damped slump (see SETTLE_DECAY/SETTLE_RING). Exactly 0 at t = 0; at
    // t = 1 it is within 1.3% of 1, and that last 1.3% is never rendered
    // because the t >= 1 branch below ASSIGNS the end state rather than
    // interpolating to it — a + (b - a) * 1 is not bit-identical to b in
    // floating point, and the end state has to be, or two runs of the same
    // settle could serialize differently.
    const e = 1 - Math.exp(-SETTLE_DECAY * clamped) * Math.cos(SETTLE_RING * clamped);
    const u = settle.rest.size ? restEase(clamped) : 0;
    for (const [id, a] of settle.from) {
      const record = lobes.get(id);
      if (!record) continue;
      const b = settle.to.get(id);
      if (clamped >= 1) {
        record.x = b.x; record.y = b.y; record.z = b.z;
        record.sx = b.sx; record.sy = b.sy; record.sz = b.sz;
        if (!b.gone) record.radius = b.radius;
        record.settled = b.settled;
        record.slack = b.slack;
        record.droopGiven = b.droopGiven;
        record.setLength = b.setLength;
        record.grounded = b.grounded;
        continue;
      }
      const plan = settle.rest.get(id);
      if (plan) {
        // THE TOPPLE IS A ROTATION AT EVERY INSTANT, not a lerp between two
        // rotated poses. Interpolating the endpoints componentwise would walk
        // every primitive along the CHORD of its arc, and a composite whose
        // parts all cut their own chords is a composite that visibly shrinks
        // and shears as it falls. Instead the rigid transform is evaluated at
        // the rotation's own parameter, and the ordinary relaxation rides on
        // top of it as a residual carried in the un-toppled frame.
        const r = settle.rotated.get(id);
        const base = restApplyPoint(plan, u, a.x, a.y);
        const axis = restApplyVector(plan, u, a.sx, a.sy);
        const dp = restApplyVector(plan, -1, b.x - r.x, b.y - r.y);
        const ds = restApplyVector(plan, -1, b.sx - r.sx, b.sy - r.sy);
        const dpNow = restApplyVector(plan, u, dp.x, dp.y);
        const dsNow = restApplyVector(plan, u, ds.x, ds.y);
        record.x = base.x + dpNow.x * e;
        record.y = base.y + dpNow.y * e;
        record.sx = axis.x + dsNow.x * e;
        record.sy = axis.y + dsNow.y * e;
        // The topple is in the VIEW PLANE, so depth is untouched by it and
        // interpolates exactly as it always did.
        record.z = a.z + (b.z - a.z) * e;
        record.sz = a.sz + (b.sz - a.sz) * e;
      } else {
        record.x = a.x + (b.x - a.x) * e;
        record.y = a.y + (b.y - a.y) * e;
        record.z = a.z + (b.z - a.z) * e;
        record.sx = a.sx + (b.sx - a.sx) * e;
        record.sy = a.sy + (b.sy - a.sy) * e;
        record.sz = a.sz + (b.sz - a.sz) * e;
      }
      // Radius interpolates through VOLUME, not through radius, so a merge in
      // flight conserves the field's total clay at every instant instead of
      // only at its two ends.
      if (a.radius !== b.radius) {
        const va = sphereVolume(a.radius);
        const vb = sphereVolume(b.radius);
        record.radius = Math.max(radiusForVolume(va + (vb - va) * clamp(e, 0, 1)), 1e-9);
      }
      record.settled = a.settled + (b.settled - a.settled) * e;
      record.slack = a.slack + (b.slack - a.slack) * e;
      record.droopGiven = a.droopGiven + (b.droopGiven - a.droopGiven) * e;
    }
    settle.t = clamped;
    if (clamped >= 1 && settle.merge) {
      const { keepId, goneId } = settle.merge;
      const keep = lobes.get(keepId);
      if (keep) keep.baseRadius = Math.max(keep.baseRadius, keep.radius);
      removeLobe(goneId, keepId);
      if (keep) { applyGroundClamp(keep); evaluateFusion(keepId); }
      settle.merge = null;
    }
    if (clamped >= 1) {
      // The relaxation's own effects — the droop especially — can shave a hair
      // off a join it did not mean to touch, so the last thing a settle does is
      // check that every weld still holds. Runs on the same end state whichever
      // path got here (a jump or a frame sequence), so it cannot make the two
      // diverge.
      for (const record of lobes.values()) bedWelds(record);
      // ...and then the joins that just closed become the new floor. This is
      // what stops a child levering a settled weld back open to the hairline it
      // originally fused at.
      noteAllWeldFloors();
    }
  }

  /**
   * Starts a settle and returns the largest distance any surface point will
   * travel over the whole relaxation, in world units — the number the caller
   * (and both test suites) use to prove this is visible from one side and still
   * softening from the other. Interrupting a running settle finishes it first,
   * so a burst of gestures can never leave the clay stranded part-way between
   * two states.
   */
  function beginSettle() {
    if (settle) writeSettle(1);
    settle = null;
    if (lobes.size === 0) return 0;
    // Nothing new to bed in AND nothing left to round together: a composition
    // that has fully taken its set relaxes to itself, so starting a settle
    // would only burn frames on an animation whose first frame equals its last.
    // This is the whole idempotence guarantee, and it is a state test, not a
    // counter.
    let anyFresh = false;
    for (const record of lobes.values()) if ((record.slack || 0) > 0 || (record.settled || 0) < 1) { anyFresh = true; break; }
    // GRAVITY IS THE THIRD REASON TO SETTLE. A creature left standing on one
    // end has something to do even if every mass in it has long since taken its
    // set — which is also how a save made before this existed corrects itself
    // the first time it is put on the table.
    const rest = restPlans();
    if (!anyFresh && !rest.plans.length && !bestMergePair()) return 0;
    // The pose gravity found it in, captured before gravity touches it. This is
    // where the animation starts from, and it is the only copy of it.
    const before = new Map();
    for (const [id, record] of lobes) before.set(id, geometryOf(record));
    // THE TOPPLE HAPPENS FIRST, on the live records, so that everything
    // downstream — the weld press, the merge, and above all the ground flatten
    // and re-seat — is computed against the support the creature has actually
    // come to rest on. Flattening before the rotation would cut the flat patch
    // into the face that ends up in the air.
    if (rest.plans.length) applyRest(rest.byId);
    const { from: rotated, to, merge } = relaxedState();
    let maxDelta = 0;
    for (const [id, a] of before) {
      const b = to.get(id);
      if (!b) continue;
      const baseMove = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const tipMove = Math.hypot(
        (b.x + b.sx) - (a.x + a.sx),
        (b.y + b.sy) - (a.y + a.sy),
        (b.z + b.sz) - (a.z + a.sz),
      );
      maxDelta = Math.max(maxDelta, baseMove, tipMove);
    }
    settle = { from: before, rotated, rest: rest.byId, to, merge, t: 0, maxDelta, merged: !!merge };
    writeSettle(0);
    return maxDelta;
  }

  /** Advances a running settle. Returns true while it still has frames to go. */
  function advanceSettle(dtMs) {
    if (!settle) return false;
    const next = settle.t + Math.max(0, Number(dtMs) || 0) / SETTLE_MS;
    if (next >= 1) { finishSettle(); return false; }
    writeSettle(next);
    return true;
  }

  /** Jumps straight to the settled end state — reduced motion, and saves. */
  function finishSettle() {
    if (!settle) return false;
    writeSettle(1);
    settle = null;
    return true;
  }

  function settleState() {
    return {
      active: !!settle,
      t: settle ? settle.t : 1,
      maxDelta: settle ? settle.maxDelta : 0,
      merging: settle ? !!settle.merge : false,
      // The topple riding along with this settle, if any: how many components
      // are falling over and the largest angle among them, so a reviewer can
      // tell a gravity rest from an ordinary relaxation without measuring
      // pixels.
      resting: settle ? settle.rest.size > 0 : false,
      restAngle: settle
        ? [...new Set(settle.rest.values())].reduce((max, p) => Math.max(max, Math.abs(p.angle)), 0)
        : 0,
      durationMs: SETTLE_MS,
    };
  }

  // --- Consolidation ---------------------------------------------------------

  // The union of everything EXCEPT one lobe. Same order of operations as
  // unionDistance (displacement, smooth union, ground cut) minus the raymarch
  // safety scale, which would only bias the margin this is compared against.
  function unionWithout(shaded, excludeId, px, py, pz) {
    let d = 1000;
    let groundK = 0;
    let any = false;
    for (const s of shaded) {
      if (s.id === excludeId) continue;
      d = smoothMin(d, shadeDistanceOrganic(s, px, py, pz), Math.max(s.blend, 1e-5));
      if (s.radius * 0.10 > groundK) groundK = s.radius * 0.10;
      any = true;
    }
    if (!any) return Infinity;
    if (groundY !== null) d = smoothMax(d, groundY - py, Math.max(groundK, 1e-4));
    return d;
  }

  // Is every point of this lobe's own hull buried inside the rest of the
  // union (or under the table) by more than `margin`? Sampled on a fixed
  // lattice so the answer is reproducible. Points strictly inside the hull are
  // sampled too, not just the shell: a lobe whose caps are buried but whose
  // waist bulges out is still visible, and must not be reclaimed.
  function isAbsorbed(id, shaded, margin) {
    const s = shaded.find((entry) => entry.id === id);
    if (!s) return false;
    for (const station of CONSOLIDATE_STATIONS) {
      const cx = s.x + (s.tipX - s.x) * station;
      const cy = s.y + (s.tipY - s.y) * station;
      const cz = s.z + (s.tipZ - s.z) * station;
      const r = s.radius + (s.tipRadius - s.radius) * station;
      for (const dir of SPHERE_DIRECTIONS) {
        const px = cx + dir[0] * r;
        const py = cy + dir[1] * r;
        const pz = cz + dir[2] * r;
        if (groundY !== null && py < groundY) continue; // under the table is not visible either
        if (unionWithout(shaded, id, px, py, pz) > -margin) return false;
      }
    }
    return true;
  }

  /**
   * Reclaims every slot whose lobe has become invisible. Returns how many.
   * Distinct from the merge above and deliberately so: the merge CHANGES the
   * form (two masses become one rounder one, and it is meant to be seen),
   * while this changes nothing whatsoever — it only stops paying for geometry
   * that is entirely buried. Its clay stays in the creature's books as a
   * permanent loss on the mass that swallowed it, exactly as the bin's does.
   *
   * Only spawned masses are eligible: a dropped ball is what the four-ball gate
   * counts and must never quietly evaporate, however deeply it ends up buried.
   */
  function consolidate() {
    if (lobes.size <= 1) return 0;
    let total = 0;
    for (const record of lobes.values()) total += record.radius;
    const margin = (total / lobes.size) * CONSOLIDATE_MARGIN;
    let reclaimed = 0;
    for (let guard = 0; guard < MAX_LOBES && lobes.size > 1; guard++) {
      const shaded = shading();
      let victim = null;
      for (const record of lobes.values()) {
        if (record.kind !== PULL_KIND) continue;
        if (settle && settle.from.has(record.id)) continue; // never mid-settle
        if (isAbsorbed(record.id, shaded, margin)) { victim = record.id; break; }
      }
      if (!victim) break;
      removeLobe(victim);
      reclaimed += 1;
    }
    return reclaimed;
  }

  // --- The creature's noise seed ---------------------------------------------

  function setSeed(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return false;
    const next = Math.trunc(n);
    if (next !== noiseSeed) { noiseSeed = next; phases.clear(); }
    return true;
  }
  function seed() { return noiseSeed; }

  // A save is a list of lobes and welds — nothing else. There is no ledger to
  // persist any more: a mass's `radius` IS the clay it is made of, so the
  // numbers in the file are the whole truth about the creature.
  //
  // VERSION 4 adds exactly one optional per-lobe field, `law`, and it is
  // written ONLY when it is SHAPE_TAPER. That is the compatibility hinge of
  // the reshaping model: a creature made before it is a set of tapered spikes,
  // and re-deriving those spikes under the blunt law would silently reshape a
  // child's finished work on the shelf. So a pre-v4 payload has SHAPE_TAPER
  // stamped onto every lobe that carries a stretch vector (an unstretched ball
  // is bit-identical under both laws, so it needs nothing), that stamp rides
  // through every later save, and an old creature renders forever exactly as
  // it was made. New clay never carries the field at all, so a v4 save of a
  // ball-only creature is still byte-identical to the v1 one.
  //
  // VERSION 3 added the creature's noise `seed` (without it the hand-worked
  // lumps would be re-rolled on every load and a shelf thumbnail would not
  // match the creature the child made) and a per-lobe `root` (which mass this
  // one was spawned out of). A v1 or v2 payload loads unchanged and gets
  // DEFAULT_NOISE_SEED, which is a CONSTANT and not a random one — an old
  // creature has to look the same every single time it is opened.
  function toJSON() {
    return {
      format: 'qlobe-clay-lobes',
      version: 4,
      seed: noiseSeed,
      lobes: [...lobes.values()].map((lobe) => {
        const sx = lobe.sx || 0, sy = lobe.sy || 0, sz = lobe.sz || 0;
        const entry = {
          id: lobe.id,
          kind: lobe.kind,
          x: round4(lobe.x),
          y: round4(lobe.y),
          z: round4(lobe.z),
          radius: round4(lobe.radius),
          color: lobe.color,
        };
        // Omit sx/sy/sz entirely for a resting ball: keeps v1 payloads (and
        // v2 payloads for never-stretched lobes) byte-identical, and is what
        // makes the stretch-then-unstretch round trip deep-equal exactly.
        if (Math.hypot(sx, sy, sz) > 0) {
          entry.sx = round4(sx);
          entry.sy = round4(sy);
          entry.sz = round4(sz);
        }
        // Omitted for a lobe that grew out of nothing (every dropped ball), so
        // a ball-only creature still serializes byte-identically to v1/v2.
        if (lobe.root) entry.root = lobe.root;
        // Written only for legacy geometry, so a creature made under the
        // reshaping model carries no trace of the law it obeys — the default
        // IS the law.
        if (lobe.law === SHAPE_TAPER) entry.law = SHAPE_TAPER;
        return entry;
      }),
      fused: [...fused],
    };
  }

  function fromJSON(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.format !== 'qlobe-clay-lobes') return false;
    if (!Array.isArray(data.lobes)) return false;
    if (data.lobes.length > maxLobes) return false;

    const newLobes = new Map();
    for (const entry of data.lobes) {
      if (!entry || typeof entry !== 'object') return false;
      const id = entry.id;
      if (typeof id !== 'string' || id.length === 0 || newLobes.has(id)) return false;
      const x = Number(entry.x);
      const y = Number(entry.y);
      const z = entry.z === undefined ? 0 : Number(entry.z);
      const radius = Number(entry.radius);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(radius) || radius <= 0) return false;
      // sx/sy/sz are optional regardless of declared version: a v1 payload
      // simply never has them (-> ball), a v2 payload has them only when
      // stretched. Either way, presence of any one of the three is treated
      // as "this entry specifies a stretch vector" and all three must be finite.
      let sx = 0, sy = 0, sz = 0;
      if (entry.sx !== undefined || entry.sy !== undefined || entry.sz !== undefined) {
        sx = Number(entry.sx ?? 0);
        sy = Number(entry.sy ?? 0);
        sz = Number(entry.sz ?? 0);
        if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz)) return false;
      }
      // THE COMPAT HINGE. A stretched lobe out of a pre-v4 payload was shaped
      // by the taper law and must keep being shaped by it; a v4 payload says
      // so explicitly or is blunt. An unstretched ball is identical under both,
      // so it is left on the default and a ball-only creature carries no legacy
      // marker forward at all.
      const version = Number(data.version) || 0;
      const stretched = Math.hypot(sx, sy, sz) > 0;
      let law = SHAPE_BLUNT;
      if (entry.law === SHAPE_TAPER) law = SHAPE_TAPER;
      else if (version < 4 && entry.law === undefined && stretched) law = SHAPE_TAPER;
      newLobes.set(id, {
        id,
        kind: entry.kind != null ? String(entry.kind) : 'lobe',
        x, y, z, radius, sx, sy, sz,
        // The sizes in the file ARE the new baseline: every lobe reloads owing
        // nothing and owed nothing.
        baseRadius: radius,
        law,
        root: typeof entry.root === 'string' && entry.root ? entry.root : null,
        // A saved creature is a settled creature — the settle always finishes
        // long before anything can be saved — so it reloads fully set, with no
        // slack to relax and its droop budget already spent. That is why none
        // of the three costs the save format anything: a reload must not replay
        // a relaxation the creature already did.
        settled: 1,
        slack: 0,
        droopGiven: SETTLE_DROOP_BUDGET,
        setLength: Math.hypot(sx, sy, sz),
        // Re-derived below, once the ground plane is known.
        grounded: false,
        color: typeof entry.color === 'string' && entry.color ? entry.color : '#7c7c7c',
      });
    }

    const newFused = new Set();
    if (data.fused !== undefined) {
      if (!Array.isArray(data.fused)) return false;
      for (const key of data.fused) {
        if (typeof key !== 'string') continue;
        const parts = key.split('|');
        if (parts.length !== 2) continue;
        const [a, b] = parts;
        if (!newLobes.has(a) || !newLobes.has(b)) continue; // unknown lobe: drop, not fatal
        newFused.add(pairKey(a, b));
      }
    }

    // Only commit once everything validated — a rejected/garbage payload must
    // leave prior state untouched.
    lobes.clear();
    for (const [id, record] of newLobes) lobes.set(id, record);
    fused.clear();
    weldFloor.clear();
    for (const key of newFused) fused.add(key);
    impacts.clear(); // impact is transient input, never restored from a save
    gesture = null;  // ...and so is any live gesture
    settle = null;
    // A payload with no seed is a v1/v2 creature (or a hand-written one), and
    // it gets the constant default rather than anything session-dependent.
    // A reloaded creature's masses are on the table if that is where they are;
    // the flag is geometry, not history, so it needs nothing in the file.
    for (const record of lobes.values()) record.grounded = restingOnGround(record);
    // A LOADED CREATURE'S WELDS ARE HELD TO WHAT THEY MEASURE. The floor is
    // derived here rather than persisted, which is why the save format is still
    // v4 and every file ever written by this game still loads byte-identically:
    // the geometry in the file already IS the record of how deeply the child's
    // welds were pressed together, so there was never anything to add to it.
    noteAllWeldFloors();
    setSeed(Number.isFinite(Number(data.seed)) ? Number(data.seed) : DEFAULT_NOISE_SEED);
    phases.clear();
    autoCounter = 0;
    return true;
  }

  return {
    add, remove, clear, get, list, count, has, move, stretch,
    setGround, ground, setImpact, shape,
    contact, isFused, fusedPairs, partners: partnersOf, maxContact,
    bounds, shading, toJSON, fromJSON,
    // THE ONE GESTURE. beginPull takes hold of the clay under a point, pullTo
    // reshapes it, and one of the three enders finishes: endPull keeps it,
    // cancelPull puts it back bit-exactly, discardPull is the bin. Nothing
    // here can refuse — beginPull returns null only when the finger is on the
    // table rather than on clay.
    raycast, beginPull, pullTo, endPull, cancelPull, discardPull,
    gestureState, pullRefusal,
    // Direct removal of a released spawned mass (the bin, after the fact) and
    // the QA teardown alias.
    pinchOff, squashAway,
    isProtrusion, protrusion, ballCount, totalVolume,
    // Taking its set, the gravity rest that now opens it, and the organic
    // simplification that runs inside it. restState() is read-only: it reports
    // each welded component's centre of mass, its support patch on the table,
    // and whether gravity still has something to say about the pose.
    beginSettle, advanceSettle, finishSettle, settleState, restState, restPose, weldState,
    mergeCandidate: () => { const p = bestMergePair(); return p ? { keepId: p.keepId, goneId: p.goneId, contact: p.score } : null; },
    // Slot reclamation, and the creature's own hand-worked-surface seed.
    consolidate, setSeed, seed,
  };
}
