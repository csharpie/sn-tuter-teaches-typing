import { Acl } from '@servicenow/sdk/core'
import { wpmAdminRole, wpmUserRole } from './roles.now'

// Player-owned, system-scored model (A2, C3):
//   - x_snc_ttt.user  acts only on rows it owns (condition, not script, so the
//     platform can apply it as a query filter).
//   - x_snc_ttt.admin has separate, unconditioned ACLs. No OR-branches.
//   - No user-role write or delete on attempts or attempt keys: scores are
//     written only by WpmAttemptService.
const OWNED_BY_ME = 'userDYNAMIC90d1921e5f510100a9ad2572f2b477fe'
const ACTIVE_ONLY = 'active=true'

// ---------- x_snc_ttt_lesson (admin-managed content)

Acl({
    $id: Now.ID['lesson_read_user'],
    type: 'record',
    table: 'x_snc_ttt_lesson',
    operation: 'read',
    roles: [wpmUserRole],
    condition: ACTIVE_ONLY,
    description: 'Players can read active lessons.',
})

Acl({
    $id: Now.ID['lesson_read_admin'],
    type: 'record',
    table: 'x_snc_ttt_lesson',
    operation: 'read',
    roles: [wpmAdminRole],
    description: 'Admins can read all lessons.',
})

Acl({
    $id: Now.ID['lesson_create_admin'],
    type: 'record',
    table: 'x_snc_ttt_lesson',
    operation: 'create',
    roles: [wpmAdminRole],
    description: 'Only admins create lessons.',
})

Acl({
    $id: Now.ID['lesson_write_admin'],
    type: 'record',
    table: 'x_snc_ttt_lesson',
    operation: 'write',
    roles: [wpmAdminRole],
    description: 'Only admins edit lessons.',
})

Acl({
    $id: Now.ID['lesson_delete_admin'],
    type: 'record',
    table: 'x_snc_ttt_lesson',
    operation: 'delete',
    roles: [wpmAdminRole],
    description: 'Only admins delete lessons.',
})

// ---------- x_snc_ttt_passage (admin-managed content)

Acl({
    $id: Now.ID['passage_read_user'],
    type: 'record',
    table: 'x_snc_ttt_passage',
    operation: 'read',
    roles: [wpmUserRole],
    condition: ACTIVE_ONLY,
    description: 'Players can read active speed-test passages.',
})

Acl({
    $id: Now.ID['passage_read_admin'],
    type: 'record',
    table: 'x_snc_ttt_passage',
    operation: 'read',
    roles: [wpmAdminRole],
    description: 'Admins can read all speed-test passages.',
})

Acl({
    $id: Now.ID['passage_create_admin'],
    type: 'record',
    table: 'x_snc_ttt_passage',
    operation: 'create',
    roles: [wpmAdminRole],
    description: 'Only admins create speed-test passages.',
})

Acl({
    $id: Now.ID['passage_write_admin'],
    type: 'record',
    table: 'x_snc_ttt_passage',
    operation: 'write',
    roles: [wpmAdminRole],
    description: 'Only admins edit speed-test passages.',
})

Acl({
    $id: Now.ID['passage_delete_admin'],
    type: 'record',
    table: 'x_snc_ttt_passage',
    operation: 'delete',
    roles: [wpmAdminRole],
    description: 'Only admins delete speed-test passages.',
})

// ---------- x_snc_ttt_custom_passage (player-owned)

Acl({
    $id: Now.ID['custom_read_own'],
    type: 'record',
    table: 'x_snc_ttt_custom_passage',
    operation: 'read',
    roles: [wpmUserRole],
    condition: OWNED_BY_ME,
    description: 'Players can read their own custom passages.',
})

Acl({
    $id: Now.ID['custom_create'],
    type: 'record',
    table: 'x_snc_ttt_custom_passage',
    operation: 'create',
    roles: [wpmUserRole],
    description: 'Players can create custom passages. A business rule forces the owner to the creator.',
})

Acl({
    $id: Now.ID['custom_write_own'],
    type: 'record',
    table: 'x_snc_ttt_custom_passage',
    operation: 'write',
    roles: [wpmUserRole],
    condition: OWNED_BY_ME,
    description: 'Players can edit their own custom passages.',
})

