import {
    BooleanColumn,
    ChoiceColumn,
    DateTimeColumn,
    DecimalColumn,
    IntegerColumn,
    ReferenceColumn,
    StringColumn,
    Table,
} from '@servicenow/sdk/core'

// Data model (APPLICATION_SPEC C2). Content tables (lesson, passage) are
// audited; the high-volume attempt logs are not. No table accepts web-service
// calls: every read and write goes through the widgets and WpmAttemptService.

export const x_snc_ttt_lesson = Table({
    name: 'x_snc_ttt_lesson',
    label: 'Lesson',
    display: 'title',
    audit: true,
    accessibleFrom: 'public',
    actions: { read: true },
    allowWebServiceAccess: false,
    schema: {
        title: StringColumn({ label: 'Title', mandatory: true, maxLength: 80 }),
        unit: ChoiceColumn({
            label: 'Unit',
            mandatory: true,
            dropdown: 'dropdown_without_none',
            default: 'home_row',
            choices: {
                home_row: { label: 'Home row', sequence: 10 },
                top_row: { label: 'Top row', sequence: 20 },
                bottom_row: { label: 'Bottom row', sequence: 30 },
                numbers: { label: 'Numbers', sequence: 40 },
                punctuation: { label: 'Punctuation', sequence: 50 },
                sentences: { label: 'Full sentences', sequence: 60 },
            },
        }),
        order: IntegerColumn({ label: 'Order', mandatory: true }),
        focus_keys: StringColumn({ label: 'Focus keys', maxLength: 40 }),
        text: StringColumn({ label: 'Text', mandatory: true, maxLength: 4000 }),
        min_accuracy: IntegerColumn({ label: 'Minimum accuracy (%)', mandatory: true, default: 90, min: 50, max: 100 }),
        target_net_wpm: IntegerColumn({
            label: 'Target adjusted speed (AWPM)',
            mandatory: true,
            default: 0,
            min: 0,
            max: 200,
        }),
        active: BooleanColumn({ label: 'Active', default: true }),
    },
    index: [{ name: 'x_snc_ttt_lesson_active_order', element: ['active', 'order'], unique: false }],
})

export const x_snc_ttt_passage = Table({
    name: 'x_snc_ttt_passage',
    label: 'Speed-test passage',
    display: 'title',
    audit: true,
    accessibleFrom: 'public',
    actions: { read: true },
    allowWebServiceAccess: false,
    schema: {
        title: StringColumn({ label: 'Title', mandatory: true, maxLength: 80 }),
        text: StringColumn({ label: 'Text', mandatory: true, maxLength: 8000 }),
        active: BooleanColumn({ label: 'Active', default: true }),
    },
})

export const x_snc_ttt_custom_passage = Table({
    name: 'x_snc_ttt_custom_passage',
    label: 'Custom passage',
    display: 'title',
    audit: false,
    accessibleFrom: 'public',
    actions: { read: true },
    allowWebServiceAccess: false,
    schema: {
        user: ReferenceColumn({
            label: 'User',
            referenceTable: 'sys_user',
            mandatory: true,
            default: 'javascript:gs.getUserID()',
            cascadeRule: 'delete',
        }),
        title: StringColumn({ label: 'Title', mandatory: true, maxLength: 80 }),
        text: StringColumn({ label: 'Text', mandatory: true, maxLength: 4000 }),
    },
    index: [{ name: 'x_snc_ttt_custom_passage_user_updated', element: ['user', 'sys_updated_on'], unique: false }],
})

