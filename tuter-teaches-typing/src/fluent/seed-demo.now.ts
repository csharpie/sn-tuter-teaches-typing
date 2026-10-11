import { Record } from '@servicenow/sdk/core'

// Demo data only (A1.5): two custom passages for the System Administrator
// (user_name admin; this sys_id is the same on every instance).
const SYSTEM_ADMINISTRATOR = '6816f79cc0a8016401c5a33be04be441'

Record({
    $id: Now.ID['demo_custom_passage_01'],
    $meta: { installMethod: 'demo' },
    table: 'x_snc_ttt_custom_passage',
    data: {
        user: SYSTEM_ADMINISTRATOR,
        title: "Practice: my favorite recipe",
        text: "Mix two cups of flour with a pinch of salt. Add one cup of warm water and stir until the dough comes together. Knead it for ten minutes, then let it rest while the oven heats up.",
    },
})

Record({
    $id: Now.ID['demo_custom_passage_02'],
    $meta: { installMethod: 'demo' },
    table: 'x_snc_ttt_custom_passage',
    data: {
        user: SYSTEM_ADMINISTRATOR,
        title: "Practice: a short note",
        text: "Thank you for helping me move last weekend. The new apartment is finally starting to feel like home, and I owe you dinner. Let me know which night works for you next week.",
    },
})
