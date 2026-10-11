import { Record, Role } from '@servicenow/sdk/core'

// Player role: take lessons and speed tests, keep custom passages, see your own
// history. Grant it through the "Abel Tuter Teaches Typing Players" group below, not to
// individuals (C3).
export const wpmUserRole = Role({
    name: 'x_snc_ttt.user',
    description:
        'Abel Tuter Teaches Typing player. Can take lessons and speed tests, keep custom passages, and see only their own attempts.',
    grantable: true,
})

// Content administrator: everything a player can do, plus manage lessons and
// speed-test passages and maintain every player's attempts.
export const wpmAdminRole = Role({
    name: 'x_snc_ttt.admin',
    description:
        'Abel Tuter Teaches Typing content administrator. Manages lessons and speed-test passages and can view or remove any player\'s attempts.',
    containsRoles: [wpmUserRole],
})

export const wpmPlayersGroup = Record({
    $id: Now.ID['group_wpm_players'],
    table: 'sys_user_group',
    data: {
        name: 'Abel Tuter Teaches Typing Players',
        description: 'Members can play Abel Tuter Teaches Typing (the x_snc_ttt.user role).',
        active: true,
    },
})

Record({
    $id: Now.ID['group_wpm_players_role_user'],
    table: 'sys_group_has_role',
    data: {
        group: wpmPlayersGroup,
        role: wpmUserRole,
        inherits: true,
    },
})