// Player-owned, system-scored. Players create attempts through the widget;
// every later write (state, scores) comes from WpmAttemptService.
export const x_snc_ttt_attempt = Table({
    name: 'x_snc_ttt_attempt',
    label: 'Attempt',
    display: 'passage_title',
    audit: false,
    accessibleFrom: 'public',
    actions: { read: true },
    allowWebServiceAccess: false,
    schema: {
        user: ReferenceColumn({
            label: 'User',
            referenceTable: 'sys_user',
            mandatory: true,
            default: 'javascript:gs.getUserID()',
            cascadeRule: 'delete',
        }),
        mode: ChoiceColumn({
            label: 'Mode',
            mandatory: true,
            dropdown: 'dropdown_without_none',
            default: 'lesson',
            choices: {
                lesson: { label: 'Lesson', sequence: 10 },
                speed_test: { label: 'Speed test', sequence: 20 },
                custom: { label: 'Custom', sequence: 30 },
            },
        }),
        lesson: ReferenceColumn({ label: 'Lesson', referenceTable: 'x_snc_ttt_lesson', cascadeRule: 'clear' }),
        custom_passage: ReferenceColumn({
            label: 'Custom passage',
            referenceTable: 'x_snc_ttt_custom_passage',
            cascadeRule: 'clear',
        }),
        passage_title: StringColumn({ label: 'Passage title', maxLength: 80 }),
        passage_text: StringColumn({ label: 'Passage text', maxLength: 8000 }),
        duration_seconds: IntegerColumn({ label: 'Duration (seconds)' }),
        state: ChoiceColumn({
            label: 'State',
            mandatory: true,
            dropdown: 'dropdown_without_none',
            default: 'in_progress',
            choices: {
                in_progress: { label: 'In progress', sequence: 10 },
                completed: { label: 'Completed', sequence: 20 },
                abandoned: { label: 'Abandoned', sequence: 30 },
                rejected: { label: 'Rejected', sequence: 40 },
            },
        }),
        started_on: DateTimeColumn({ label: 'Started on' }),
        completed_on: DateTimeColumn({ label: 'Completed on' }),
        elapsed_ms: IntegerColumn({ label: 'Elapsed (ms)' }),
        typed_chars: IntegerColumn({ label: 'Typed characters' }),
        keystrokes: IntegerColumn({ label: 'Keystrokes' }),
        missed_keystrokes: IntegerColumn({ label: 'Missed keystrokes' }),
        errors: IntegerColumn({ label: 'Errors' }),
        gross_wpm: DecimalColumn({ label: 'Typing speed (WPM)', scale: 1 }),
        net_wpm: DecimalColumn({ label: 'Adjusted speed (AWPM)', scale: 1 }),
        accuracy: IntegerColumn({ label: 'Accuracy (%)' }),
        passed: BooleanColumn({ label: 'Passed', default: false }),
        personal_best: BooleanColumn({ label: 'Personal best', default: false }),
        flagged: BooleanColumn({ label: 'Flagged', default: false }),
        flag_reason: StringColumn({
            label: 'Flag reason',
            maxLength: 40,
            choices: {
                too_fast: 'Too fast',
                uniform_intervals: 'Uniform intervals',
            },
        }),
    },
    index: [
        {
            name: 'x_snc_ttt_attempt_user_mode_state',
            element: ['user', 'mode', 'state', 'completed_on'],
            unique: false,
        },
        { name: 'x_snc_ttt_attempt_user_lesson', element: ['user', 'lesson', 'passed'], unique: false },
    ],
})

// Per-key hit/miss counts for completed, unflagged attempts (written by the
// service only). key_char holds the lowercased expected character, or
// "space"; it is 8 characters wide so "space" fits.
export const x_snc_ttt_attempt_key = Table({
    name: 'x_snc_ttt_attempt_key',
    label: 'Attempt key statistic',
    display: 'key_char',
    audit: false,
    accessibleFrom: 'public',
    actions: { read: true },
    allowWebServiceAccess: false,
    schema: {
        attempt: ReferenceColumn({
            label: 'Attempt',
            referenceTable: 'x_snc_ttt_attempt',
            mandatory: true,
            cascadeRule: 'delete',
        }),
        user: ReferenceColumn({ label: 'User', referenceTable: 'sys_user', cascadeRule: 'delete' }),
        key_char: StringColumn({ label: 'Key', maxLength: 8 }),
        hits: IntegerColumn({ label: 'Hits', default: 0 }),
        misses: IntegerColumn({ label: 'Misses', default: 0 }),
    },
    index: [{ name: 'x_snc_ttt_attempt_key_user_key', element: ['user', 'key_char'], unique: false }],
})
