import { Record } from '@servicenow/sdk/core'

// Curriculum (C8): 24 lessons across six units, four per unit, 150-400
// characters each. Product content, installed on every instance. Every
// lesson needs 90% accuracy; the AWPM target rises from 0 in unit 1 to 25 in
// unit 6. All text is original.

Record({
    $id: Now.ID['seed_lesson_01'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Home row: A S D F",
        unit: 'home_row',
        order: 1,
        focus_keys: "a s d f",
        text: "asdf fdsa asdf fdsa a as ad add adds as ad a dad dads sad sass fad fads add as a dad adds a sad fad as dads add sass asdf fdsa as sad dad fad add adds sass as ad a sad dad fads asdf",
        min_accuracy: 90,
        target_net_wpm: 0,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_02'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Home row: J K L ;",
        unit: 'home_row',
        order: 2,
        focus_keys: "j k l ;",
        text: "jkl; ;lkj jkl; ;lkj all fall lad lads ask asks flask flasks salad salads alas; a sad lad asks dad; all lads fall; a flask falls; dad asks all lads; ask a sad lass; all salads; jkl; ;lkj",
        min_accuracy: 90,
        target_net_wpm: 0,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_03'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Home row: reaching G and H",
        unit: 'home_row',
        order: 3,
        focus_keys: "g h",
        text: "gh hg gh hg had has half hall glad flag flash dash gash hash shall; a glad lad had half a flag; dad has a flash; all glass halls flash; a lass has salsa; shall dad ask; gh hg",
        min_accuracy: 90,
        target_net_wpm: 0,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_04'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Home row review",
        unit: 'home_row',
        order: 4,
        focus_keys: "asdf jkl; gh",
        text: "a glad lad asks dad; dad has a flask; all lads had a salad; a sad lass falls; half a hall has glass; dad shall ask a glad lass; a flag lags; ask dad; all glass halls; hash salads; lads dash; ha ha ha",
        min_accuracy: 90,
        target_net_wpm: 0,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_05'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Top row: E and I",
        unit: 'top_row',
        order: 5,
        focus_keys: "e i",
        text: "ei ie ei ie field file life like hike idea ideal shield slide glide seal deal heal lead leaf shelf skies aside lake kale jade hide side aisle; she likes a field; he hides a jade dish; a leaf falls aside; dad likes kale",
        min_accuracy: 90,
        target_net_wpm: 5,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_06'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Top row: R and U",
        unit: 'top_row',
        order: 6,
        focus_keys: "r u",
        text: "ru ur ru ur rule ruler sure user rug hug fur dusk husk rush fuel glue lure surf rural radar arise raised shared issue guide dried hired; a user rushed a ruler; she is sure dad hired a guide; real rules; red rugs",
        min_accuracy: 90,
        target_net_wpm: 5,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_07'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Top row: T and Y",
        unit: 'top_row',
        order: 7,
        focus_keys: "t y",
        text: "ty yt ty yt they yet try yard duty tidy hasty jury eighty thirty tray stray yield rusty tasty truly study daily steady; they study at a steady rate; try a tasty tray first; the yard is tidy daily; truly a great day",
        min_accuracy: 90,
        target_net_wpm: 5,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_08'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Top row: W O Q P",
        unit: 'top_row',
        order: 8,
        focus_keys: "w o q p",
        text: "wo ow qp pq power people quote quiet wipe swap show pour word work quip equip pool loop swoop upper props; a quiet owl swoops low; people work with power tools; write a short quote; pour the water; top it up",
        min_accuracy: 90,
        target_net_wpm: 5,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_09'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Bottom row: C and N",
        unit: 'bottom_row',
        order: 9,
        focus_keys: "c n",
        text: "cn nc cn nc can nice since dance clean cotton once ocean canal candle fancy finch lunch picnic kitchen chance corner; a nice clean kitchen; once a finch sang in a corner; candles on the canal at night; a fancy picnic lunch",
        min_accuracy: 90,
        target_net_wpm: 10,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_10'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Bottom row: V and M",
        unit: 'bottom_row',
        order: 10,
        focus_keys: "v m",
        text: "vm mv vm mv move vivid seven vast most milk music movie remove volume voice every memory march museum vitamin harmony; move the music volume up; seven vivid movies; every voice in harmony; a vast museum of memories",
        min_accuracy: 90,
        target_net_wpm: 10,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_11'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Bottom row: B, comma and period",
        unit: 'bottom_row',
        order: 11,
        focus_keys: "b , .",
        text: "b, b. bb ,, .. a bike, a bus, a boat. bring bread, butter and berries. the baby blinked. bob built a big blue barn. bees hum by the brook. both boys bowed, then bolted. a bright, bold banner. be brave.",
        min_accuracy: 90,
        target_net_wpm: 10,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_12'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Bottom row: X, Z and slash",
        unit: 'bottom_row',
        order: 12,
        focus_keys: "x z /",
        text: "x/z z/x x/z zebra zone zero zigzag zip fox box mix fix six taxi oxen lazy dozen jazz fizz extra next and/or yes/no on/off; six lazy foxes fixed a box; a dozen zebras zigzag; mix the jazz and/or blues; zip it up/down",
        min_accuracy: 90,
        target_net_wpm: 10,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_13'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Numbers: 1 2 3 4 5",
        unit: 'numbers',
        order: 13,
        focus_keys: "1 2 3 4 5",
        text: "1 2 3 4 5 12 23 34 45 51 123 345 241 535; we packed 15 bags and 24 boxes; the bus left at 3 and came back at 5; 41 birds sat on 2 wires; she ran 12 laps in 34 minutes; 1 2 3 4 5 54 43 32 21",
        min_accuracy: 90,
        target_net_wpm: 15,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_14'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Numbers: 6 7 8 9 0",
        unit: 'numbers',
        order: 14,
        focus_keys: "6 7 8 9 0",
        text: "6 7 8 9 0 67 78 89 90 60 706 890 968; the train has 60 seats and 78 bags; page 96 has 8 photos; 70 runners ran 9 miles; we planted 80 trees in 6 rows; count from 0 to 9 and back; 9 8 7 6 0",
        min_accuracy: 90,
        target_net_wpm: 15,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_15'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Numbers in context",
        unit: 'numbers',
        order: 15,
        focus_keys: "1 2 3 4 5 6 7 8 9 0",
        text: "room 204 has 18 desks and 36 chairs. the club meets on day 7 at 6 pm. our team scored 25 points in 4 games. a box holds 12 pens, so 9 boxes hold 108 pens. call 555 0199 to book 3 tickets.",
        min_accuracy: 90,
        target_net_wpm: 15,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_16'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Numbers review",
        unit: 'numbers',
        order: 16,
        focus_keys: "1 2 3 4 5 6 7 8 9 0",
        text: "a year has 365 days, 52 weeks and 12 months. the recipe needs 2 cups of flour, 1 egg and 250 grams of sugar. bus 47 stops at 8, 10 and 15 minutes past the hour. we walked 6 km in 90 minutes.",
        min_accuracy: 90,
        target_net_wpm: 15,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_17'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Capital letters with Shift",
        unit: 'punctuation',
        order: 17,
        focus_keys: "Shift",
        text: "Anna and Ben met Chloe in Dublin. Every Monday, Grace visits Hana in Iowa. Jack, Kim and Liam joined Maya at North Park. Owen and Priya read Quiet Rivers on Sunday. Tom told Uma about Vienna, Warsaw and York.",
        min_accuracy: 90,
        target_net_wpm: 20,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_18'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Question and exclamation marks",
        unit: 'punctuation',
        order: 18,
        focus_keys: "? !",
        text: "Are you ready? Yes! Can we start now? Of course! Who wrote this? I did! Where is the key? Here it is! How fast can you type? Faster every day! What a great lesson! Is it time for a break? Not yet!",
        min_accuracy: 90,
        target_net_wpm: 20,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_19'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Quotes and apostrophes",
        unit: 'punctuation',
        order: 19,
        focus_keys: "' \"",
        text: "\"Let's go,\" said Mia. \"It's a great day for a walk.\" Sam's dog didn't want to stop. \"We're almost there,\" I said. The kids' kites flew high. \"Don't forget your hat!\" called Dad. She'd said \"maybe\" twice.",
        min_accuracy: 90,
        target_net_wpm: 20,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_20'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Colons, semicolons, hyphens and parentheses",
        unit: 'punctuation',
        order: 20,
        focus_keys: ": ; - ( )",
        text: "Pack three things: a map, a snack and a coat. The trail is long; the view is worth it. A well-known guide (Sam) led the way. Note: the north path is closed (for now). We left at 9:30 and came back at 4:15; everyone was happy.",
        min_accuracy: 90,
        target_net_wpm: 20,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_21'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Sentences: a morning walk",
        unit: 'sentences',
        order: 21,
        focus_keys: "",
        text: "The sun rose slowly over the quiet hills. A light breeze moved through the tall grass, and birds began to sing. We walked along the river path, counting the boats and waving to people on the bridge. By eight o'clock the town was awake.",
        min_accuracy: 90,
        target_net_wpm: 25,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_22'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Sentences: the library",
        unit: 'sentences',
        order: 22,
        focus_keys: "",
        text: "The library on Oak Street opens at nine. Inside, the shelves are full of maps, novels and old magazines. A kind librarian helps visitors find what they need, and children gather on soft rugs for story time every Saturday morning.",
        min_accuracy: 90,
        target_net_wpm: 25,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_23'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Sentences: building a habit",
        unit: 'sentences',
        order: 23,
        focus_keys: "",
        text: "Practice a little every day. Sit up straight, keep your wrists relaxed and look at the screen, not the keys. Accuracy comes first; speed follows on its own. After a few weeks, your fingers will find each key without thinking.",
        min_accuracy: 90,
        target_net_wpm: 25,
        active: true,
    },
})

Record({
    $id: Now.ID['seed_lesson_24'],
    table: 'x_snc_ttt_lesson',
    data: {
        title: "Sentences: the final lesson",
        unit: 'sentences',
        order: 24,
        focus_keys: "",
        text: "Congratulations on reaching the last lesson. You have learned every row of the keyboard, the numbers and the most common punctuation. Keep practicing with speed tests and your own passages. Every word you type makes the next one a little easier.",
        min_accuracy: 90,
        target_net_wpm: 25,
        active: true,
    },
})
