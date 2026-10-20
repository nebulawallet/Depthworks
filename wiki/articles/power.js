// Articles: electricity and where it comes from, and the day it follows.
export default [
{
  title: 'Electricity', desc: 'Poles, networks, voltages and brownouts', cats: ['Power'], icon: 'small_pole',
  body: `'''Electricity''' runs nearly every machine past the burner age in [[Depthworks]]. Generators feed it into networks of poles, and machines standing inside a pole's '''supply area''' draw from that network.

{{further|Steam power|Solar power|Hydroelectric power|Nuclear power}}

== Networks ==

Poles of one voltage join into a '''network''' by themselves when they are within wire reach of each other, or when their supply areas overlap. You can also string a wire by hand: hold a {{i|power_cable}}, click one pole, then another of the same voltage up to 32 tiles away. Click a linked pair again to take the cable down. Wires and supply areas show while you hold a pole.

Each network has its own supply and demand. Click a pole to see its network. Removing a pole may split a network in two, and gives back any cables strung to it.

Drag poles to lay a line: they are spaced to their wire reach, and the preview shows where each will go.

== Poles ==

{{gen|poles}}

== Voltages ==

There are two voltages. Poles only wire to poles of their own voltage, and a transformer station carries power from one to the other.

{{gen|voltages}}

; Low voltage (LV)
: What most machines run on, and what generators feed: steam engines, diesel generators and solar panels all feed the pole whose area they stand in.
; High voltage (HV)
: {{i|power_line|Power lines}} cover a large area and wire up to 24 tiles apart. A {{i|transformer}} wires itself to low voltage poles nearby; link it to a power line with a {{i|transformer_cable}}. Machines can run straight off a power line's area too. [[Dam|Dams]] join high voltage only.

Voltages only decide what can connect; a station passes as much power as is needed.

== Generators ==

{{gen|generators}}

Steam engines, diesel generators and reactors '''only work as hard as the network needs''': spare capacity burns no fuel.

== Brownouts ==

When a network needs more than its generators can give, every machine on it slows down by the same share. The status panel shows power produced against capacity; a machine with too little power shows a flashing '''yellow''' plug, and one with none a '''red''' plug. A machine outside every supply area says "not connected".

== Direct wiring ==

After {{t|direct_wiring}}, a power cable can also run from a small pole, medium pole or power line straight to a machine up to 12 tiles away, which then draws from that pole wherever it stands. One cable a machine; click the pole first. Generator poles and stations can't do this.

== Powered roads ==

With {{t|road_power}}, conduits inside road tiles carry low voltage to machines right beside the road. See [[Roads#Powered roads|powered roads]].

== Night ==

[[Solar power|Solar panels]] give nothing at night, and there are no accumulators to store power, so keep steam, diesel or another source running. See [[Day and night]].

== See also ==

* [[Steam power]]
* [[Day and night]]`,
},
{
  title: 'Steam power', desc: 'Water pumps, boilers and steam engines', cats: ['Power'], icon: 'steam_engine',
  body: `'''Steam power''' is the first source of [[Electricity|electricity]] in [[Depthworks]], and stays one of the most important. A water pump feeds boilers, boilers turn water into steam, and steam engines turn steam into power. Everything needed is craftable from the start.

== The chain ==

# A {{i|water_pump}} on water pumps up to 1,200 water a second.
# A {{i|boiler}} (two tiles wide) burns fuel to turn 60 water a second into steam: 1.8 MW of heat.
# A {{i|steam_engine}} (2×2) turns 30 steam a second into up to 900 kW.
# A {{i|small_pole}} next to the engines takes their power; poles wired on from it carry it to your machines.

== Ratios ==

! Pumps !! Boilers !! Steam engines !! Power
| 1 || 1 || 2 || 1.8 MW
| 1 || 10 || 20 || 18 MW
| 1 || 20 || 40 || 36 MW

'''One pump feeds 20 boilers; one boiler feeds two engines exactly.''' Adding more boilers or engines past a pump's 1,200 water/s adds nothing. A {{i|hp_pump}} pumps 3,600 water a second (60 boilers, 120 engines), but only through [[Steel pipe|steel pipe]] all the way.

== Connections ==

Water and steam pass between buildings that touch, so a pump, a boiler and two engines in a row need no pipes at all. With pipes:

* '''Boilers''' take water in and pass it on at both short ends, and put steam out of the back. Rows of boilers pass water along from end to end.
* '''Steam engines''' take steam in and pass it on at the front and back, so engines chain end to end. Touching engines join on any side.

Hover over a boiler or an engine to see a blue and orange pair of arrows where a fluid passes through. {{k|rotate}} turns them when there is room.

== Fuel ==

Boilers burn any solid fuel. At full output a boiler burns a piece of coal every 2.2 seconds, but boilers (like engines) only work as hard as the network needs, so a lightly loaded plant burns very little. Fuel them with inserters from a belt of coal.

== Old worlds ==

In worlds saved before boilers and engines became big, the old one-tile ones stay as they were. Worlds from when generators needed their own '''extra-low voltage''' network (generator poles, step-up stations and step-up cables) keep working: those poles and stations turn into small electric poles, and their cables into power cables.

== See also ==

* [[Electricity]]
* [[Fluids]]
* [[Nuclear power]]`,
},
{
  title: 'Solar power', desc: 'Solar panels and the sun', cats: ['Power'], icon: 'solar',
  body: `'''Solar power''' comes from {{i|solar|solar panels}}, unlocked by {{t|solar}}. A panel gives up to 60 kW in full daylight, less at dusk and dawn, and nothing at night. It needs no fuel and feeds [[Electricity#Voltages|low voltage]] directly: just put it in a pole's area.

Output follows the sun on the [[Day and night|24-hour clock]]: the sun rises at 05:30 and sets at 20:00, climbing and sinking smoothly in between, so a panel gives most around midday. There are no accumulators, so a solar factory stops at night unless steam, diesel or another source takes over.

Solar panels are handy for starting [[Hydroelectric power|dams]], which need a little power before they give any.

== See also ==

* [[Electricity]]
* [[Day and night]]`,
},
{
  title: 'Hydroelectric power', desc: 'Dams across water', cats: ['Power'], icon: 'dam',
  body: `'''Hydroelectric power''' comes from {{i|dam|dams}} built across water, unlocked by {{t|hydro_power}}. A dam gives a lot of power with no fuel at all.

== Building a dam ==

Hold dam items and drag across water: the dam goes down two tiles wide, and every tile takes one dam item. Touching dams join into one. Roads can run along the top. Mining a dam gives back one item a tile.

== Power ==

A running dam gives '''180 kW a tile''' on still water. On a river the current adds more: river tiles give 2.4 times as much (432 kW a tile).

A dam is '''high voltage''' only: put a [[Power line|power line]] or a [[Transformer station|transformer station]] over it. It needs '''300 kW''' to run its gates before it gives anything, so it can't start on a network with nothing else on it. Give it a kick-start from steam or [[Solar power|solar]]; once running, it keeps itself going.

== See also ==

* [[Electricity]]
* [[World generation#Water|Water in the world]]`,
},
{
  title: 'Nuclear power', desc: 'Uranium, reactors and coolant towers', cats: ['Power'], icon: 'reactor',
  body: `'''Nuclear power''' is the most powerful source of [[Electricity|electricity]] in [[Depthworks]]. A '''uranium reactor''' boils 2,000 water a second into steam, enough for about 66 [[Steam engine|steam engines]], or 60 MW. It runs hot, and must be kept cool.

{{note|Nuclear power needs {{t|nuclear_power}}, which costs [[Terrestrial pack|terrestrial packs]] as well as the usual three, so it comes after [[Agriculture|agriculture]].}}

== Uranium ==

{{i|uranium_ore}} is found mostly in the [[Pripyatic wastes]], far from the landing site, and rarely elsewhere. It can be dug by hand, slowly, at the cost of a little [[Hazards#Radiation|radiation]]. Drills need '''sulfuric acid''' to mine it, and only a {{i|leach_drill}} can feed it: 10 acid for every piece of ore, piped into its back.

{{gen|recipes-of|sulfuric_acid, uranium_processing, uranium_fuel_cell}}

Sulfuric acid is made in a [[Chemical plant|chemical plant]]. A {{i|centrifuge}} spins ten uranium ore into one {{i|enriched_uranium}}, and an assembler makes ten {{i|uranium_fuel_cell|fuel cells}} from it. A fuel cell holds 4,000 MJ, as much as a thousand pieces of coal, and lasts over a minute at full power.

== The reactor ==

A {{i|reactor}} burns fuel cells to turn water into steam, only as fast as the engines draw it. Pipes join water at its left and right, steam at its front and back; steam engines and coolant towers can simply touch it.

== Cooling ==

Put a {{i|coolant_tower}} against the reactor and pipe water to it. One tower cools a reactor at full power, drawing up to 1,800 water a second. Without enough cooling, the reactor heats up:

! Heat !! State
| below 60% || running normally
| 60% || '''overheating''': it needs more cooling
| 85% || '''critical''': it will break
| 100% || '''broken''', and its coolant towers with it

A reactor cools down again once it has enough cooling. A broken reactor or tower stays broken: repair it from its panel with parts (a reactor takes 40 steel, 10 advanced circuits and 20 stone bricks; a tower 20 steel and 10 pipes), or mine it for scrap and build another. Its warning beacon shows its state: green, amber, flashing red, and dark when broken.

== Water ==

A reactor at full power and its tower together draw 3,800 water a second, more than one [[High pressure pump|high pressure pump]] (3,600). Use two pumps, or separate water lines for the reactor and the tower.

== See also ==

* [[Steam power]]
* [[Oil processing]]`,
},
{
  title: 'Day and night', desc: 'The 24-minute day, lamps and light', cats: ['Mechanics'], icon: 'lamp',
  body: `[[Depthworks]] has a '''day and night''' cycle on a 24-hour clock shown in the status panel. A full day lasts '''24 minutes''': one real minute is one hour.

== The day ==

{{gen|daytable}}

The sun climbs and sinks smoothly, so the light changes all day: warm and low in the morning and evening, white at midday, moonlight at night. Evenings stay fairly light; only the hours around midnight are really dark.

== Effects ==

* [[Solar power|Solar panels]] follow the sun and give nothing at night.
* Lamps and braziers come on by themselves once it is properly dark.
* Working machines glow: furnaces, boilers, assemblers, labs, refineries, depots, the transmitter, the reactor and more. So do moving vehicles, every engineer, muzzle flashes, and a few [[Animals|animals]]: ember beetles, cinder moths, glowing snails and spore moths.
* Most animals lie down and sleep at night; a few night creatures (fennec foxes and the moths) come out instead.
* The interface is drawn after the lighting, so it never darkens.

== Lights ==

! Light !! Radius !! Runs on
| {{i|lamp}} || 7.5 tiles || 5 kW of power
| {{i|green_lamp}} || 7.5 tiles || 5 kW; speeds up greenhouses next to it
| {{i|brazier}} || 5.5 tiles || coal or wood (a piece of coal lasts about 200 seconds)

The ''Night eyes'' [[Medical research|mutation]] makes your own light reach further.

== In co-op ==

A guest's clock starts at the host's when they join; over a long session the time of day can drift a little between them.

== See also ==

* [[Solar power]]
* [[Electricity]]`,
},
];
