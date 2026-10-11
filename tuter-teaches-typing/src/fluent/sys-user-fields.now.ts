import { Acl, CrossScopePrivilege, Record } from '@servicenow/sdk/core'
import { wpmAdminRole, wpmUserRole } from './roles.now'

// The one approved change to a platform table (A1.1, C2.2): the player's
// latest and best WPM from completed timed rounds, owned by this scope and
// removed with their data on uninstall. Only WpmAttemptService writes them.
//
// Defined as sys_dictionary + column-level sys_documentation Records (the C2.2
// fallback) rather than Table({augments: 'sys_user'}): in SDK 4.12.2 an
// augments build also emits a table-level sys_documentation record labelled
// "Sys User", which would overwrite the platform's label for the User table.

Record({
    $id: Now.ID['sys_user_wpm_latest_column'],
    table: 'sys_dictionary',
    data: {
        name: 'sys_user',
        element: 'x_snc_ttt_words_per_minute_latest',
        internal_type: 'integer',
        column_label: 'Words per minute (latest)',
        active: true,
        read_only: true,
        mandatory: false,
        display: false,
        audit: false,
    },
})

Record({
    $id: Now.ID['sys_user_wpm_latest_label'],
    table: 'sys_documentation',
    data: {
        name: 'sys_user',
        element: 'x_snc_ttt_words_per_minute_latest',
        language: 'en',
        label: 'Words per minute (latest)',
        plural: 'Words per minute (latest)',
    },
})

Record({
    $id: Now.ID['sys_user_wpm_best_column'],
    table: 'sys_dictionary',
    data: {
        name: 'sys_user',
        element: 'x_snc_ttt_words_per_minute_best',
        internal_type: 'integer',
        column_label: 'Words per minute (best)',
        active: true,
        read_only: true,
        mandatory: false,
        display: false,
        audit: false,
    },
})

Record({
    $id: Now.ID['sys_user_wpm_best_label'],
    table: 'sys_documentation',
    data: {
        name: 'sys_user',
        element: 'x_snc_ttt_words_per_minute_best',
        language: 'en',
        label: 'Words per minute (best)',
        plural: 'Words per minute (best)',
    },
})

// "Record is me": the user record's own sys_id is the session user.
const RECORD_IS_ME = 'sys_idDYNAMIC90d1921e5f510100a9ad2572f2b477fe'

// ---------- Words per minute (latest)

Acl({
    $id: Now.ID['wpm_latest_read_self'],
    type: 'record',
    table: 'sys_user',
    field: 'x_snc_ttt_words_per_minute_latest',
    operation: 'read',
    roles: [wpmUserRole],
    condition: RECORD_IS_ME,
    description: 'Players can read their own latest WPM.',
})

Acl({
    $id: Now.ID['wpm_latest_read_admin'],
    type: 'record',
    table: 'sys_user',
    field: 'x_snc_ttt_words_per_minute_latest',
    operation: 'read',
    roles: [wpmAdminRole],
    description: "Abel Tuter Teaches Typing admins can read every player's latest WPM.",
})

// No application role may write the profile WPM columns (C3): only the system
// write in WpmAttemptService changes them. These field ACLs keep the
// platform's broader sys_user write rules from applying, leaving only the
// platform admin role, which overrides ACLs anyway.
Acl({
    $id: Now.ID['wpm_latest_write_platform_admin'],
    type: 'record',
    table: 'sys_user',
    field: 'x_snc_ttt_words_per_minute_latest',
    operation: 'write',
    roles: ['admin'],
    description: 'Latest WPM is written only by WpmAttemptService; no application role can edit it.',
})

// ---------- Words per minute (best)

Acl({
    $id: Now.ID['wpm_best_read_self'],
    type: 'record',
    table: 'sys_user',
    field: 'x_snc_ttt_words_per_minute_best',
    operation: 'read',
    roles: [wpmUserRole],
    condition: RECORD_IS_ME,
    description: 'Players can read their own best WPM.',
})

Acl({
    $id: Now.ID['wpm_best_read_admin'],
    type: 'record',
    table: 'sys_user',
    field: 'x_snc_ttt_words_per_minute_best',
    operation: 'read',
    roles: [wpmAdminRole],
    description: "Abel Tuter Teaches Typing admins can read every player's best WPM.",
})

Acl({
    $id: Now.ID['wpm_best_write_platform_admin'],
    type: 'record',
    table: 'sys_user',
    field: 'x_snc_ttt_words_per_minute_best',
    operation: 'write',
    roles: ['admin'],
    description: 'Best WPM is written only by WpmAttemptService; no application role can edit it.',
})

// ---------- Cross-scope access for the system write (sys_user is global)

CrossScopePrivilege({
    $id: Now.ID['csp_sys_user_read'],
    operation: 'read',
    status: 'allowed',
    targetName: 'sys_user',
    targetScope: 'global',
    targetType: 'sys_db_object',
})

CrossScopePrivilege({
    $id: Now.ID['csp_sys_user_write'],
    operation: 'write',
    status: 'allowed',
    targetName: 'sys_user',
    targetScope: 'global',
    targetType: 'sys_db_object',
})