Acl({
    $id: Now.ID['custom_delete_own'],
    type: 'record',
    table: 'x_snc_ttt_custom_passage',
    operation: 'delete',
    roles: [wpmUserRole],
    condition: OWNED_BY_ME,
    description: 'Players can delete their own custom passages.',
})

Acl({
    $id: Now.ID['custom_read_admin'],
    type: 'record',
    table: 'x_snc_ttt_custom_passage',
    operation: 'read',
    roles: [wpmAdminRole],
    description: 'Admins can read every custom passage.',
})

Acl({
    $id: Now.ID['custom_write_admin'],
    type: 'record',
    table: 'x_snc_ttt_custom_passage',
    operation: 'write',
    roles: [wpmAdminRole],
    description: 'Admins can edit every custom passage.',
})

Acl({
    $id: Now.ID['custom_delete_admin'],
    type: 'record',
    table: 'x_snc_ttt_custom_passage',
    operation: 'delete',
    roles: [wpmAdminRole],
    description: 'Admins can delete every custom passage.',
})

Acl({
    $id: Now.ID['custom_user_field_write_admin'],
    type: 'record',
    table: 'x_snc_ttt_custom_passage',
    field: 'user',
    operation: 'write',
    roles: [wpmAdminRole],
    description: 'Only admins can reassign a custom passage to another user.',
})

// ---------- x_snc_ttt_attempt (player-owned, system-scored)

Acl({
    $id: Now.ID['attempt_read_own'],
    type: 'record',
    table: 'x_snc_ttt_attempt',
    operation: 'read',
    roles: [wpmUserRole],
    condition: OWNED_BY_ME,
    description: 'Players can read their own attempts.',
})

Acl({
    $id: Now.ID['attempt_create'],
    type: 'record',
    table: 'x_snc_ttt_attempt',
    operation: 'create',
    roles: [wpmUserRole],
    description:
        'Players can start attempts. br_attempt_guard forces the owner and state and clears any submitted scores.',
})

Acl({
    $id: Now.ID['attempt_read_admin'],
    type: 'record',
    table: 'x_snc_ttt_attempt',
    operation: 'read',
    roles: [wpmAdminRole],
    description: 'Admins can read every attempt.',
})

Acl({
    $id: Now.ID['attempt_write_admin'],
    type: 'record',
    table: 'x_snc_ttt_attempt',
    operation: 'write',
    roles: [wpmAdminRole],
    description: 'Only admins can edit attempts; players never write scores.',
})

Acl({
    $id: Now.ID['attempt_delete_admin'],
    type: 'record',
    table: 'x_snc_ttt_attempt',
    operation: 'delete',
    roles: [wpmAdminRole],
    description: 'Only admins can delete attempts.',
})

Acl({
    $id: Now.ID['attempt_flag_reason_read_admin'],
    type: 'record',
    table: 'x_snc_ttt_attempt',
    field: 'flag_reason',
    operation: 'read',
    roles: [wpmAdminRole],
    description: 'Why an attempt was flagged is visible to admins only.',
})

Acl({
    $id: Now.ID['attempt_user_field_write_admin'],
    type: 'record',
    table: 'x_snc_ttt_attempt',
    field: 'user',
    operation: 'write',
    roles: [wpmAdminRole],
    description: 'Only admins can reassign an attempt to another user.',
})

// ---------- x_snc_ttt_attempt_key (system-written)

Acl({
    $id: Now.ID['attempt_key_read_own'],
    type: 'record',
    table: 'x_snc_ttt_attempt_key',
    operation: 'read',
    roles: [wpmUserRole],
    condition: OWNED_BY_ME,
    description: 'Players can read their own per-key statistics.',
})

Acl({
    $id: Now.ID['attempt_key_read_admin'],
    type: 'record',
    table: 'x_snc_ttt_attempt_key',
    operation: 'read',
    roles: [wpmAdminRole],
    description: 'Admins can read every per-key statistic.',
})

Acl({
    $id: Now.ID['attempt_key_delete_admin'],
    type: 'record',
    table: 'x_snc_ttt_attempt_key',
    operation: 'delete',
    roles: [wpmAdminRole],
    description: 'Only admins can delete per-key statistics.',
})
