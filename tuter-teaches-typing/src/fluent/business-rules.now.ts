import { BusinessRule } from '@servicenow/sdk/core'

// Data integrity lives in before-rules so it holds for every entry point
// (widget, form, list, import, script). Scripts are plain ES5 files under
// ./scripts so they can be linted and read on their own (C10).

export const attemptGuard = BusinessRule({
    $id: Now.ID['br_attempt_guard'],
    name: 'Attempt - force owner, state and snapshot; clear scores',
    table: 'x_snc_ttt_attempt',
    when: 'before',
    action: ['insert'],
    order: 100,
    description:
        'br_attempt_guard: for non-admins, forces user, state and started_on, clears every score field, and takes the text snapshot from real content. Requires lesson / custom passage / duration to match the mode.',
    script: Now.include('./scripts/br-attempt-guard.server.js'),
})

export const lessonTextNormalize = BusinessRule({
    $id: Now.ID['br_text_normalize_lesson'],
    name: 'Lesson - normalize text',
    table: 'x_snc_ttt_lesson',
    when: 'before',
    action: ['insert', 'update'],
    order: 200,
    description: 'br_text_normalize: normalizes lesson text to US-keyboard ASCII and enforces 50-2,000 characters (C2.1).',
    script: Now.include('./scripts/br-text-normalize.server.js'),
})

export const passageTextNormalize = BusinessRule({
    $id: Now.ID['br_text_normalize_passage'],
    name: 'Speed-test passage - normalize text',
    table: 'x_snc_ttt_passage',
    when: 'before',
    action: ['insert', 'update'],
    order: 200,
    description:
        'br_text_normalize: normalizes passage text to US-keyboard ASCII and requires at least 3,000 characters (C2.1).',
    script: Now.include('./scripts/br-text-normalize.server.js'),
})

export const customTextNormalize = BusinessRule({
    $id: Now.ID['br_text_normalize_custom'],
    name: 'Custom passage - normalize text',
    table: 'x_snc_ttt_custom_passage',
    when: 'before',
    action: ['insert', 'update'],
    order: 200,
    description:
        'br_text_normalize: normalizes custom passage text to US-keyboard ASCII and enforces 50-2,000 characters (C2.1).',
    script: Now.include('./scripts/br-text-normalize.server.js'),
})

export const customOwnerLimit = BusinessRule({
    $id: Now.ID['br_custom_owner_limit'],
    name: 'Custom passage - force owner and limit to 100',
    table: 'x_snc_ttt_custom_passage',
    when: 'before',
    action: ['insert'],
    order: 100,
    description: "br_custom_owner_limit: forces the owner for non-admins and rejects a player's 101st passage.",
    script: Now.include('./scripts/br-custom-owner-limit.server.js'),
})

export const lessonOrderUnique = BusinessRule({
    $id: Now.ID['br_lesson_order_unique'],
    name: 'Lesson - unique order and valid thresholds',
    table: 'x_snc_ttt_lesson',
    when: 'before',
    action: ['insert', 'update'],
    order: 100,
    description:
        'br_lesson_order_unique: rejects a duplicate order among active lessons and thresholds outside their C2 ranges.',
    script: Now.include('./scripts/br-lesson-order-unique.server.js'),
})
