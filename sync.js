(function () {
  const auth = window.vectorLabAuth;
  const progress = window.vectorLabProgress;
  const client = auth?.client;
  const statusElement = document.getElementById("authSyncStatus");
  let activeUser = null;
  let syncTimer = null;
  let syncing = false;
  let pendingSync = false;
  let applyingRemote = false;

  function setStatus(text, state = "") {
    if (!statusElement) return;
    statusElement.textContent = text;
    statusElement.dataset.state = state;
  }

  function itemFromRow(row) {
    return {
      type: row.item_type,
      attempts: row.attempts,
      correctAttempts: row.correct_attempts,
      correct: row.completed,
      firstAttemptCorrect: row.first_attempt_correct,
      solvedWithoutHelp: row.solved_without_help,
      hintsUsed: row.hints_used,
      solutionsViewed: row.solutions_viewed,
      lastAnswer: row.last_answer,
      selectedIndex: row.selected_index,
      lastCorrect: row.last_correct,
      updatedAt: row.updated_at
    };
  }

  function itemToRow(userId, itemId, item) {
    return {
      user_id: userId,
      item_id: itemId,
      item_type: item.type,
      attempts: item.attempts || 0,
      correct_attempts: item.correctAttempts || 0,
      completed: Boolean(item.correct),
      first_attempt_correct: Boolean(item.firstAttemptCorrect),
      solved_without_help: Boolean(item.solvedWithoutHelp),
      hints_used: item.hintsUsed || 0,
      solutions_viewed: item.solutionsViewed || 0,
      last_answer: item.lastAnswer ?? null,
      selected_index: Number.isInteger(item.selectedIndex) ? item.selectedIndex : null,
      last_correct: typeof item.lastCorrect === "boolean" ? item.lastCorrect : null,
      updated_at: item.updatedAt || new Date().toISOString()
    };
  }

  async function downloadSnapshot(userId) {
    const [progressResult, sessionsResult, daysResult] = await Promise.all([
      client.from("learning_progress").select("*").eq("user_id", userId),
      client.from("study_sessions").select("*").eq("user_id", userId),
      client.from("daily_engagement").select("*").eq("user_id", userId)
    ]);
    const error = progressResult.error || sessionsResult.error || daysResult.error;
    if (error) throw error;

    const items = {};
    progressResult.data.forEach((row) => {
      items[row.item_id] = itemFromRow(row);
    });
    const sessions = sessionsResult.data.map((row) => ({
      id: row.client_session_id,
      startedAt: row.started_at,
      lastActiveAt: row.last_active_at,
      activeSeconds: row.active_seconds
    }));
    const activeDays = {};
    daysResult.data.forEach((row) => {
      activeDays[row.activity_date] = row.active_seconds;
    });

    return {
      items,
      engagement: {
        sessions,
        activeDays,
        totalActiveSeconds: Object.values(activeDays).reduce((sum, seconds) => sum + seconds, 0)
      }
    };
  }

  async function uploadSnapshot(userId, snapshot) {
    const itemRows = Object.entries(snapshot.items || {}).map(([itemId, item]) =>
      itemToRow(userId, itemId, item)
    );
    const sessionRows = (snapshot.engagement?.sessions || []).map((session) => ({
      user_id: userId,
      client_session_id: session.id,
      started_at: session.startedAt,
      last_active_at: session.lastActiveAt,
      active_seconds: session.activeSeconds || 0
    }));
    const dayRows = Object.entries(snapshot.engagement?.activeDays || {}).map(([day, seconds]) => ({
      user_id: userId,
      activity_date: day,
      active_seconds: seconds || 0,
      updated_at: new Date().toISOString()
    }));

    const operations = [];
    if (itemRows.length) {
      operations.push(client.from("learning_progress").upsert(itemRows, {
        onConflict: "user_id,item_id"
      }));
    }
    if (sessionRows.length) {
      operations.push(client.from("study_sessions").upsert(sessionRows, {
        onConflict: "user_id,client_session_id"
      }));
    }
    if (dayRows.length) {
      operations.push(client.from("daily_engagement").upsert(dayRows, {
        onConflict: "user_id,activity_date"
      }));
    }

    const results = await Promise.all(operations);
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
  }

  async function synchronize() {
    if (!client || !activeUser || !navigator.onLine || syncing) {
      if (syncing) pendingSync = true;
      if (!navigator.onLine && activeUser) setStatus("Sin conexión", "offline");
      return;
    }

    syncing = true;
    setStatus("Sincronizando...", "working");
    try {
      const remote = await downloadSnapshot(activeUser.id);
      applyingRemote = true;
      progress.mergeSnapshot(remote);
      applyingRemote = false;
      await uploadSnapshot(activeUser.id, progress.getSnapshot());
      setStatus("Sincronizado", "success");
    } catch (error) {
      applyingRemote = false;
      console.warn("No se pudo sincronizar el progreso.", error);
      setStatus("Pendiente", "error");
    } finally {
      syncing = false;
      if (pendingSync) {
        pendingSync = false;
        scheduleSync(500);
      }
    }
  }

  function scheduleSync(delay = 1500) {
    if (!activeUser) return;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(synchronize, delay);
  }

  function handleSession(session) {
    activeUser = session?.user || null;
    window.clearTimeout(syncTimer);
    if (!activeUser) {
      setStatus("Sin cuenta", "");
      return;
    }
    scheduleSync(100);
  }

  window.addEventListener("vectorlab:auth-changed", (event) => {
    handleSession(event.detail?.session);
  });
  window.addEventListener("vectorlab:progress-changed", () => {
    if (!applyingRemote) scheduleSync();
  });
  window.addEventListener("online", () => scheduleSync(100));
  window.addEventListener("offline", () => {
    if (activeUser) setStatus("Sin conexión", "offline");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") scheduleSync(0);
  });

  handleSession(auth?.getSession?.());
})();
