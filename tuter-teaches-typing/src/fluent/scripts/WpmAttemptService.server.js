/**
 * WpmAttemptService - the single home for scoring and attempt rules
 * (APPLICATION_SPEC C4, C4.6).
 *
 * Widget server scripts are thin adapters over this class: each maps its
 * actions to methods here and hands them to respond(), which owns the role
 * check, error wording and data shape. ATF calls the methods directly.
 * "Pure" methods (normalizeText, validateLog, score, chooseCoach)
 * touch no records and no clock, so tests can call them with fixed inputs.
 * Every other public method checks the x_snc_ttt.user role first and returns
 * {errorCode: 'no_role'} without it.
 *
 * Written in ES5 style (var, function) for the Glide script engine.
 */
var WpmAttemptService = Class.create();

WpmAttemptService.prototype = {
  TABLE_LESSON: 'x_snc_ttt_lesson',
  TABLE_PASSAGE: 'x_snc_ttt_passage',
  TABLE_CUSTOM: 'x_snc_ttt_custom_passage',
  TABLE_ATTEMPT: 'x_snc_ttt_attempt',
  TABLE_ATTEMPT_KEY: 'x_snc_ttt_attempt_key',
  ROLE_USER: 'x_snc_ttt.user',
  ROLE_ADMIN: 'x_snc_ttt.admin',

  MODES: ['lesson', 'speed_test', 'custom'],
  DURATIONS: [60, 120, 180, 300],
  ENDED: ['complete', 'timeout', 'exit'],
  SYS_ID: /^[0-9a-f]{32}$/,

  MAX_EVENTS: 20000,
  TIMING_TOLERANCE_MS: 2000,
  EXPIRY_MS: 60 * 60 * 1000,
  FAST_INTERVAL_MS: 15,
  UNIFORM_FRACTION: 0.9,
  WINDOW_CHARS: 50,
  MAX_WINDOW_WPM: 250,
  WEAK_KEY_LIMIT: 3,

  TEXT_LIMITS: {
    lesson: { min: 50, max: 2000 },
    custom: { min: 50, max: 2000 },
    passage: { min: 3000, max: 8000 }
  },

  CUSTOM_LIMIT: 100,
  CUSTOM_TITLE_MAX: 80,
  DASHBOARD_RECENT: 10,
  HISTORY: {
    pageSize: 25, maxPage: 400, trendSize: 30, weakKeyWindow: 20
  },

  PREFERENCES: {
    showKeyboard: { name: 'x_snc_ttt.show_keyboard', fallback: true },
    showHands: { name: 'x_snc_ttt.show_hands', fallback: true },
    showLiveStats: { name: 'x_snc_ttt.show_live_stats', fallback: true },
    announceErrors: { name: 'x_snc_ttt.announce_errors', fallback: false },
    // null until the player chooses: the client then turns the driving game
    // on, unless the browser asks for reduced motion.
    drivingView: { name: 'x_snc_ttt.driving_view', fallback: null }
  },

  // ServiceNow language codes that are not valid BCP 47 tags.
  LOCALE_MAP: {
    pb: 'pt-BR', zt: 'zh-TW', zh: 'zh-CN', fq: 'fr-CA'
  },

  initialize: function initialize() {},

  // ================================================================ pure

  /**
   * C2.1 text normalization. Returns {text} or {errorCode, message}.
   * @param {string} raw
   * @param {string} kind 'lesson' | 'custom' | 'passage'
   */
  normalizeText: function normalizeText(raw, kind) {
    var limits = this.TEXT_LIMITS[kind] || this.TEXT_LIMITS.custom;
    var text = raw === null || raw === undefined ? '' : String(raw);
    text = text
      .replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'")
      .replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/[\u00a0\u2007\u202f]/g, ' ')
      .replace(/[\t\n\r\f\v\u2028\u2029]/g, ' ')
      .replace(/ {2,}/g, ' ')
      .replace(/^ +| +$/g, '');
    if (/[^\x20-\x7E]/.test(text)) {
      return {
        errorCode: 'invalid_characters',
        message: gs.getMessage(
          'Only characters on a standard US keyboard are supported.'
        )
      };
    }
    if (text.length < limits.min) {
      return {
        errorCode: 'too_short',
        message: gs.getMessage('The text must be at least {0} characters long.', [
          String(limits.min)
        ])
      };
    }
    if (text.length > limits.max) {
      return {
        errorCode: 'too_long',
        message: gs.getMessage('The text can be at most {0} characters long.', [
          String(limits.max)
        ])
      };
    }
    return { text: text };
  },

  /**
   * C4.1 keystroke log shape check. Returns null when valid, else 'invalid_log'.
   */
  validateLog: function validateLog(log) {
    var events;
    var previous;
    var i;
    var event;
    var offset;
    if (!log || typeof log !== 'object' || Array.isArray(log)) {
      return 'invalid_log';
    }
    if (log.v !== 1 || !Array.isArray(log.events)) {
      return 'invalid_log';
    }
    events = log.events;
    if (events.length > this.MAX_EVENTS) {
      return 'invalid_log';
    }
    previous = 0;
    for (i = 0; i < events.length; i += 1) {
      event = events[i];
      if (!Array.isArray(event)) {
        return 'invalid_log';
      }
      offset = event[0];
      if (
        typeof offset !== 'number'
        || !Number.isFinite(offset)
        || Math.floor(offset) !== offset
        || offset < 0
      ) {
        return 'invalid_log';
      }
      if ((i === 0 && offset !== 0) || offset < previous) {
        return 'invalid_log';
      }
      previous = offset;
      if (event[1] === 'i') {
        if (
          event.length !== 3
          || typeof event[2] !== 'string'
          || event[2].length !== 1
        ) {
          return 'invalid_log';
        }
      } else if (event[1] === 'd') {
        if (event.length !== 2) {
          return 'invalid_log';
        }
      } else {
        return 'invalid_log';
      }
    }
    return null;
  },

  /**
   * C4.2 replay + C4.3 formulas + C4.4 implausibility flags.
   * @param {string} passageText the snapshot the player typed against
   * @param {{v: number, events: Array}} log
   * @param {{mode: string, durationSeconds?: number, minAccuracy?: number,
   *          targetNetWpm?: number}} opts
   */
  score: function score(passageText, log, rawOpts) {
    var opts = rawOpts || {};
    var invalid = this.validateLog(log);
    var passage;
    var timed;
    var durationSeconds;
    var limitMs;
    var minAccuracy;
    var targetNetWpm;
    var events;
    var buffer;
    var keystrokes;
    var missed;
    var perKey;
    var complete;
    var completedAt;
    var lastOffset;
    var offsets;
    var insertOffsets;
    var i;
    var event;
    var offset;
    var expected;
    var key;
    var stats;
    var elapsedMs;
    var minutes;
    var errors;
    var p;
    var grossWpm;
    var netWpm;
    var accuracy;
    var flagReason;
    var flagged;
    var passed;
    if (invalid) {
      return { errorCode: invalid };
    }
    passage = String(passageText || '');
    timed = opts.mode === 'speed_test';
    durationSeconds = parseInt(opts.durationSeconds, 10);
    limitMs = timed && durationSeconds > 0 ? durationSeconds * 1000 : null;
    minAccuracy = this._number(opts.minAccuracy, 90);
    targetNetWpm = this._number(opts.targetNetWpm, 0);

    events = log.events;
    buffer = '';
    keystrokes = 0;
    missed = 0;
    perKey = {};
    complete = false;
    completedAt = 0;
    lastOffset = 0;
    offsets = [];
    insertOffsets = [];

    for (i = 0; i < events.length; i += 1) {
      event = events[i];
      offset = event[0];
      if (complete || (limitMs !== null && offset > limitMs)) {
        break;
      }
      lastOffset = offset;
      offsets.push(offset);
      if (event[1] === 'i') {
        expected = passage.charAt(buffer.length);
        key = this._keyName(expected);
        stats = perKey[key] || (perKey[key] = { hits: 0, misses: 0 });
        keystrokes += 1;
        insertOffsets.push(offset);
        if (event[2] === expected) {
          stats.hits += 1;
        } else {
          missed += 1;
          stats.misses += 1;
        }
        buffer += event[2];
        if (buffer.length >= passage.length) {
          complete = true;
          completedAt = offset;
        }
      } else if (buffer.length > 0) {
        buffer = buffer.substring(0, buffer.length - 1);
      }
    }

    if (limitMs !== null) {
      elapsedMs = limitMs;
    } else {
      elapsedMs = complete ? completedAt : lastOffset;
    }
    minutes = Math.max(elapsedMs, 1000) / 60000;
    errors = 0;
    for (p = 0; p < buffer.length; p += 1) {
      if (buffer.charAt(p) !== passage.charAt(p)) {
        errors += 1;
      }
    }
    grossWpm = this._round1(buffer.length / 5 / minutes);
    netWpm = this._round1(Math.max(0, grossWpm - errors / minutes));
    accuracy = keystrokes === 0
      ? 0
      : Math.round(((keystrokes - missed) / keystrokes) * 100);
    flagReason = this._flagReason(offsets, insertOffsets);
    flagged = flagReason !== null;
    passed = opts.mode === 'lesson'
      && complete
      && accuracy >= minAccuracy
      && netWpm >= targetNetWpm
      && !flagged;

    return {
      elapsedMs: elapsedMs,
      typedChars: buffer.length,
      keystrokes: keystrokes,
      missedKeystrokes: missed,
      errors: errors,
      grossWpm: grossWpm,
      netWpm: netWpm,
      accuracy: accuracy,
      complete: complete,
      passed: passed,
      flagged: flagged,
      flagReason: flagReason,
      perKey: perKey
    };
  },

  /**
   * B5 coach message rules. The first rule that matches wins.
   * @param {{flagged, passed, personalBest, accuracy, grossWpm, netWpm, errors}} result
   * @param {{mode: string, minAccuracy?: number, targetNetWpm?: number}} ctx
   */
  chooseCoach: function chooseCoach(rawResult, rawCtx) {
    var result = rawResult || {};
    var ctx = rawCtx || {};
    var summary;
    var nextLessonAdvice;
    var minAccuracy;
    var targetNetWpm;
    if (result.flagged) {
      return {
        rule: 1,
        headline: gs.getMessage("Let's try that again"),
        summary: '',
        advice: gs.getMessage(
          "We couldn't verify this attempt, so it wasn't scored. Type the passage normally from start to finish."
        )
      };
    }
    summary = this._coachSummary(result, ctx.mode);
    nextLessonAdvice = gs.getMessage('Ready for the next lesson?');
    if (ctx.mode === 'lesson') {
      minAccuracy = this._number(ctx.minAccuracy, 90);
      targetNetWpm = this._number(ctx.targetNetWpm, 0);
      if (result.passed && result.personalBest) {
        return {
          rule: 2,
          headline: gs.getMessage('New personal best!'),
          summary: summary,
          advice: nextLessonAdvice
        };
      }
      if (result.passed) {
        return {
          rule: 3,
          headline: gs.getMessage('Good job!'),
          summary: summary,
          advice: nextLessonAdvice
        };
      }
      if (this._number(result.accuracy, 0) < minAccuracy) {
        return {
          rule: 4,
          headline: gs.getMessage('Slow down a little'),
          summary: summary,
          advice: gs.getMessage(
            'Accuracy comes first. Aim for {0}% before you push your speed.',
            [String(minAccuracy)]
          )
        };
      }
      if (this._number(result.netWpm, 0) < targetNetWpm) {
        return {
          rule: 5,
          headline: gs.getMessage('Almost there'),
          summary: summary,
          advice: gs.getMessage(
            'Your accuracy is solid. Now try to keep a steady rhythm to reach {0} AWPM.',
            [String(targetNetWpm)]
          )
        };
      }
    }
    return {
      rule: 6,
      headline: result.personalBest
        ? gs.getMessage('New personal best!')
        : gs.getMessage('Nice work!'),
      summary: summary,
      advice: gs.getMessage('Keep practicing to build speed.')
    };
  },

  // ================================================================ reads

  /**
   * C5.1 session config without attempt/result. Speed-test text is only
   * revealed by startAttempt.
   */
  getSessionConfig: function getSessionConfig(params) {
    var source;
    var config;
    if (!this._hasUserRole()) {
      return { errorCode: 'no_role' };
    }
    source = this._resolveSource(params || {});
    if (source.errorCode) {
      return source;
    }
    config = {
      locale: this._locale(),
      mode: source.mode,
      preferences: this.getPreferences(),
      isAdmin: this._isAdmin(),
      passage: { title: source.title, text: source.text }
    };
    if (source.mode === 'lesson') {
      config.lesson = source.lesson;
      if (source.lesson.locked && !config.isAdmin) {
        config.passage.text = '';
      }
    } else if (source.mode === 'speed_test') {
      config.durationSeconds = source.durationSeconds;
      config.passage = { title: '', text: '' };
    } else {
      config.custom = { sysId: source.customId, title: source.title };
    }
    return config;
  },

  /** C5.2 lesson map for the session user. */
  getLessonMap: function getLessonMap() {
    var progress;
    var units;
    var unitIndex;
    var i;
    var lesson;
    if (!this._hasUserRole()) {
      return { errorCode: 'no_role' };
    }
    progress = this._lessonProgress(gs.getUserID());
    units = [];
    unitIndex = {};
    for (i = 0; i < progress.lessons.length; i += 1) {
      lesson = progress.lessons[i];
      if (!this._has(unitIndex, lesson.unit)) {
        unitIndex[lesson.unit] = units.length;
        units.push({ unit: lesson.unit, label: lesson.unitLabel, lessons: [] });
      }
      units[unitIndex[lesson.unit]].lessons.push({
        sysId: lesson.sysId,
        order: lesson.order,
        title: lesson.title,
        focusKeys: lesson.focusKeys,
        status: lesson.status,
        bestNetWpm: lesson.bestNetWpm,
        bestAccuracy: lesson.bestAccuracy
      });
    }
    return {
      locale: this._locale(),
      units: units,
      nextLessonId: progress.nextLessonId,
      completedCount: progress.completedCount,
      totalCount: progress.lessons.length
    };
  },

  /** The read-only result block (C5.1 shape) for one completed attempt. */
  getAttemptResult: function getAttemptResult(params) {
    var attemptId;
    var gr;
    var mode;
    var thresholds;
    var stored;
    var weakKeys;
    var keys;
    if (!this._hasUserRole()) {
      return { errorCode: 'no_role' };
    }
    attemptId = String((params && params.sysId) || '');
    if (!this.SYS_ID.test(attemptId)) {
      return { errorCode: 'not_found' };
    }
    gr = new GlideRecordSecure(this.TABLE_ATTEMPT);
    if (!gr.get(attemptId) || gr.getValue('state') !== 'completed') {
      return { errorCode: 'not_found' };
    }
    mode = gr.getValue('mode');
    thresholds = this._thresholds(gr);
    stored = {
      grossWpm: this._number(gr.getValue('gross_wpm'), 0),
      netWpm: this._number(gr.getValue('net_wpm'), 0),
      accuracy: this._number(gr.getValue('accuracy'), 0),
      errors: this._number(gr.getValue('errors'), 0),
      elapsedMs: this._number(gr.getValue('elapsed_ms'), 0),
      passed: this._isTrue(gr.getValue('passed')),
      personalBest: this._isTrue(gr.getValue('personal_best')),
      flagged: this._isTrue(gr.getValue('flagged'))
    };
    weakKeys = [];
    keys = new GlideRecordSecure(this.TABLE_ATTEMPT_KEY);
    keys.addQuery('attempt', attemptId);
    keys.addQuery('misses', '>', 0);
    keys.orderByDesc('misses');
    keys.setLimit(this.WEAK_KEY_LIMIT);
    keys.query();
    while (keys.next()) {
      weakKeys.push({
        key: keys.getValue('key_char'),
        misses: this._number(keys.getValue('misses'), 0)
      });
    }
    return {
      locale: this._locale(),
      result: this._buildResult(gr, stored, {
        mode: mode,
        thresholds: thresholds,
        previous: this._previousAttempt(gr, gr.getValue('completed_on')),
        weakKeys: weakKeys,
        profileWpm: null,
        next: { nextLessonId: null, nextLessonUnlocked: false }
      })
    };
  },

  /** B6 preferences for the session user, with defaults applied. */
  getPreferences: function getPreferences() {
    var user = gs.getUser();
    var prefs = {};
    Object.keys(this.PREFERENCES).forEach(function readPreference(key) {
      var def = this.PREFERENCES[key];
      var value = user.getPreference(def.name);
      prefs[key] = value === null || value === undefined || String(value) === ''
        ? def.fallback
        : String(value) === 'true';
    }, this);
    return prefs;
  },

  /**
   * C5.5 home dashboard: best speed-test AWPM, average accuracy over the last
   * 10 scored attempts, lesson progress, the next lesson and an AWPM
   * sparkline. Counts, maximums and averages use GlideAggregate (A4.3).
   */
  getDashboard: function getDashboard() {
    var userId;
    var best;
    var bestValue;
    var ids;
    var sparkline;
    var recent;
    var avgAccuracy;
    var avg;
    var map;
    var nextLesson;
    var u;
    var l;
    var lesson;
    if (!this._hasUserRole()) {
      return { errorCode: 'no_role' };
    }
    userId = gs.getUserID();
    best = new GlideAggregate(this.TABLE_ATTEMPT);
    this._addCompleted(best, userId, 'speed_test');
    best.addQuery('flagged', false);
    best.addAggregate('MAX', 'net_wpm');
    best.setGroup(false);
    best.query();
    bestValue = best.next() ? best.getAggregate('MAX', 'net_wpm') : '';

    ids = [];
    sparkline = [];
    recent = new GlideRecordSecure(this.TABLE_ATTEMPT);
    this._addCompleted(recent, userId, 'all');
    recent.addQuery('flagged', false);
    recent.orderByDesc('completed_on');
    recent.setLimit(this.DASHBOARD_RECENT);
    recent.query();
    while (recent.next()) {
      ids.push(recent.getUniqueValue());
      sparkline.unshift({
        completedOn: recent.getDisplayValue('completed_on'),
        netWpm: this._number(recent.getValue('net_wpm'), 0)
      });
    }

    avgAccuracy = null;
    if (ids.length) {
      avg = new GlideAggregate(this.TABLE_ATTEMPT);
      avg.addQuery('sys_id', 'IN', ids.join(','));
      avg.addAggregate('AVG', 'accuracy');
      avg.setGroup(false);
      avg.query();
      if (avg.next()) {
        avgAccuracy = Math.round(this._number(avg.getAggregate('AVG', 'accuracy'), 0));
      }
    }

    map = this.getLessonMap();
    nextLesson = null;
    for (u = 0; u < map.units.length; u += 1) {
      for (l = 0; l < map.units[u].lessons.length; l += 1) {
        lesson = map.units[u].lessons[l];
        if (lesson.sysId === map.nextLessonId) {
          nextLesson = { sysId: lesson.sysId, title: lesson.title, order: lesson.order };
        }
      }
    }
    return {
      locale: map.locale,
      firstName: gs.getUser().getFirstName() || '',
      bestSpeedTestNetWpm:
        bestValue === '' || bestValue === null ? null : parseFloat(bestValue),
      sparkline: sparkline,
      isNewPlayer: ids.length === 0,
      avgAccuracyLast10: avgAccuracy,
      lessonsCompleted: map.completedCount,
      lessonsTotal: map.totalCount,
      nextLesson: nextLesson
    };
  },

  /**
   * C5.4 history: one page of completed attempts (newest first) in a mode or
   * 'all', the AWPM trend for the last 30 in that mode, and per-key miss
   * rates over the last 20 completed attempts.
   * @param {{mode: string, page: number}} params
   */
  getHistory: function getHistory(rawParams) {
    var params = rawParams || {};
    var userId;
    var size;
    var mode;
    var page;
    var attempts;
    var gr;
    var count;
    var totalAvailable;
    var trend;
    var recent;
    if (!this._hasUserRole()) {
      return { errorCode: 'no_role' };
    }
    userId = gs.getUserID();
    size = this.HISTORY.pageSize;
    mode = this.MODES.indexOf(String(params.mode)) >= 0 ? String(params.mode) : 'all';
    page = Math.min(this.HISTORY.maxPage, Math.max(0, parseInt(params.page, 10) || 0));

    attempts = [];
    gr = new GlideRecordSecure(this.TABLE_ATTEMPT);
    this._addCompleted(gr, userId, mode);
    gr.orderByDesc('completed_on');
    // chooseWindow is the paging form of setLimit: at most one page of rows.
    gr.chooseWindow(page * size, (page + 1) * size);
    gr.query();
    while (gr.next()) {
      attempts.push({
        sysId: gr.getUniqueValue(),
        completedOn: gr.getDisplayValue('completed_on'),
        mode: gr.getValue('mode'),
        modeLabel: gr.getDisplayValue('mode'),
        title: gr.getValue('passage_title') || '',
        durationSeconds: parseInt(gr.getValue('duration_seconds'), 10) || null,
        netWpm: this._number(gr.getValue('net_wpm'), 0),
        grossWpm: this._number(gr.getValue('gross_wpm'), 0),
        accuracy: parseInt(gr.getValue('accuracy'), 10) || 0,
        errors: parseInt(gr.getValue('errors'), 10) || 0,
        passed: this._isTrue(gr.getValue('passed')),
        flagged: this._isTrue(gr.getValue('flagged'))
      });
    }

    count = new GlideAggregate(this.TABLE_ATTEMPT);
    this._addCompleted(count, userId, mode);
    count.addAggregate('COUNT');
    count.query();
    totalAvailable = count.next() ? parseInt(count.getAggregate('COUNT'), 10) || 0 : 0;

    trend = [];
    recent = new GlideRecordSecure(this.TABLE_ATTEMPT);
    this._addCompleted(recent, userId, mode);
    recent.addQuery('flagged', false);
    recent.orderByDesc('completed_on');
    recent.setLimit(this.HISTORY.trendSize);
    recent.query();
    while (recent.next()) {
      trend.unshift({
        completedOn: recent.getDisplayValue('completed_on'),
        netWpm: this._number(recent.getValue('net_wpm'), 0)
      });
    }

    return {
      locale: this._locale(),
      mode: mode,
      page: page,
      pageSize: size,
      attempts: attempts,
      totalAvailable: totalAvailable,
      trend: trend,
      weakKeys: this._recentKeyStats(userId)
    };
  },

  /** B3.4 the session user's custom passages, most recently changed first. */
  getCustomPassages: function getCustomPassages() {
    var passages;
    var gr;
    var text;
    if (!this._hasUserRole()) {
      return { errorCode: 'no_role' };
    }
    passages = [];
    gr = new GlideRecordSecure(this.TABLE_CUSTOM);
    gr.addQuery('user', gs.getUserID());
    gr.orderByDesc('sys_updated_on');
    gr.setLimit(this.CUSTOM_LIMIT);
    gr.query();
    while (gr.next()) {
      text = gr.getValue('text') || '';
      passages.push({
        sysId: gr.getUniqueValue(),
        title: gr.getValue('title') || '',
        text: text,
        length: text.length,
        updatedOn: gr.getDisplayValue('sys_updated_on')
      });
    }
    return { locale: this._locale(), passages: passages, limit: this.CUSTOM_LIMIT };
  },

  // ================================================================ mutations

  /** Saves any B6 preference keys present in params (booleans only). */
  savePreferences: function savePreferences(rawParams) {
    var params = rawParams || {};
    var user;
    if (!this._hasUserRole()) {
      return { errorCode: 'no_role' };
    }
    user = gs.getUser();
    Object.keys(this.PREFERENCES).forEach(function savePreference(key) {
      if (this._has(params, key) && typeof params[key] === 'boolean') {
        user.savePreference(this.PREFERENCES[key].name, String(params[key]));
      }
    }, this);
    return { preferences: this.getPreferences() };
  },

  /**
   * Starts an attempt: abandons the caller's other in-progress attempts,
   * checks the lesson lock, picks a speed-test passage, and inserts the
   * attempt with its text snapshot.
   */
  startAttempt: function startAttempt(params) {
    var source;
    var passage;
    var attempt;
    var attemptId;
    var saved;
    if (!this._hasUserRole()) {
      return { errorCode: 'no_role' };
    }
    source = this._resolveSource(params || {});
    if (source.errorCode) {
      return source;
    }
    if (
      source.mode === 'lesson'
      && source.lesson.locked
      && !this._isAdmin()
    ) {
      return { errorCode: 'locked' };
    }
    if (source.mode === 'speed_test') {
      passage = this._randomPassage();
      if (!passage) {
        return { errorCode: 'no_passages' };
      }
      source.title = passage.title;
      source.text = passage.text;
    }

    attempt = new GlideRecordSecure(this.TABLE_ATTEMPT);
    attempt.initialize();
    if (!attempt.canCreate()) {
      return { errorCode: 'no_role' };
    }
    this._abandonInProgress(gs.getUserID());

    attempt.setValue('mode', source.mode);
    if (source.mode === 'lesson') {
      attempt.setValue('lesson', source.lesson.sysId);
    } else if (source.mode === 'custom') {
      attempt.setValue('custom_passage', source.customId);
    } else {
      attempt.setValue('duration_seconds', source.durationSeconds);
    }
    attempt.setValue('passage_title', source.title);
    attempt.setValue('passage_text', source.text);
    attempt.setValue('state', 'in_progress');
    attempt.setValue('started_on', new GlideDateTime().getValue());
    attemptId = attempt.insert();
    if (!attemptId) {
      return { errorCode: 'not_saved' };
    }

    // Read back what the before-insert rule stored: scoring always uses the
    // stored snapshot, so the client must type against exactly this text.
    saved = new GlideRecordSecure(this.TABLE_ATTEMPT);
    if (!saved.get(attemptId)) {
      return { errorCode: 'not_saved' };
    }
    return {
      attempt: {
        sysId: attemptId,
        startedOn: saved.getValue('started_on'),
        durationSeconds:
          source.mode === 'speed_test' ? source.durationSeconds : null
      },
      passage: {
        title: saved.getValue('passage_title') || '',
        text: saved.getValue('passage_text') || ''
      }
    };
  },

  /**
   * C4.4 verification, C4.5 writes and C2.2 profile WPM for one submission.
   * @param {{attemptId: string, log: Object, ended: string}} params
   */
  submitAttempt: function submitAttempt(rawParams) {
    var params = rawParams || {};
    var userId;
    var attemptId;
    var attempt;
    var log;
    var ended;
    var startedOn;
    var now;
    var serverElapsedMs;
    var events;
    var lastOffset;
    var mode;
    var durationSeconds;
    var thresholds;
    var scored;
    var unscored;
    var personalBest;
    var previous;
    var system;
    var profileWpm;
    if (!this._hasUserRole()) {
      return { errorCode: 'no_role' };
    }
    userId = gs.getUserID();
    attemptId = String(params.attemptId || '');
    if (!this.SYS_ID.test(attemptId)) {
      return { errorCode: 'not_found' };
    }
    attempt = new GlideRecordSecure(this.TABLE_ATTEMPT);
    if (
      !attempt.get(attemptId)
      || attempt.getValue('user') !== userId
      || attempt.getValue('state') !== 'in_progress'
    ) {
      return { errorCode: 'not_found' };
    }

    log = params.log;
    ended = String(params.ended || '');
    if (this.validateLog(log) || this.ENDED.indexOf(ended) < 0) {
      this._setAttemptState(attemptId, 'rejected');
      return { errorCode: 'invalid_log' };
    }

    startedOn = new GlideDateTime(attempt.getValue('started_on'));
    now = new GlideDateTime();
    serverElapsedMs = now.getNumericValue() - startedOn.getNumericValue();
    events = log.events;
    lastOffset = events.length ? events[events.length - 1][0] : 0;
    if (lastOffset > serverElapsedMs + this.TIMING_TOLERANCE_MS) {
      this._setAttemptState(attemptId, 'rejected');
      return { errorCode: 'invalid_timing' };
    }
    if (serverElapsedMs > this.EXPIRY_MS) {
      this._setAttemptState(attemptId, 'abandoned');
      return { errorCode: 'expired' };
    }

    mode = attempt.getValue('mode');
    durationSeconds = this._number(attempt.getValue('duration_seconds'), 0);
    thresholds = this._thresholds(attempt);
    scored = this.score(attempt.getValue('passage_text'), log, {
      mode: mode,
      durationSeconds: durationSeconds,
      minAccuracy: thresholds.minAccuracy,
      targetNetWpm: thresholds.targetNetWpm
    });
    if (scored.errorCode) {
      this._setAttemptState(attemptId, 'rejected');
      return { errorCode: scored.errorCode };
    }

    // C4.3: an unfinished passage is only accepted as an exit, and an exited
    // or idle speed test is stored as abandoned. Neither is scored.
    unscored = mode === 'speed_test'
      ? ended === 'exit' || scored.keystrokes === 0
      : !scored.complete;
    if (unscored) {
      if (mode !== 'speed_test' && ended !== 'exit') {
        this._setAttemptState(attemptId, 'rejected');
        return { errorCode: 'invalid_log' };
      }
      this._setAttemptState(attemptId, 'abandoned');
      return { result: { state: 'abandoned', mode: mode, profileWpm: null } };
    }

    personalBest = !scored.flagged && this._beatsBest(attempt, scored.netWpm);
    previous = this._previousAttempt(attempt, now.getValue());

    // System write: players have no write ACL on attempts (A2.4). Ownership,
    // state, log and timing were verified above, so this is the only path
    // that writes scores.
    system = new GlideRecord(this.TABLE_ATTEMPT);
    if (!system.get(attemptId)) {
      return { errorCode: 'not_found' };
    }
    system.setValue('state', 'completed');
    system.setValue('completed_on', now.getValue());
    system.setValue('elapsed_ms', scored.elapsedMs);
    system.setValue('typed_chars', scored.typedChars);
    system.setValue('keystrokes', scored.keystrokes);
    system.setValue('missed_keystrokes', scored.missedKeystrokes);
    system.setValue('errors', scored.errors);
    system.setValue('gross_wpm', scored.grossWpm);
    system.setValue('net_wpm', scored.netWpm);
    system.setValue('accuracy', scored.accuracy);
    system.setValue('passed', scored.passed);
    system.setValue('personal_best', personalBest);
    system.setValue('flagged', scored.flagged);
    system.setValue('flag_reason', scored.flagReason || '');
    system.update();

    if (!scored.flagged) {
      this._writeAttemptKeys(attemptId, userId, scored.perKey);
    }

    profileWpm = null;
    if (
      mode === 'speed_test'
      && ended === 'timeout'
      && !scored.flagged
      && serverElapsedMs >= durationSeconds * 1000 - this.TIMING_TOLERANCE_MS
    ) {
      profileWpm = this._updateProfileWpm(scored.grossWpm);
    }

    return {
      result: this._buildResult(
        attempt,
        {
          grossWpm: scored.grossWpm,
          netWpm: scored.netWpm,
          accuracy: scored.accuracy,
          errors: scored.errors,
          elapsedMs: scored.elapsedMs,
          passed: scored.passed,
          personalBest: personalBest,
          flagged: scored.flagged
        },
        {
          mode: mode,
          thresholds: thresholds,
          previous: previous,
          weakKeys: this._weakKeys(scored.perKey),
          profileWpm: profileWpm,
          next:
            mode === 'lesson'
              ? this._nextLessonInfo(attempt.getValue('lesson'), userId)
              : { nextLessonId: null, nextLessonUnlocked: false }
        }
      )
    };
  },

  /** Marks the caller's own in-progress attempt as abandoned (Exit, pagehide). */
  abandonAttempt: function abandonAttempt(params) {
    var attemptId;
    var attempt;
    if (!this._hasUserRole()) {
      return { errorCode: 'no_role' };
    }
    attemptId = String((params && params.attemptId) || '');
    if (!this.SYS_ID.test(attemptId)) {
      return { errorCode: 'not_found' };
    }
    attempt = new GlideRecordSecure(this.TABLE_ATTEMPT);
    if (
      !attempt.get(attemptId)
      || attempt.getValue('user') !== gs.getUserID()
      || attempt.getValue('state') !== 'in_progress'
    ) {
      return { errorCode: 'not_found' };
    }
    this._setAttemptState(attemptId, 'abandoned');
    return {};
  },

  /**
   * B3.4 creates or (with sysId) updates one of the session user's custom
   * passages. Problems with the input come back for the form as actionStatus
   * 'error' with actionMessage and, for a field, actionField. br_text_normalize
   * and br_custom_owner_limit enforce the same rules for other entry points.
   * Like every custom-passage action, it returns the refreshed list too.
   * @param {{sysId?: string, title: string, text: string}} params
   */
  saveCustomPassage: function saveCustomPassage(rawParams) {
    var params = rawParams || {};
    var userId;
    var sysId;
    var title;
    var normalized;
    var gr;
    var saved;
    if (!this._hasUserRole()) {
      return { errorCode: 'no_role' };
    }
    userId = gs.getUserID();
    sysId = String(params.sysId || '');
    title = String(params.title || '')
      .replace(/\s+/g, ' ')
      .replace(/^ +| +$/g, '');
    if (sysId && !this.SYS_ID.test(sysId)) {
      return this._withCustomList(this._actionError(gs.getMessage('That passage was not found.')));
    }
    if (!title) {
      return this._withCustomList(this._actionError(gs.getMessage('Enter a title.'), 'title'));
    }
    if (title.length > this.CUSTOM_TITLE_MAX) {
      return this._withCustomList(
        this._actionError(
          gs.getMessage('The title can be at most {0} characters long.', [
            String(this.CUSTOM_TITLE_MAX)
          ]),
          'title'
        )
      );
    }
    normalized = this.normalizeText(params.text, 'custom');
    if (normalized.errorCode) {
      return this._withCustomList(this._actionError(normalized.message, 'text'));
    }

    gr = new GlideRecordSecure(this.TABLE_CUSTOM);
    if (sysId) {
      if (!gr.get(sysId) || gr.getValue('user') !== userId) {
        return this._withCustomList(this._actionError(gs.getMessage('That passage was not found.')));
      }
      if (!gr.canWrite()) {
        return this._withCustomList(
          this._actionError(gs.getMessage('You do not have permission to edit this passage.'))
        );
      }
    } else {
      if (this._countCustom(userId) >= this.CUSTOM_LIMIT) {
        return this._withCustomList(
          this._actionError(
            gs.getMessage('You can keep up to {0} custom passages. Delete one to add another.', [
              String(this.CUSTOM_LIMIT)
            ])
          )
        );
      }
      gr.initialize();
      if (!gr.canCreate()) {
        return this._withCustomList(
          this._actionError(gs.getMessage('You do not have permission to add passages.'))
        );
      }
    }
    gr.setValue('title', title);
    gr.setValue('text', normalized.text);
    saved = sysId ? gr.update() : gr.insert();
    if (!saved) {
      return this._withCustomList(this._actionError(gs.getMessage('The passage could not be saved.')));
    }
    return this._withCustomList({
      actionStatus: 'success',
      actionMessage: gs.getMessage('Passage saved.'),
      savedId: sysId || saved
    });
  },

  /** Deletes one of the session user's custom passages; returns the refreshed list. */
  deleteCustomPassage: function deleteCustomPassage(params) {
    var sysId;
    var gr;
    if (!this._hasUserRole()) {
      return { errorCode: 'no_role' };
    }
    sysId = String((params && params.sysId) || '');
    gr = new GlideRecordSecure(this.TABLE_CUSTOM);
    if (!this.SYS_ID.test(sysId) || !gr.get(sysId) || gr.getValue('user') !== gs.getUserID()) {
      return this._withCustomList(this._actionError(gs.getMessage('That passage was not found.')));
    }
    if (!gr.canDelete()) {
      return this._withCustomList(
        this._actionError(gs.getMessage('You do not have permission to delete this passage.'))
      );
    }
    if (!gr.deleteRecord()) {
      return this._withCustomList(this._actionError(gs.getMessage('The passage could not be deleted.')));
    }
    return this._withCustomList({
      actionStatus: 'success',
      actionMessage: gs.getMessage('Passage deleted.')
    });
  },

  // ================================================================ widget adapter

  /**
   * Runs one widget server-script action and writes the result into `data`
   * (C4.6), so every widget is the same thin adapter. The action comes from
   * input.action and defaults to getState; the caller needs the player role.
   * Every field of the handler's result is copied into data. An errorCode in
   * it becomes data.isError, data.errorCode and data.errorMessage, worded by
   * spec.messages when the widget has its own wording, else errorMessage().
   * An exception is logged (never the input) and reported as server_error.
   * @param {Object} data the widget's data object
   * @param {Object} input the widget's input
   * @param {{widget: string, handlers: Object, messages?: Object}} spec
   */
  respond: function respond(data, input, spec) {
    var params = input || {};
    var action = params.action ? String(params.action) : 'getState';
    var messages = spec.messages || {};
    var self = this;
    var result;
    function fail(code) {
      data.isError = true;
      data.errorCode = code;
      data.errorMessage = self._has(messages, code) ? messages[code] : self.errorMessage(code);
    }

    if (!this._hasUserRole()) {
      fail('no_role');
      return;
    }
    if (!this._has(spec.handlers, action)) {
      fail('invalid_request');
      return;
    }
    try {
      result = spec.handlers[action](params) || {};
      Object.keys(result).forEach(function copyField(key) {
        if (key !== 'errorCode') {
          data[key] = result[key];
        }
      });
      if (result.errorCode) {
        fail(result.errorCode);
      }
    } catch (e) {
      gs.error(spec.widget + ' ' + action + ': ' + e.message);
      fail('server_error');
    }
  },

  /** The default user-facing wording for an errorCode from this class. */
  errorMessage: function errorMessage(code) {
    switch (code) {
      case 'no_role':
        return gs.getMessage(
          'You need the Abel Tuter Teaches Typing player role. Contact your administrator.'
        );
      case 'locked':
        return gs.getMessage('This lesson is locked. Pass the lesson before it to unlock it.');
      case 'not_found':
        return gs.getMessage('That lesson or passage was not found.');
      case 'invalid_log':
        return gs.getMessage("Your keystrokes couldn't be checked, so this attempt wasn't scored.");
      case 'invalid_timing':
        return gs.getMessage(
          "This attempt's timing didn't match the server clock, so it wasn't scored."
        );
      case 'expired':
        return gs.getMessage(
          'This attempt was open for more than an hour, so it expired. Start a new one.'
        );
      case 'no_passages':
        return gs.getMessage(
          'There are no speed-test passages yet. Ask your administrator to add one.'
        );
      case 'not_saved':
        return gs.getMessage('The attempt could not be started. Try again.');
      case 'invalid_request':
        return gs.getMessage('That request is not valid.');
      default:
        return gs.getMessage('Something went wrong. Try again.');
    }
  },

  // ================================================================ business-rule helpers

  /**
   * Lesson lock check for the before-insert attempt rule. Returns true when
   * the user may start this lesson (admins may start any lesson).
   */
  isLessonUnlocked: function isLessonUnlocked(lessonId, userId) {
    var progress;
    var i;
    if (this._isAdmin()) {
      return true;
    }
    progress = this._lessonProgress(userId);
    for (i = 0; i < progress.lessons.length; i += 1) {
      if (progress.lessons[i].sysId === lessonId) {
        return progress.lessons[i].status !== 'locked';
      }
    }
    return false;
  },

  /** True when text exactly matches an active speed-test passage. */
  isActivePassageText: function isActivePassageText(text) {
    // Plain GlideRecord on purpose: the before-insert rule must compare the
    // snapshot against every active passage, independent of the caller.
    var gr = new GlideRecord(this.TABLE_PASSAGE);
    gr.addActiveQuery();
    gr.setLimit(500);
    gr.query();
    while (gr.next()) {
      if (gr.getValue('text') === text) {
        return true;
      }
    }
    return false;
  },

  // ================================================================ internals

  _hasUserRole: function _hasUserRole() {
    return gs.hasRole(this.ROLE_USER);
  },

  _isAdmin: function _isAdmin() {
    return gs.hasRole(this.ROLE_ADMIN);
  },

  _locale: function _locale() {
    var lang = String(gs.getSession().getLanguage() || 'en');
    return this.LOCALE_MAP[lang] || lang;
  },

  _keyName: function _keyName(ch) {
    return ch === ' ' ? 'space' : String(ch).toLowerCase();
  },

  _round1: function _round1(value) {
    return Math.round(value * 10) / 10;
  },

  _number: function _number(value, fallback) {
    var n = parseFloat(value);
    return Number.isNaN(n) ? fallback : n;
  },

  _has: function _has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  },

  _isTrue: function _isTrue(value) {
    return value === true || value === 'true' || value === '1' || value === 1;
  },

  /** C4.4 implausible-input check: 'uniform_intervals', 'too_fast' or null. */
  _flagReason: function _flagReason(offsets, insertOffsets) {
    var intervals = offsets.length - 1;
    var fast = 0;
    var i;
    var words;
    var last;
    var w;
    var span;
    for (i = 1; i < offsets.length; i += 1) {
      if (offsets[i] - offsets[i - 1] < this.FAST_INTERVAL_MS) {
        fast += 1;
      }
    }
    if (intervals > 0 && fast / intervals >= this.UNIFORM_FRACTION) {
      return 'uniform_intervals';
    }
    // A window of N characters is N/5 words over the span from its first to
    // its last keystroke.
    words = this.WINDOW_CHARS / 5;
    last = this.WINDOW_CHARS - 1;
    for (w = 0; w + last < insertOffsets.length; w += 1) {
      span = insertOffsets[w + last] - insertOffsets[w];
      if (span <= 0 || words / (span / 60000) > this.MAX_WINDOW_WPM) {
        return 'too_fast';
      }
    }
    return null;
  },

  _coachSummary: function _coachSummary(result, mode) {
    var accuracy = String(Math.round(this._number(result.accuracy, 0)));
    var gross = String(Math.round(this._number(result.grossWpm, 0)));
    var net = String(Math.round(this._number(result.netWpm, 0)));
    var errors = Math.round(this._number(result.errors, 0));
    if (errors === 1) {
      if (mode === 'speed_test') {
        return gs.getMessage(
          'Your accuracy was {0}% and your typing speed was {1} WPM. You made 1 error in this test, so your adjusted speed was {2} AWPM.',
          [accuracy, gross, net]
        );
      }
      if (mode === 'custom') {
        return gs.getMessage(
          'Your accuracy was {0}% and your typing speed was {1} WPM. You made 1 error in this passage, so your adjusted speed was {2} AWPM.',
          [accuracy, gross, net]
        );
      }
      return gs.getMessage(
        'Your accuracy was {0}% and your typing speed was {1} WPM. You made 1 error in this lesson, so your adjusted speed was {2} AWPM.',
        [accuracy, gross, net]
      );
    }
    if (mode === 'speed_test') {
      return gs.getMessage(
        'Your accuracy was {0}% and your typing speed was {1} WPM. You made {2} errors in this test, so your adjusted speed was {3} AWPM.',
        [accuracy, gross, String(errors), net]
      );
    }
    if (mode === 'custom') {
      return gs.getMessage(
        'Your accuracy was {0}% and your typing speed was {1} WPM. You made {2} errors in this passage, so your adjusted speed was {3} AWPM.',
        [accuracy, gross, String(errors), net]
      );
    }
    return gs.getMessage(
      'Your accuracy was {0}% and your typing speed was {1} WPM. You made {2} errors in this lesson, so your adjusted speed was {3} AWPM.',
      [accuracy, gross, String(errors), net]
    );
  },

  /**
   * Validates mode and reference, then loads the text the attempt would use.
   * Returns {mode, title, text, lesson?, customId?, durationSeconds?} or
   * {errorCode}.
   */
  _resolveSource: function _resolveSource(params) {
    var mode = String(params.mode || '');
    var duration;
    var customId;
    var custom;
    var lessonId;
    var progress;
    var i;
    var lesson;
    var next;
    if (this.MODES.indexOf(mode) < 0) {
      return { errorCode: 'invalid_request' };
    }
    if (mode === 'speed_test') {
      duration = parseInt(params.durationSeconds, 10);
      if (this.DURATIONS.indexOf(duration) < 0) {
        duration = this.DURATIONS[0];
      }
      return {
        mode: mode, title: '', text: '', durationSeconds: duration
      };
    }
    if (mode === 'custom') {
      customId = String(params.customId || '');
      if (!this.SYS_ID.test(customId)) {
        return { errorCode: 'not_found' };
      }
      custom = new GlideRecordSecure(this.TABLE_CUSTOM);
      if (!custom.get(customId) || custom.getValue('user') !== gs.getUserID()) {
        return { errorCode: 'not_found' };
      }
      return {
        mode: mode,
        customId: customId,
        title: custom.getValue('title') || '',
        text: custom.getValue('text') || ''
      };
    }
    lessonId = String(params.lessonId || '');
    if (!this.SYS_ID.test(lessonId)) {
      return { errorCode: 'not_found' };
    }
    progress = this._lessonProgress(gs.getUserID());
    for (i = 0; i < progress.lessons.length; i += 1) {
      lesson = progress.lessons[i];
      if (lesson.sysId === lessonId) {
        next = progress.lessons[i + 1];
        return {
          mode: mode,
          title: lesson.title,
          text: lesson.text,
          lesson: {
            sysId: lesson.sysId,
            order: lesson.order,
            title: lesson.title,
            unit: lesson.unit,
            unitLabel: lesson.unitLabel,
            focusKeys: lesson.focusKeys,
            minAccuracy: lesson.minAccuracy,
            targetNetWpm: lesson.targetNetWpm,
            locked: lesson.status === 'locked',
            status: lesson.status,
            nextLessonId: next ? next.sysId : null
          }
        };
      }
    }
    return { errorCode: 'not_found' };
  },

  /**
   * Active lessons in unlock order with the user's status and best scores.
   * Status is derived from one aggregate over passed attempts (no progress
   * table is stored).
   */
  _lessonProgress: function _lessonProgress(userId) {
    var best = {};
    var ga = new GlideAggregate(this.TABLE_ATTEMPT);
    var isAdmin;
    var lessons;
    var nextLessonId;
    var completedCount;
    var previousPassed;
    var gr;
    var sysId;
    var passed;
    var status;
    ga.addQuery('user', userId);
    ga.addQuery('mode', 'lesson');
    ga.addQuery('state', 'completed');
    ga.addQuery('passed', true);
    ga.addAggregate('MAX', 'net_wpm');
    ga.addAggregate('MAX', 'accuracy');
    ga.groupBy('lesson');
    ga.query();
    while (ga.next()) {
      best[ga.getValue('lesson')] = {
        netWpm: this._number(ga.getAggregate('MAX', 'net_wpm'), 0),
        accuracy: this._number(ga.getAggregate('MAX', 'accuracy'), 0)
      };
    }

    isAdmin = this._isAdmin();
    lessons = [];
    nextLessonId = null;
    completedCount = 0;
    previousPassed = true;
    gr = new GlideRecordSecure(this.TABLE_LESSON);
    gr.addActiveQuery();
    gr.orderBy('order');
    gr.setLimit(500);
    gr.query();
    while (gr.next()) {
      sysId = gr.getUniqueValue();
      passed = this._has(best, sysId);
      status = 'locked';
      if (passed) {
        status = 'passed';
        completedCount += 1;
      } else if (previousPassed || isAdmin) {
        status = 'available';
      }
      if (status === 'available' && nextLessonId === null) {
        nextLessonId = sysId;
      }
      previousPassed = passed;
      lessons.push({
        sysId: sysId,
        order: this._number(gr.getValue('order'), 0),
        title: gr.getValue('title') || '',
        unit: gr.getValue('unit') || '',
        unitLabel: gr.getDisplayValue('unit') || '',
        focusKeys: gr.getValue('focus_keys') || '',
        text: gr.getValue('text') || '',
        minAccuracy: this._number(gr.getValue('min_accuracy'), 90),
        targetNetWpm: this._number(gr.getValue('target_net_wpm'), 0),
        status: status,
        bestNetWpm: passed ? best[sysId].netWpm : null,
        bestAccuracy: passed ? best[sysId].accuracy : null
      });
    }
    return {
      lessons: lessons,
      nextLessonId: nextLessonId,
      completedCount: completedCount
    };
  },

  _nextLessonInfo: function _nextLessonInfo(lessonId, userId) {
    var lessons = this._lessonProgress(userId).lessons;
    var i;
    var next;
    for (i = 0; i < lessons.length; i += 1) {
      if (lessons[i].sysId === lessonId) {
        next = lessons[i + 1];
        return {
          nextLessonId: next ? next.sysId : null,
          nextLessonUnlocked: next ? next.status !== 'locked' : false
        };
      }
    }
    return { nextLessonId: null, nextLessonUnlocked: false };
  },

  /** Pass thresholds for a lesson attempt; defaults when not a lesson. */
  _thresholds: function _thresholds(attempt) {
    var thresholds = { minAccuracy: 90, targetNetWpm: 0 };
    var lessonId = attempt.getValue('lesson');
    var lesson;
    if (attempt.getValue('mode') === 'lesson' && lessonId) {
      lesson = new GlideRecordSecure(this.TABLE_LESSON);
      if (lesson.get(lessonId)) {
        thresholds.minAccuracy = this._number(lesson.getValue('min_accuracy'), 90);
        thresholds.targetNetWpm = this._number(
          lesson.getValue('target_net_wpm'),
          0
        );
      }
    }
    return thresholds;
  },

  /** Limits a query to attempts with the same lesson, duration or passage. */
  _addSameTarget: function _addSameTarget(query, attempt) {
    var mode = attempt.getValue('mode');
    query.addQuery('user', attempt.getValue('user'));
    query.addQuery('mode', mode);
    if (mode === 'lesson') {
      query.addQuery('lesson', attempt.getValue('lesson'));
    } else if (mode === 'speed_test') {
      query.addQuery('duration_seconds', attempt.getValue('duration_seconds'));
    } else {
      query.addQuery('custom_passage', attempt.getValue('custom_passage'));
    }
  },

  /**
   * C4.3 personal best: at least one earlier completed, unflagged attempt
   * for the same target exists, and netWpm beats the highest of them.
   */
  _beatsBest: function _beatsBest(attempt, netWpm) {
    var ga = new GlideAggregate(this.TABLE_ATTEMPT);
    var count;
    var max;
    this._addSameTarget(ga, attempt);
    ga.addQuery('state', 'completed');
    ga.addQuery('flagged', false);
    ga.addQuery('sys_id', '!=', attempt.getUniqueValue());
    ga.addAggregate('COUNT');
    ga.addAggregate('MAX', 'net_wpm');
    ga.setGroup(false);
    ga.query();
    if (!ga.next()) {
      return false;
    }
    count = parseInt(ga.getAggregate('COUNT'), 10) || 0;
    max = this._number(ga.getAggregate('MAX', 'net_wpm'), 0);
    return count > 0 && netWpm > max;
  },

  /** The most recent earlier completed, unflagged attempt for the same target. */
  _previousAttempt: function _previousAttempt(attempt, before) {
    var gr = new GlideRecordSecure(this.TABLE_ATTEMPT);
    this._addSameTarget(gr, attempt);
    gr.addQuery('state', 'completed');
    gr.addQuery('flagged', false);
    gr.addQuery('sys_id', '!=', attempt.getUniqueValue());
    if (before) {
      gr.addQuery('completed_on', '<', before);
    }
    gr.orderByDesc('completed_on');
    gr.setLimit(1);
    gr.query();
    if (!gr.next()) {
      return null;
    }
    return {
      netWpm: this._number(gr.getValue('net_wpm'), 0),
      grossWpm: this._number(gr.getValue('gross_wpm'), 0),
      accuracy: this._number(gr.getValue('accuracy'), 0),
      errors: this._number(gr.getValue('errors'), 0)
    };
  },

  _weakKeys: function _weakKeys(perKey) {
    var list = Object.keys(perKey)
      .filter(function hasMisses(key) {
        return perKey[key].misses > 0;
      })
      .map(function toEntry(key) {
        return { key: key, misses: perKey[key].misses };
      });
    list.sort(function byMissesThenKey(a, b) {
      return b.misses - a.misses || (a.key < b.key ? -1 : 1);
    });
    return list.slice(0, this.WEAK_KEY_LIMIT);
  },

  _buildResult: function _buildResult(attempt, stored, extra) {
    var coach = this.chooseCoach(stored, {
      mode: extra.mode,
      minAccuracy: extra.thresholds.minAccuracy,
      targetNetWpm: extra.thresholds.targetNetWpm
    });
    return {
      state: 'completed',
      mode: extra.mode,
      title: attempt.getValue('passage_title') || '',
      durationSeconds:
        extra.mode === 'speed_test'
          ? this._number(attempt.getValue('duration_seconds'), 0)
          : null,
      completedOn: attempt.getDisplayValue('completed_on') || '',
      grossWpm: stored.grossWpm,
      netWpm: stored.netWpm,
      accuracy: stored.accuracy,
      errors: stored.errors,
      elapsedMs: stored.elapsedMs,
      passed: stored.passed,
      personalBest: stored.personalBest,
      flagged: stored.flagged,
      minAccuracy: extra.thresholds.minAccuracy,
      targetNetWpm: extra.thresholds.targetNetWpm,
      previous: extra.previous,
      weakKeys: extra.weakKeys,
      coach: coach,
      nextLessonId: extra.next.nextLessonId,
      nextLessonUnlocked: extra.next.nextLessonUnlocked,
      profileWpm: extra.profileWpm
    };
  },

  _randomPassage: function _randomPassage() {
    var ga = new GlideAggregate(this.TABLE_PASSAGE);
    var count;
    var pick;
    var gr;
    var chosen;
    // Scoped GlideAggregate has no addActiveQuery().
    ga.addQuery('active', true);
    ga.addAggregate('COUNT');
    ga.query();
    count = ga.next() ? parseInt(ga.getAggregate('COUNT'), 10) || 0 : 0;
    if (count === 0) {
      return null;
    }
    pick = Math.floor(Math.random() * count);
    gr = new GlideRecordSecure(this.TABLE_PASSAGE);
    gr.addActiveQuery();
    gr.orderBy('sys_id');
    gr.setLimit(pick + 1);
    gr.query();
    chosen = null;
    while (gr.next()) {
      chosen = { title: gr.getValue('title') || '', text: gr.getValue('text') || '' };
    }
    return chosen;
  },

  /** Limits a query to the user's completed attempts in a mode, or 'all'. */
  _addCompleted: function _addCompleted(query, userId, mode) {
    query.addQuery('user', userId);
    query.addQuery('state', 'completed');
    if (mode !== 'all') {
      query.addQuery('mode', mode);
    }
  },

  /** Per-key hits, misses and miss rate over the user's last 20 scored attempts. */
  _recentKeyStats: function _recentKeyStats(userId) {
    var ids = [];
    var gr = new GlideRecordSecure(this.TABLE_ATTEMPT);
    var keys;
    var ga;
    var hits;
    var misses;
    var total;
    this._addCompleted(gr, userId, 'all');
    gr.addQuery('flagged', false);
    gr.orderByDesc('completed_on');
    gr.setLimit(this.HISTORY.weakKeyWindow);
    gr.query();
    while (gr.next()) {
      ids.push(gr.getUniqueValue());
    }
    if (!ids.length) {
      return [];
    }
    keys = [];
    ga = new GlideAggregate(this.TABLE_ATTEMPT_KEY);
    ga.addQuery('user', userId);
    ga.addQuery('attempt', 'IN', ids.join(','));
    ga.addAggregate('SUM', 'hits');
    ga.addAggregate('SUM', 'misses');
    ga.groupBy('key_char');
    ga.query();
    while (ga.next()) {
      hits = parseInt(ga.getAggregate('SUM', 'hits'), 10) || 0;
      misses = parseInt(ga.getAggregate('SUM', 'misses'), 10) || 0;
      total = hits + misses;
      keys.push({
        key: ga.getValue('key_char'),
        hits: hits,
        misses: misses,
        missRate: total ? Math.round((misses / total) * 1000) / 1000 : 0
      });
    }
    return keys;
  },

  _countCustom: function _countCustom(userId) {
    var ga = new GlideAggregate(this.TABLE_CUSTOM);
    ga.addQuery('user', userId);
    ga.addAggregate('COUNT');
    ga.query();
    return ga.next() ? parseInt(ga.getAggregate('COUNT'), 10) || 0 : 0;
  },

  /** A custom-passage action the form reports, optionally against one field. */
  _actionError: function _actionError(message, field) {
    var outcome = { actionStatus: 'error', actionMessage: message };
    if (field) {
      outcome.actionField = field;
    }
    return outcome;
  },

  /** The action outcome together with the refreshed passage list (C5.3). */
  _withCustomList: function _withCustomList(outcome) {
    var state = this.getCustomPassages();
    Object.keys(outcome).forEach(function copyField(key) {
      state[key] = outcome[key];
    });
    return state;
  },

  _abandonInProgress: function _abandonInProgress(userId) {
    // System write: players have no write ACL on attempts (A2.4). This only
    // touches the caller's own in-progress rows (B8 #9).
    var gr = new GlideRecord(this.TABLE_ATTEMPT);
    gr.addQuery('user', userId);
    gr.addQuery('state', 'in_progress');
    gr.setLimit(100);
    gr.query();
    while (gr.next()) {
      gr.setValue('state', 'abandoned');
      gr.update();
    }
  },

  _setAttemptState: function _setAttemptState(attemptId, state) {
    // System write: players have no write ACL on attempts (A2.4). Callers
    // verify ownership and in-progress state before calling.
    var gr = new GlideRecord(this.TABLE_ATTEMPT);
    if (gr.get(attemptId)) {
      gr.setValue('state', state);
      gr.update();
    }
  },

  _writeAttemptKeys: function _writeAttemptKeys(attemptId, userId, perKey) {
    // System write: players have no create ACL on attempt keys (C3). Rows are
    // derived from the verified replay of the caller's own attempt.
    Object.keys(perKey).forEach(function writeKey(key) {
      var row = new GlideRecord(this.TABLE_ATTEMPT_KEY);
      row.initialize();
      row.setValue('attempt', attemptId);
      row.setValue('user', userId);
      row.setValue('key_char', key);
      row.setValue('hits', perKey[key].hits);
      row.setValue('misses', perKey[key].misses);
      row.insert();
    }, this);
  },

  /** C2.2: latest/best WPM on the session user's own profile. */
  _updateProfileWpm: function _updateProfileWpm(grossWpm) {
    var wpm;
    var user;
    var best;
    var isNewBest;
    try {
      // System write: players have no write ACL on these columns (C3).
      // Ownership, mode, timer and flag were verified by the caller.
      // setWorkflow(false) keeps platform sys_user business rules (LDAP,
      // identity sync, etc.) from running for a game stat. autoSysFields(false)
      // leaves sys_updated_on untouched so user sync integrations don't see a
      // profile change.
      wpm = Math.round(grossWpm);
      user = new GlideRecord('sys_user');
      if (!user.get(gs.getUserID())) {
        throw new Error('user not found');
      }
      best = user.getValue('x_snc_ttt_words_per_minute_best');
      isNewBest = best === null || best === '' || wpm > parseInt(best, 10);
      user.setValue('x_snc_ttt_words_per_minute_latest', wpm);
      if (isNewBest) {
        user.setValue('x_snc_ttt_words_per_minute_best', wpm);
      }
      user.setWorkflow(false);
      user.autoSysFields(false);
      if (!user.update()) {
        throw new Error('update failed');
      }
      return {
        saved: true,
        latest: wpm,
        best: isNewBest ? wpm : parseInt(best, 10),
        isNewBest: isNewBest
      };
    } catch (e) {
      gs.error('WpmAttemptService: profile WPM update failed');
      return {
        saved: false, latest: null, best: null, isNewBest: null
      };
    }
  },

  type: 'WpmAttemptService'
};
