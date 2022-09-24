/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use rand::prelude::*;

// Adjectives in LEFT from Moby :
static LEFT: &[&str] = &[
    "admiring",
    "adoring",
    "affectionate",
    "agitated",
    "amazing",
    "angry",
    "awesome",
    "beautiful",
    "blissful",
    "bold",
    "boring",
    "brave",
    "busy",
    "charming",
    "clever",
    "cool",
    "compassionate",
    "competent",
    "condescending",
    "confident",
    "cranky",
    "crazy",
    "dazzling",
    "determined",
    "distracted",
    "dreamy",
    "eager",
    "ecstatic",
    "elastic",
    "elated",
    "elegant",
    "eloquent",
    "epic",
    "exciting",
    "fervent",
    "festive",
    "flamboyant",
    "focused",
    "friendly",
    "frosty",
    "funny",
    "gallant",
    "gifted",
    "goofy",
    "gracious",
    "great",
    "happy",
    "hardcore",
    "heuristic",
    "hopeful",
    "hungry",
    "infallible",
    "inspiring",
    "interesting",
    "intelligent",
    "jolly",
    "jovial",
    "keen",
    "kind",
    "laughing",
    "loving",
    "lucid",
    "magical",
    "mystifying",
    "modest",
    "musing",
    "naughty",
    "nervous",
    "nice",
    "nifty",
    "nostalgic",
    "objective",
    "optimistic",
    "peaceful",
    "pedantic",
    "pensive",
    "practical",
    "priceless",
    "quirky",
    "quizzical",
    "recursing",
    "relaxed",
    "reverent",
    "romantic",
    "sad",
    "serene",
    "sharp",
    "silly",
    "sleepy",
    "stoic",
    "strange",
    "stupefied",
    "suspicious",
    "sweet",
    "tender",
    "thirsty",
    "trusting",
    "unruffled",
    "upbeat",
    "vibrant",
    "vigilant",
    "vigorous",
    "wizardly",
    "wonderful",
    "xenodochial",
    "youthful",
    "zealous",
    "zen",
];

static RIGHT: &[&str] = &[
    "albatross",
    "antbird",
    "antpitta",
    "antshrike",
    "antwren",
    "babbler",
    "barbet",
    "blackbird",
    "brushfinch",
    "bulbul",
    "bunting",
    "cisticola",
    "cormorant",
    "crow",
    "cuckoo",
    "dove",
    "drongo",
    "duck",
    "eagle",
    "falcon",
    "fantail",
    "finch",
    "flowerpecker",
    "flycatcher",
    "goose",
    "goshawk",
    "greenbul",
    "grosbeak",
    "gull",
    "hawk",
    "heron",
    "honeyeater",
    "hornbill",
    "hummingbird",
    "ibis",
    "jay",
    "kestrel",
    "kingfisher",
    "kite",
    "lark",
    "lorikeet",
    "magpie",
    "mockingbird",
    "monarch",
    "nightjar",
    "oriole",
    "owl",
    "parakeet",
    "parrot",
    "partridge",
    "penguin",
    "petrel",
    "pheasant",
    "piculet",
    "pigeon",
    "pitta",
    "prinia",
    "puffin",
    "quail",
    "robin",
    "sandpiper",
    "seedeater",
    "shearwater",
    "sparrow",
    "spinetail",
    "starling",
    "sunbird",
    "swallow",
    "swift",
    "swiftlet",
    "tanager",
    "tapaculo",
    "tern",
    "thornbill",
    "tinamou",
    "trogon",
    "tyrannulet",
    "vireo",
    "warbler",
    "waxbill",
    "weaver",
    "whistler",
    "woodpecker",
    "wren",
];

/// Generates a random avian name, with the optional extra_random_length added
/// to reduce chance of in-flight collisions.
pub fn generate_name(max_length: usize) -> String {
    let mut rng = rand::thread_rng();
    loop {
        let left = LEFT[rng.gen_range(0..LEFT.len())];
        let right = RIGHT[rng.gen_range(0..RIGHT.len())];
        let s = format!("{}-{}", left, right);
        if s.len() < max_length {
            return s;
        }
    }
}
