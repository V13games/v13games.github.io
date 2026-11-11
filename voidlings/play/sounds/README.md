# Sounds

The `.wav` files here are original sound designs, rendered offline by
[`tools/sounds/makeSounds.ts`](../../../../tools/sounds/makeSounds.ts) (`npm run sounds`)
to the sound descriptions in the game brief: layered noise, filters, resonant metal
banks, saturation and reverb. The game itself never synthesizes anything at runtime: it
plays the files listed in `manifest.json`, and an effect without a file stays silent.
`scare.mp3` is the one recording (a Pixabay sound effect, Pixabay Content License).

| id                      | when it plays                                | design                                                            |
| ----------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| `kill`                  | a kill (killer and victim)                   | metallic blade swipe, steel ring, bone snap, heavy body thump     |
| `scare`                 | the victim's jump scare                      | recorded scream                                                   |
| `vent`                  | entering, leaving or moving through a vent   | metal hatch scraping open, hollow whoosh down the shaft, low thud |
| `emergency`             | an emergency meeting                         | glass-dome slam click and knock, then a repeating high siren      |
| `report`                | a body is reported                           | two-tone panic chime, twice                                       |
| `wireSnap`              | a wire seats in its terminal                 | electric crackle and a mechanical click                           |
| `taskDone`              | a task is finished                           | soft three-note positive chime                                    |
| `cardSlide`             | the card enters the reader                   | plastic sliding through the slit                                  |
| `cardFail` / `taskFail` | bad swipe, wrong wire                        | harsh buzz                                                        |
| `cardOk`                | accepted swipe                               | soft double beep                                                  |
| `laser`                 | asteroid shot                                | punchy retro laser with a short echo                              |
| `explosion`             | asteroid hit                                 | muffled, distant explosion thud                                   |
| `scanLoop`              | while the MedBay scan runs (loop)            | electronic hum with a sweeping beam tone                          |
| `scanDone`              | scan complete                                | clear two-note chime                                              |
| `footsteps`             | while you walk (loop, faster when sprinting) | rubber boots on metal grating                                     |
| `ambience`              | aboard the station (loop)                    | low mechanical hum and ventilation                                |
| `alarm`                 | reactor or O2 meltdown (loop)                | two-tone klaxon                                                   |
| `door`                  | doors slam shut                              | pneumatic hiss and heavy metal slam                               |
| `vote`                  | someone votes                                | stamp                                                             |
| `eject`                 | the ejection screen                          | airlock clunk and rushing air                                     |
| `lightsOut`             | lights sabotaged                             | relay clunk, power winding down                                   |
| `shapeshift`            | the shapeshifter shifts                      | warping morph                                                     |
| `reveal`                | the role reveal                              | deep hit with a metallic shimmer                                  |
| `victory` / `defeat`    | the end screen                               | major / minor stingers                                            |

To change a sound, edit its function in `makeSounds.ts` and run `npm run sounds`; to
use your own recording instead, drop the file here and point its id at it in
`manifest.json`.
