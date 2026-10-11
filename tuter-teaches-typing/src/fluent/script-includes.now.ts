import { ScriptInclude } from '@servicenow/sdk/core'

// Replay, score, coach, persist and profile WPM (C4.6). Widgets, business
// rules and ATF all call this one class.
export const wpmAttemptService = ScriptInclude({
    $id: Now.ID['si_wpm_attempt_service'],
    name: 'WpmAttemptService',
    apiName: 'x_snc_ttt.WpmAttemptService',
    accessibleFrom: 'package_private',
    active: true,
    description:
        'Scoring and attempt rules for Abel Tuter Teaches Typing: keystroke-log validation and replay, WPM/AWPM/accuracy, implausibility flags, coach messages, lesson unlocking and profile WPM.',
    script: Now.include('./scripts/WpmAttemptService.server.js'),
})
