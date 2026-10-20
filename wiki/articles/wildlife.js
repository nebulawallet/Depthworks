// Articles: animals, weapons and hunting.
// Wikitext: see the top of wiki.js. Raw HTML blocks must not contain blank lines.
export default [
{
  title: 'Animals', desc: 'Who lives where, how they behave, what they give', cats: ['World'], icon: 'cow',
  body: `'''Animals''' live on the ground in every [[Biomes|biome]] of [[Depthworks]]: familiar farm animals in the gentle biomes, stranger creatures in the harsh ones. They are harmless: nothing in the game attacks you. You can leave them be, shear and catch some of them by hand, or [[Hunting|hunt]] them with a [[Weapons|gun]] for meat, leather, wool, feathers and odder things.

{{gen|animals}}

== Who lives where ==

! Biome !! Animals
| [[Temperate meadow]] || [[Cow|cows]], [[Sheep|sheep]], [[Chicken|chickens]], [[Rabbit|rabbits]] (and the odd [[Fox|fox]])
| [[Old forest]] || [[Pig|pigs]], [[Deer|deer]], [[Fox|foxes]], rabbits
| [[Dry steppe]] || [[Goat|goats]], sheep, [[Wild horse|wild horses]], [[Marmot|marmots]]
| [[Boreal taiga]] || sheep, [[Moose|moose]], [[Snow hare|snow hares]], deer
| [[Fen]] || [[Duck|ducks]], [[Frog|frogs]], [[Heron|herons]]
| [[Glass desert]] || [[Lizard|lizards]], [[Fennec fox|fennec foxes]] (out at night)
| [[Frost waste]] || [[Musk ox|musk oxen]], [[Arctic fox|arctic foxes]], snow hares
| [[Ashlands]] || [[Ember beetle|ember beetles]] and [[Cinder moth|cinder moths]], both glowing at night
| [[Glowcap hollows]] || [[Glowing snail|glowing snails]], [[Spore moth|spore moths]]
| [[Singing steppe]] || [[Crystal crab|crystal crabs]], [[Chime bird|chime birds]] (they ring when they take off)
| [[Pripyatic wastes]] || wild horses, [[Two-headed boar|two-headed boars]]

Animals keep to their biomes: a cow never wanders into the desert.

== How they behave ==

* '''Groups.''' Most animals keep together in small groups, and stragglers drift back to the others.
* '''Day and night.''' Animals graze, wander and lie down to rest by day, and sleep at night. The night creatures (fennec foxes, cinder moths, spore moths) do the opposite. Some are about at all hours.
* '''Getting round things.''' They walk round water, buildings, [[Hollow frame|frames]] and [[Roads|roads]]: they never stand on any of them.
* '''Running away.''' Wild animals run when an engineer comes near: a deer bolts from 9 tiles, a rabbit from 6. '''Farm animals''' (cows, sheep, chickens, pigs, goats, ducks) let you walk right up to them and only step aside, unless you sprint at them. Everything runs from moving [[Vehicles|vehicles]] and from gunfire: a shot scares every animal within 16 tiles. A frightened animal calms down a few seconds after it gets away.
* '''Glowing.''' Ember beetles, cinder moths, glowing snails and spore moths glow at night and light the ground round them.

== Where they come from ==

Animals belong to the land. Every patch of the world holds a population of each animal its biomes support, and it '''fills up again''' over time after you hunt there: a land hunted bare refills over several minutes. Animals only roam near engineers; elsewhere the world just keeps count, so a huge world costs nothing.

'''Factories push wildlife out.''' Land with many working machines on it holds fewer and fewer animals, and with enough of them none at all: the land round a busy factory slowly empties, and the animals live further out. Idle buildings don't count.

== What they give ==

! What !! How
| {{i|raw_meat}} || hunting most animals bigger than a chicken; cook it in a furnace into {{i|cooked_meat}}. See [[Food]].
| {{i|egg}} || chickens and ducks lay them on the ground; pick them up with {{k|pickup}}
| {{i|wool}} || shearing sheep (hold right-click on one), or hunting sheep and musk oxen
| {{i|leather}} || hunting cows, pigs, deer, goats, horses, foxes, lizards and other animals with a hide
| {{i|feathers}} || hunting or catching birds: chickens, ducks, herons, chime birds
| {{i|ember_chitin}} || ember beetles and cinder moths
| {{i|glow_slime}} || glowing snails and spore moths
| {{i|crystal_shell}} || crystal crabs

Meat and eggs are [[Food|food]]. Wool, leather, feathers, chitin, slime and shells have no recipes yet: keep them, crafting with them comes in a later update.

== By hand ==

Some animals don't need a gun. Hold right-click on one, within 3 tiles:

* '''Sheep''' are sheared for 2 wool. The wool grows back in 4 minutes; until then a sheep looks thin and can't be sheared. A sheep stands still while you shear it.
* '''Small, slow animals''' can be caught: chickens, ducks, rabbits, snow hares, frogs, glowing snails and crystal crabs. You get the same as hunting them. Farm birds and snails hold still for you; rabbits and hares run, so sprint to catch one.
* Anything else is too big: hunt it.

== See also ==

* [[Hunting]]
* [[Weapons]]
* [[Food]]
* [[Biomes]]`,
},
{
  title: 'Weapons', desc: 'The five guns, their ammunition, and how to fire them', cats: ['Mechanics'], icon: 'pistol',
  body: `'''Weapons''' in [[Depthworks]] are guns for [[Hunting|hunting]] [[Animals|animals]]. There are no enemies: bullets only ever hit animals, and nothing shoots back.

{{gen|weapons}}

== Firing ==

A gun is an ordinary item, held in your hand like a building or food: pick it from the [[Interface#The HUD|quickbar]] (guns go on the Equipment bar by themselves) or click it in your inventory. With a gun in hand:

* the cursor becomes a '''crosshair''';
* '''left-click fires''' at the cursor, and the engineer turns to face where they shoot. The pistol, shotgun and rifle fire once a click; the SMG and assault rifle keep firing while you hold the button;
* {{k|rotate}} '''reloads''' early, topping the magazine up.

The hand shows how many rounds are loaded, how many you carry, and ''reloading…'' while it reloads. You can't fire from a vehicle.

A shot flies along the ground toward the cursor, as far as the gun's range. '''Buildings and trees stop bullets'''; belts, rails and other things you walk over don't. Each bullet hits the first animal in its way. Guns other than the rifle spread their shots a little, the shotgun a lot.

== Ammunition and reloading ==

Each gun loads a magazine from the [[Weapons#Ammunition|ammunition]] in your inventory. When it runs empty it reloads by itself, which takes its reload time; with no ammunition left it only clicks. Rounds in a magazine stay there when you put the gun away. The pistol and the SMG share pistol rounds, the rifle and the assault rifle share rifle rounds.

== Ammunition ==

{{gen|recipes-of|gunpowder,pistol_ammo,shotgun_shells,rifle_ammo}}

'''Gunpowder''' is crafted, never smelted: put stone in a furnace and you get bricks. Gunpowder, pistol rounds and the pistol need no research. Rifle rounds need an assembler.

== The guns ==

; {{i|pistol}}
: Every engineer lands with one, its magazine loaded, and 30 rounds. Enough for rabbits and sheep; a cow takes about six shots.
; {{i|shotgun}}
: Eight pellets in a wide spread, at short range. Close up, one shell drops most animals; at range the pellets scatter. {{t|firearms}}.
; {{i|rifle}}
: Slow, perfectly accurate and long-reaching: one shot drops anything up to a cow, two a horse, a musk ox or a moose. {{t|firearms_2}}.
; {{i|smg}}
: Fully automatic and quick, but weak and short-ranged, and it eats pistol rounds. {{t|firearms_2}}.
; {{i|assault_rifle}}
: Fully automatic, accurate, with good range: the all-rounder. {{t|firearms_3}}.

== Research ==

The guns are in the '''Military''' section of the [[Research|research tree]], next to Tanks:

{{gen|techs|military}}

== Co-op ==

In [[Multiplayer|co-op]] everyone sees everyone's shots. The host decides what each shot hits, and what the animal gives goes to whoever fired. Bullets never hurt other engineers.

== See also ==

* [[Hunting]]
* [[Animals]]`,
},
{
  title: 'Hunting', desc: 'Shooting animals for meat, leather and more', cats: ['Mechanics'], icon: 'raw_meat',
  body: `'''Hunting''' is shooting [[Animals|animals]] with a [[Weapons|gun]] for what they give: [[Food|meat]], leather, wool, feathers, and the odd things the strange creatures carry. What an animal gives goes straight into the inventory of whoever killed it.

== How many shots ==

Every animal has health, and every bullet does its gun's damage. With the pistol:

{{gen|kills|pistol}}

The bolt-action rifle drops most animals in one shot. The shotgun's pellets each do a little; close up, most of them land.

== Getting close ==

* '''Farm animals''' let you walk right up. Don't sprint at them, and don't miss: a shot sends the whole group running.
* '''Wild animals''' run before you get close. Deer and wild horses outrun you; use a rifle from range, or come at them while they graze.
* Every shot scares everything within 16 tiles, so the first shot counts most. A wounded animal runs too.
* Trees stop bullets. In a forest, find a clear line.
* At night most animals are asleep and stay put, but you see less.

== Other ways to get it ==

* Shear sheep instead of shooting them: 2 wool every 4 minutes, from the same sheep.
* Catch small animals by hand (hold right-click): chickens, ducks, rabbits, snow hares, frogs, glowing snails and crystal crabs. They give the same as shooting them, with no ammunition spent.
* Pick up the eggs chickens and ducks lay with {{k|pickup}}.
* A vehicle running into an animal kills it, and the driver gets what it gives.

== Running out of animals ==

Hunted land fills up again over a few minutes. Land your factory has taken over doesn't: working buildings drive the wildlife out, so the best hunting moves further from your base as it grows.

== See also ==

* [[Weapons]]
* [[Animals]]
* [[Food]]`,
},
];
